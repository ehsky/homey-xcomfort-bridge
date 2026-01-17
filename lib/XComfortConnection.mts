import WebSocket from 'ws';
import forge from 'node-forge';
import crypto from 'node:crypto';
import {
  MESSAGE_TYPES,
  CLIENT_CONFIG,
  INFO_TEXT_CODES,
  PROTOCOL_CONFIG,
  type MessageTypeValue,
} from './XComfortProtocol.mjs';

/**
 * xComfort Bridge WebSocket Connection Handler
 *
 * Protocol implementation based on research and inspiration from:
 * https://github.com/jankrib/xcomfort-python (MIT License)
 *
 * Key insights from the Python implementation:
 * - ACK handling for messages with 'mc' fields
 * - AES-256-CBC encryption with RSA key exchange
 * - Message counter management and connection state handling
 */

// ============================================================================
// Type Definitions
// ============================================================================

/** Connection state values */
type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticating'
  | 'renewing'
  | 'token_renewed';

/** Device state listener callback */
type DeviceStateCallback = (
  deviceId: string,
  stateData: DeviceStateUpdate
) => void | Promise<void>;

/** Room state listener callback */
type RoomStateCallback = (
  roomId: string,
  stateData: RoomStateUpdate
) => void | Promise<void>;

/** Last message info for debugging */
interface LastMessageInfo {
  time: number | null;
  type: number | null;
  mc: number | null;
}

/** Protocol message structure */
interface ProtocolMessage {
  type_int: MessageTypeValue;
  mc?: number;
  ref?: number;
  payload?: Record<string, unknown>;
}

/** Device from xComfort Bridge */
interface XComfortDevice {
  deviceId: string;
  name: string;
  dimmable?: boolean;
  devType?: number;
  info?: InfoEntry[];
  [key: string]: unknown;
}

/** Room from xComfort Bridge */
interface XComfortRoom {
  roomId: string;
  name: string;
  devices?: unknown[];
  [key: string]: unknown;
}

/** Scene from xComfort Bridge */
interface XComfortScene {
  sceneId?: number;
  name?: string;
  devices?: unknown[];
  [key: string]: unknown;
}

/** Info entry for metadata */
interface InfoEntry {
  text: string;
  value: string | number;
}

/** Parsed metadata from info array */
interface DeviceMetadata {
  temperature?: number;
  humidity?: number;
}

/** Device state update payload */
interface DeviceStateUpdate {
  switch?: boolean;
  dimmvalue?: number;
  power?: number;
  curstate?: unknown;
  metadata?: DeviceMetadata;
}

/** Room state update payload */
interface RoomStateUpdate {
  switch?: boolean;
  dimmvalue?: number;
  lightsOn?: number;
  loadsOn?: number;
  windowsOpen?: number;
  doorsOpen?: number;
  presence?: number;
  shadsClosed?: number;
  power?: number;
  errorState?: unknown;
}

/** State update item from bridge */
interface StateUpdateItem {
  deviceId?: string;
  roomId?: string;
  switch?: boolean;
  dimmvalue?: number;
  power?: number;
  curstate?: unknown;
  info?: InfoEntry[];
  lightsOn?: number;
  loadsOn?: number;
  windowsOpen?: number;
  doorsOpen?: number;
  presence?: number;
  shadsClosed?: number;
  errorState?: unknown;
}

/** Home data from bridge */
interface HomeData {
  name?: string;
  [key: string]: unknown;
}

// ============================================================================
// XComfortConnection Class
// ============================================================================

class XComfortConnection {
  private bridgeIp: string;
  private authKey: string;
  private ws: WebSocket | null = null;
  private devices: Map<string, XComfortDevice> = new Map();
  private rooms: Map<string, XComfortRoom> = new Map();

  // Connection state
  private deviceId: string | null = null;
  private connectionId: string | null = null;
  private aesKey: Buffer | null = null;
  private aesIv: Buffer | null = null;
  private token: string | null = null;
  private publicKey: forge.pki.rsa.PublicKey | null = null;
  private mc: number = 0;
  private connectionState: ConnectionState = 'disconnected';
  private deviceListReceived: boolean = false;
  private pendingAcks: Map<number, boolean> = new Map();
  private connectionEstablished: boolean = false;
  private reconnecting: boolean = false;

  // Event listeners
  private deviceStateListeners: Map<string, DeviceStateCallback[]> = new Map();
  private roomStateListeners: Map<string, RoomStateCallback[]> = new Map();

  // Intervals and timeouts
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  // Regex and state
  private base64regex: RegExp = /^[A-Za-z0-9+/=]+$/;
  private lastMessageInfo: LastMessageInfo = {
    time: null,
    type: null,
    mc: null,
  };

  // Home and scene data
  private homeData: HomeData | null = null;
  private detailedScenes: XComfortScene[] = [];

  constructor(bridgeIp: string, authKey: string) {
    this.bridgeIp = bridgeIp;
    this.authKey = authKey;
  }

  async init(): Promise<void> {
    if (!this.bridgeIp || !this.authKey) {
      throw new Error('Bridge IP and auth key are required');
    }

    console.log(`[XComfort] Connecting to bridge at ${this.bridgeIp}`);
    return this.connect();
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        let connectPromiseSettled = false;

        // Disable perMessageDeflate compression for simpler/faster framing
        this.ws = new WebSocket(`ws://${this.bridgeIp}`, {
          perMessageDeflate: false,
        });

        this.ws.on('open', () => {
          console.log('[XComfort] WebSocket connected, awaiting handshake...');

          // Set TCP_NODELAY to disable Nagle's algorithm
          const socket = (this.ws as unknown as { _socket?: { setNoDelay: (v: boolean) => void } })._socket;
          if (socket) {
            socket.setNoDelay(true);
            console.log('[XComfort] TCP_NODELAY enabled');
          }
        });

        this.ws.on('message', (data: Buffer) => {
          const rawRecvTime = Date.now();
          console.log(
            `[XComfort] RAW MSG at ${rawRecvTime}, size=${data.length}`
          );
          try {
            this.handleMessage(data, rawRecvTime);
          } catch (err) {
            console.error('[XComfort] Message handling error:', err);
          }
        });

        this.ws.on('error', (err: Error) => {
          console.error('[XComfort] WebSocket error:', err);
          if (!connectPromiseSettled) {
            connectPromiseSettled = true;
            reject(err);
          }
        });

        this.ws.on('unexpected-response', (_req, res) => {
          console.error(
            `[XComfort] Unexpected WebSocket response: ${res.statusCode}`
          );
        });

        this.ws.on('ping', () => {
          console.log('[XComfort] Received WebSocket ping frame');
        });

        this.ws.on('pong', () => {
          console.log('[XComfort] Received WebSocket pong frame');
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.connectionState = 'disconnected';

          const closeTime = Date.now();
          const timeSinceLastMsg = this.lastMessageInfo.time
            ? closeTime - this.lastMessageInfo.time
            : 'N/A';
          console.log(
            `[XComfort] Connection closed at ${closeTime}. Code: ${code}, Reason: ${reason.toString() || 'No reason'}`
          );
          console.log(
            `[XComfort] Last message: type=${this.lastMessageInfo.type}, mc=${this.lastMessageInfo.mc}, ${timeSinceLastMsg}ms ago`
          );

          if (!connectPromiseSettled) {
            connectPromiseSettled = true;
            reject(new Error(`Connection closed before completing: code ${code}`));
            return;
          }

          if (this.connectionEstablished && !this.reconnecting) {
            this.reconnecting = true;
            console.log(
              '[XComfort] Connection lost. Attempting to reconnect in 5 seconds...'
            );
            setTimeout(() => {
              this.reconnecting = false;
              this.connectionState = 'connecting';
              this.deviceListReceived = false;
              this.pendingAcks.clear();
              this.mc = 0;
              this.connect().catch((err) => {
                console.error(`[XComfort] Reconnection failed: ${err.message}`);
              });
            }, PROTOCOL_CONFIG.TIMEOUTS.RECONNECT_DELAY);
          } else if (!this.connectionEstablished) {
            console.log(
              '[XComfort] Initial connection failed - not auto-reconnecting'
            );
          }
        });

        // Resolve when we receive the device list
        const checkConnection = setInterval(() => {
          if (this.deviceListReceived) {
            clearInterval(checkConnection);
            if (!connectPromiseSettled) {
              connectPromiseSettled = true;
              this.connectionEstablished = true;
              resolve();
            }
          }
        }, 1000);

        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkConnection);
          if (!connectPromiseSettled) {
            connectPromiseSettled = true;
            console.log('[XComfort] Connection timeout - bridge not responding');
            if (this.ws) {
              this.ws.removeAllListeners();
              this.ws.on('error', () => {});
              this.ws.terminate();
              this.ws = null;
            }
            reject(new Error('Connection timeout - device list not received'));
          }
        }, PROTOCOL_CONFIG.TIMEOUTS.CONNECTION);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Helper: Generate random salt
  private generateSalt(
    length: number = PROTOCOL_CONFIG.LIMITS.SALT_LENGTH
  ): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Helper: Hash per Python code
  private hash(deviceId: string, authKey: string, salt: string): string {
    const h1 = crypto.createHash('sha256');
    h1.update(deviceId);
    h1.update(authKey);
    const inner = h1.digest('hex');
    const h2 = crypto.createHash('sha256');
    h2.update(salt);
    h2.update(inner);
    return h2.digest('hex');
  }

  // Helper: Pad message with null bytes for AES block size
  private padToBlockSize(str: string): Buffer {
    const buf = Buffer.from(str, 'utf8');
    const blockSize = PROTOCOL_CONFIG.ENCRYPTION.BLOCK_SIZE;
    const pad = blockSize - (buf.length % blockSize);
    const padded = Buffer.alloc(buf.length + pad, 0);
    buf.copy(padded);
    return padded;
  }

  // Helper: AES encrypt and base64 encode
  private encryptAES256CBC(jsonObj: Record<string, unknown>): string {
    if (!this.aesKey || !this.aesIv) {
      throw new Error('Encryption keys not initialized');
    }
    const msgStr = JSON.stringify(jsonObj);
    const padded = this.padToBlockSize(msgStr);
    const cipher = crypto.createCipheriv(
      PROTOCOL_CONFIG.ENCRYPTION.ALGORITHM,
      this.aesKey,
      this.aesIv
    );
    cipher.setAutoPadding(false);
    let encrypted = cipher.update(padded);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString('base64') + '\u0004';
  }

  // Helper to send encrypted messages
  private sendEncrypted(
    jsonObj: Record<string, unknown>,
    callback?: (err?: Error) => void
  ): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[XComfort] Cannot send message - WebSocket not open');
      if (callback) callback(new Error('WebSocket not open'));
      return false;
    }
    try {
      const data = this.encryptAES256CBC(jsonObj);
      console.log(
        `[XComfort] SEND type=${jsonObj.type_int} mc=${jsonObj.mc ?? 'N/A'} ref=${jsonObj.ref ?? 'N/A'} payload=${JSON.stringify(jsonObj.payload ?? {})}`
      );
      if (callback) {
        this.ws.send(data, callback);
      } else {
        this.ws.send(data);
      }
      return true;
    } catch (error) {
      console.error('[XComfort] Failed to send encrypted message:', error);
      if (callback) callback(error as Error);
      return false;
    }
  }

  // Async version that awaits the send callback
  private sendEncryptedAsync(jsonObj: Record<string, unknown>): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.error('[XComfort] Cannot send message - WebSocket not open');
        reject(new Error('WebSocket not open'));
        return;
      }
      try {
        const data = this.encryptAES256CBC(jsonObj);
        this.ws.send(data, (err) => {
          if (err) {
            console.error('[XComfort] Failed to send encrypted message:', err);
            reject(err);
          } else {
            resolve(true);
          }
        });
      } catch (error) {
        console.error('[XComfort] Failed to send encrypted message:', error);
        reject(error);
      }
    });
  }

  // Helper: Validate connection state for commands
  private _isConnected(): boolean {
    return !!(this.aesKey && this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  /**
   * Helper method to validate connection state
   * @throws {Error} If connection is not ready
   */
  private _requireConnection(): void {
    if (!this._isConnected()) {
      throw new Error(
        'xComfort Bridge not connected. Command will be retried when connection is restored.'
      );
    }
  }

  /**
   * Helper method to send encrypted device control commands
   */
  private _sendDeviceCommand(
    messageType: MessageTypeValue,
    payload: Record<string, unknown>,
    action: string
  ): boolean {
    console.log(`[XComfort] ${action} called:`, payload);

    const message: Record<string, unknown> = {
      type_int: messageType,
      mc: this.nextMc(),
      payload: payload,
    };

    console.log(`[XComfort] Sending ${action.toLowerCase()} command:`, message);
    const result = this.sendEncrypted(message);
    console.log(`[XComfort] ${action} command sent, result: ${result}`);

    return result;
  }

  // Message counter
  private nextMc(): number {
    return ++this.mc;
  }

  // Add device state listener
  addDeviceStateListener(deviceId: string, callback: DeviceStateCallback): void {
    if (!this.deviceStateListeners.has(deviceId)) {
      this.deviceStateListeners.set(deviceId, []);
    }
    this.deviceStateListeners.get(deviceId)!.push(callback);
    console.log(`[XComfort] Added state listener for device ${deviceId}`);
  }

  // Add room state listener
  addRoomStateListener(roomId: string, callback: RoomStateCallback): void {
    if (!this.roomStateListeners.has(roomId)) {
      this.roomStateListeners.set(roomId, []);
    }
    this.roomStateListeners.get(roomId)!.push(callback);
    console.log(`[XComfort] Added state listener for room ${roomId}`);
  }

  // Trigger device state listeners (non-blocking via setImmediate)
  private triggerDeviceStateListeners(
    deviceId: string,
    stateData: DeviceStateUpdate
  ): void {
    if (this.deviceStateListeners.has(deviceId)) {
      const listeners = this.deviceStateListeners.get(deviceId)!;
      listeners.forEach((callback) => {
        setImmediate(() => {
          try {
            callback(deviceId, stateData);
          } catch (error) {
            console.error(
              `[XComfort] Error in device state listener for device ${deviceId}:`,
              error
            );
          }
        });
      });
    }
  }

  // Trigger room state listeners (non-blocking via setImmediate)
  private triggerRoomStateListeners(
    roomId: string,
    stateData: RoomStateUpdate
  ): void {
    if (this.roomStateListeners.has(roomId)) {
      const listeners = this.roomStateListeners.get(roomId)!;
      listeners.forEach((callback) => {
        setImmediate(() => {
          try {
            callback(roomId, stateData);
          } catch (error) {
            console.error(
              `[XComfort] Error in room state listener for room ${roomId}:`,
              error
            );
          }
        });
      });
    }
  }

  // Message handler - designed to return as fast as possible
  private handleMessage(data: Buffer, rawRecvTime: number): void {
    let rawStr = data.toString();
    if (rawStr.endsWith('\u0004')) rawStr = rawStr.slice(0, -1);

    // Try JSON first (unencrypted handshake)
    try {
      const msg = JSON.parse(rawStr) as ProtocolMessage;
      this.handleUnencryptedMessage(msg);
      return;
    } catch {
      // Not JSON, check for encrypted
    }

    // Handle encrypted messages
    if (this.aesKey && this.aesIv && this.base64regex.test(rawStr)) {
      try {
        const decrypted = this.decryptMessageSync(rawStr);
        const msg = JSON.parse(decrypted) as ProtocolMessage;
        this.handleEncryptedMessage(msg, rawRecvTime);
      } catch (e) {
        console.error('[XComfort] Failed to decrypt/parse message:', e);
        console.error('[XComfort] Raw data length:', rawStr.length);
      }
    } else if (this.aesKey) {
      console.warn(
        '[XComfort] Received non-encrypted data after handshake:',
        rawStr.substring(0, 100)
      );
    }
  }

  // Synchronous decryption for minimal message handler latency
  private decryptMessageSync(rawStr: string): string {
    if (!this.aesKey || !this.aesIv) {
      throw new Error('Decryption keys not initialized');
    }
    let encryptedBuf = Buffer.from(rawStr, 'base64');
    const paddedLength = Math.ceil(encryptedBuf.length / 16) * 16;
    if (encryptedBuf.length < paddedLength) {
      const oldBuf = encryptedBuf;
      encryptedBuf = Buffer.alloc(paddedLength, 0);
      oldBuf.copy(encryptedBuf);
    }

    const decipher = crypto.createDecipheriv(
      PROTOCOL_CONFIG.ENCRYPTION.ALGORITHM,
      this.aesKey,
      this.aesIv
    );
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuf),
      decipher.final(),
    ]);
    return decrypted.toString('utf8').replace(/\x00+$/, '');
  }

  // Keep async version for compatibility
  async decryptMessage(rawStr: string): Promise<string> {
    return this.decryptMessageSync(rawStr);
  }

  private handleUnencryptedMessage(msg: ProtocolMessage): void {
    if (msg.type_int === MESSAGE_TYPES.CONNECTION_START) {
      const payload = msg.payload as { device_id: string; connection_id: string };
      this.deviceId = payload.device_id;
      this.connectionId = payload.connection_id;
      console.log(
        `[XComfort] CONNECTION_START received. deviceId=${this.deviceId}`
      );

      const confirmMsg = {
        type_int: MESSAGE_TYPES.CONNECTION_CONFIRM,
        mc: this.nextMc(),
        payload: {
          client_type: CLIENT_CONFIG.TYPE,
          client_id: CLIENT_CONFIG.ID,
          client_version: CLIENT_CONFIG.VERSION,
          connection_id: this.connectionId,
        },
      };
      this.ws!.send(JSON.stringify(confirmMsg));
      console.log('[XComfort] Sent CONNECTION_CONFIRM');
    } else if (msg.type_int === MESSAGE_TYPES.SC_INIT_RESPONSE) {
      const initMsg = { type_int: MESSAGE_TYPES.SC_INIT_REQUEST, mc: this.nextMc() };
      this.ws!.send(JSON.stringify(initMsg));
      console.log('[XComfort] Sent SC_INIT');
    } else if (msg.type_int === MESSAGE_TYPES.SC_INIT_REQUEST) {
      const initMsg = { type_int: MESSAGE_TYPES.SC_INIT_REQUEST, mc: this.nextMc() };
      this.ws!.send(JSON.stringify(initMsg));
      console.log('[XComfort] Requested public key');
    } else if (msg.type_int === MESSAGE_TYPES.PUBLIC_KEY_RESPONSE) {
      const payload = msg.payload as { public_key: string };
      this.publicKey = forge.pki.publicKeyFromPem(payload.public_key);
      console.log('[XComfort] Received public key');

      this.aesKey = crypto.randomBytes(PROTOCOL_CONFIG.ENCRYPTION.KEY_SIZE);
      this.aesIv = crypto.randomBytes(PROTOCOL_CONFIG.ENCRYPTION.IV_SIZE);
      const secretStr =
        this.aesKey.toString('hex') + ':::' + this.aesIv.toString('hex');

      const encrypted = this.publicKey.encrypt(
        secretStr,
        PROTOCOL_CONFIG.ENCRYPTION.RSA_SCHEME
      );
      const secret = Buffer.from(encrypted, 'binary').toString('base64');
      const secretMsg = {
        type_int: MESSAGE_TYPES.SECRET_EXCHANGE,
        mc: this.nextMc(),
        payload: { secret },
      };
      this.ws!.send(JSON.stringify(secretMsg));
      console.log('[XComfort] Sent encrypted AES keys');
    }
  }

  private handleEncryptedMessage(
    msg: ProtocolMessage,
    rawRecvTime: number = Date.now()
  ): void {
    const startTime = Date.now();
    const decryptTime = startTime - rawRecvTime;
    this.lastMessageInfo = {
      time: startTime,
      type: msg.type_int,
      mc: msg.mc ?? null,
    };

    const msgSize = JSON.stringify(msg).length;
    console.log(
      `[XComfort] MSG SIZE: ${msgSize} bytes, type=${msg.type_int} decrypt=${decryptTime}ms`
    );

    // ACK IMMEDIATELY for ALL messages with 'mc' field
    if (msg.mc !== undefined) {
      const ackMsg = {
        type_int: MESSAGE_TYPES.ACK,
        ref: msg.mc,
      };

      setImmediate(() => {
        try {
          const preEncrypt = Date.now();
          const data = this.encryptAES256CBC(ackMsg);
          const postEncrypt = Date.now();
          this.ws!.send(data, { fin: true }, (err) => {
            if (err) {
              console.error(
                `[XComfort] ACK send error for mc=${msg.mc}:`,
                err
              );
            } else {
              console.log(`[XComfort] >> ACK mc=${msg.mc} FLUSHED at ${Date.now()}`);
            }
          });
          const postSend = Date.now();
          console.log(
            `[XComfort] >> ACK mc=${msg.mc} encrypt=${postEncrypt - preEncrypt}ms queue=${postSend - postEncrypt}ms fromRaw=${postSend - rawRecvTime}ms`
          );
        } catch (err) {
          console.error(`[XComfort] Failed to send ACK for mc=${msg.mc}:`, err);
        }
      });
    }

    console.log(
      `[XComfort] << RECV type=${msg.type_int}${msg.mc !== undefined ? ` mc=${msg.mc}` : ''}${msg.ref !== undefined ? ` ref=${msg.ref}` : ''} T+${Date.now() - startTime}ms`
    );

    // Queue message for processing
    process.nextTick(() => {
      this._processMessage(msg).catch((err) => {
        console.error('[XComfort] Message processing error:', err);
      });
    });
  }

  // Separated message processing - runs in next event loop tick
  private async _processMessage(msg: ProtocolMessage): Promise<void> {
    // Handle incoming ACK messages
    if (msg.type_int === MESSAGE_TYPES.ACK) {
      if (msg.ref) {
        console.log(`[XComfort] Received ACK for message ref: ${msg.ref}`);
        this.pendingAcks.delete(msg.ref);
      }
      return;
    }

    // Handle NACK
    if (msg.type_int === MESSAGE_TYPES.NACK) {
      console.error(`[XComfort] Received NACK for message ref: ${msg.ref}`);
      if (msg.payload) {
        console.error(`[XComfort] NACK details:`, JSON.stringify(msg.payload));
      }
      return;
    }

    // Handle HEARTBEAT responses
    if (msg.type_int === MESSAGE_TYPES.HEARTBEAT) {
      console.log('[XComfort] Heartbeat response received');
      return;
    }

    // Handle PING messages
    if (msg.type_int === MESSAGE_TYPES.PING) {
      console.log(
        `[XComfort] PING received - mc=${msg.mc} ref=${msg.ref} (already ACK'd if has mc)`
      );
      return;
    }

    // Handle SET_HOME_DATA
    if (msg.type_int === MESSAGE_TYPES.SET_HOME_DATA) {
      console.log('[XComfort] Received SET_HOME_DATA');
      if (msg.payload) {
        this.processHomeData(msg.payload);
      }
      return;
    }

    // Handle SET_BRIDGE_STATE
    if (msg.type_int === MESSAGE_TYPES.SET_BRIDGE_STATE) {
      return;
    }

    if (msg.type_int === MESSAGE_TYPES.SECRET_EXCHANGE_ACK) {
      const salt = this.generateSalt();
      const password = this.hash(this.deviceId!, this.authKey, salt);

      const loginMsg = {
        type_int: MESSAGE_TYPES.LOGIN_REQUEST,
        mc: this.nextMc(),
        payload: {
          username: 'default',
          password: password,
          salt: salt,
        },
      };
      this.sendEncrypted(loginMsg);
      console.log('[XComfort] Sent login');
    } else if (msg.type_int === MESSAGE_TYPES.LOGIN_RESPONSE) {
      const payload = msg.payload as { token: string };
      this.token = payload.token;
      console.log('[XComfort] Login successful, received token');

      const applyTokenMsg = {
        type_int: MESSAGE_TYPES.TOKEN_APPLY,
        mc: this.nextMc(),
        payload: { token: this.token },
      };
      this.sendEncrypted(applyTokenMsg);
    } else if (msg.type_int === MESSAGE_TYPES.TOKEN_APPLY_ACK) {
      if (this.connectionState !== 'token_renewed') {
        console.log('[XComfort] Token applied, renewing token...');
        this.connectionState = 'renewing';

        const renewTokenMsg = {
          type_int: MESSAGE_TYPES.TOKEN_RENEW,
          mc: this.nextMc(),
          payload: { token: this.token },
        };
        this.sendEncrypted(renewTokenMsg);
      } else {
        console.log('[XComfort] Fully authenticated with renewed token!');
        this.connectionState = 'connected';

        this.sendEncrypted({
          type_int: MESSAGE_TYPES.REQUEST_DEVICES,
          mc: this.nextMc(),
          payload: {},
        });
        this.sendEncrypted({
          type_int: MESSAGE_TYPES.REQUEST_ROOMS,
          mc: this.nextMc(),
          payload: {},
        });
        this.sendEncrypted({
          type_int: MESSAGE_TYPES.HEARTBEAT,
          mc: this.nextMc(),
          payload: {},
        });

        this.startHeartbeat();
      }
    } else if (msg.type_int === MESSAGE_TYPES.TOKEN_RENEW_RESPONSE) {
      const payload = msg.payload as { token: string };
      this.token = payload.token;
      console.log('[XComfort] Token renewed, applying new token...');
      this.connectionState = 'token_renewed';

      const applyNewTokenMsg = {
        type_int: MESSAGE_TYPES.TOKEN_APPLY,
        mc: this.nextMc(),
        payload: { token: this.token },
      };
      this.sendEncrypted(applyNewTokenMsg);
    } else if (msg.type_int === MESSAGE_TYPES.SET_ALL_DATA) {
      console.log('[XComfort] Received SET_ALL_DATA');
      this.processDeviceData(msg.payload as Record<string, unknown>);
    } else if (msg.type_int === MESSAGE_TYPES.STATE_UPDATE) {
      console.log('[XComfort] Device state update');
      this.processStateUpdate(msg.payload as { item?: StateUpdateItem[] });
    } else if (msg.type_int === MESSAGE_TYPES.ERROR_INFO) {
      const payload = msg.payload as { info?: string };
      console.log(`[XComfort] Error/Info response: ${payload?.info}`);
    } else {
      console.log(`[XComfort] Unhandled message type: ${msg.type_int}`);
    }
  }

  /**
   * Process SET_HOME_DATA (303) messages
   */
  private processHomeData(payload: Record<string, unknown>): void {
    if (payload.home) {
      this.homeData = payload.home as HomeData;
      console.log(
        `[XComfort] Home data stored: ${this.homeData.name || 'unnamed'}`
      );
    }

    if (payload.devices) {
      this.processDeviceData({ devices: payload.devices });
    }
    if (payload.rooms) {
      this.processDeviceData({ rooms: payload.rooms });
    }
    if (payload.scenes) {
      this.processDeviceData({ scenes: payload.scenes });
    }
  }

  private processDeviceData(payload: Record<string, unknown>): void {
    if (payload.devices) {
      const devices = payload.devices as XComfortDevice[];
      console.log(`[XComfort] Discovered ${devices.length} devices`);
      devices.forEach((device) => {
        this.devices.set(device.deviceId, device);
      });
    }

    if (payload.rooms) {
      const rooms = payload.rooms as XComfortRoom[];
      console.log(`[XComfort] Discovered ${rooms.length} rooms`);
      rooms.forEach((room) => {
        this.rooms.set(room.roomId, room);
      });
    }

    if (payload.scenes) {
      const scenes = payload.scenes as XComfortScene[];
      console.log(
        `[XComfort] Found ${scenes.length} scenes from bridge data`
      );
      this.setDetailedScenes(scenes);
    }

    if (payload.lastItem) {
      this.deviceListReceived = true;
      console.log('[XComfort] Device discovery complete!');
      console.log(
        '[XComfort] Waiting for device state changes to populate current states...'
      );
    }
  }

  private processStateUpdate(payload: { item?: StateUpdateItem[] }): void {
    try {
      const itemCount = payload?.item?.length ?? 0;
      console.log(`[XComfort] Processing state update with ${itemCount} items`);
      console.log(`[XComfort] STATE PAYLOAD: ${JSON.stringify(payload)}`);

      if (payload?.item) {
        const deviceUpdates = new Map<string, DeviceStateUpdate>();
        const roomUpdates = new Map<string, RoomStateUpdate>();

        payload.item.forEach((item) => {
          if (item.deviceId) {
            if (!deviceUpdates.has(item.deviceId)) {
              deviceUpdates.set(item.deviceId, {});
            }
            const deviceUpdate = deviceUpdates.get(item.deviceId)!;

            if (
              item.switch !== undefined ||
              item.dimmvalue !== undefined
            ) {
              deviceUpdate.switch = item.switch;
              deviceUpdate.dimmvalue = item.dimmvalue;
              deviceUpdate.power = item.power;
              deviceUpdate.curstate = item.curstate;
            } else if (item.info && Array.isArray(item.info)) {
              const metadata = this.parseInfoMetadata(item.info);
              if (Object.keys(metadata).length > 0) {
                deviceUpdate.metadata = metadata;
              }
            }
          } else if (item.roomId) {
            roomUpdates.set(item.roomId, {
              switch: item.switch,
              dimmvalue: item.dimmvalue,
              lightsOn: item.lightsOn,
              loadsOn: item.loadsOn,
              windowsOpen: item.windowsOpen,
              doorsOpen: item.doorsOpen,
              presence: item.presence,
              shadsClosed: item.shadsClosed,
              power: item.power,
              errorState: item.errorState,
            });
          }
        });

        deviceUpdates.forEach((updateData, deviceId) => {
          this.triggerDeviceStateListeners(deviceId, updateData);
        });

        roomUpdates.forEach((updateData, roomId) => {
          this.triggerRoomStateListeners(roomId, updateData);
        });
      }
    } catch (error) {
      console.error(`[XComfort] Error processing state update:`, error);
    }
  }

  // Parse known info metadata types
  parseInfoMetadata(infoArray: InfoEntry[]): DeviceMetadata {
    const metadata: DeviceMetadata = {};

    infoArray.forEach((info) => {
      if (info.text && info.value !== undefined) {
        switch (info.text) {
          case INFO_TEXT_CODES.TEMPERATURE_STANDARD:
            metadata.temperature = parseFloat(String(info.value));
            break;
          case INFO_TEXT_CODES.HUMIDITY_STANDARD:
            metadata.humidity = parseFloat(String(info.value));
            break;
          case INFO_TEXT_CODES.TEMPERATURE_DIMMER:
            metadata.temperature = parseFloat(String(info.value));
            break;
        }
      }
    });

    return metadata;
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (
        this.ws?.readyState === WebSocket.OPEN &&
        this.connectionState === 'connected'
      ) {
        this.sendEncrypted({
          type_int: MESSAGE_TYPES.HEARTBEAT,
          mc: this.nextMc(),
          payload: {},
        });
      }
    }, PROTOCOL_CONFIG.TIMEOUTS.HEARTBEAT);
  }

  // Cleanup method for proper resource management
  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Public API methods
  getDevices(): XComfortDevice[] {
    return Array.from(this.devices.values());
  }

  getRooms(): XComfortRoom[] {
    return Array.from(this.rooms.values());
  }

  getDevice(deviceId: string): XComfortDevice | undefined {
    return this.devices.get(deviceId);
  }

  getRoom(roomId: string): XComfortRoom | undefined {
    return this.rooms.get(roomId);
  }

  async switchDevice(deviceId: string, switchState: boolean): Promise<boolean> {
    if (!deviceId) {
      throw new Error('Device ID is required');
    }
    if (typeof switchState !== 'boolean') {
      throw new Error('Switch state must be a boolean');
    }

    this._requireConnection();

    return this._sendDeviceCommand(
      MESSAGE_TYPES.DEVICE_SWITCH,
      { deviceId: deviceId, switch: switchState },
      `switchDevice: deviceId=${deviceId}, switchState=${switchState}`
    );
  }

  async setDimmerValue(deviceId: string, dimmValue: number): Promise<boolean> {
    if (!deviceId) {
      throw new Error('Device ID is required');
    }
    if (typeof dimmValue !== 'number' || isNaN(dimmValue)) {
      throw new Error('Dimmer value must be a number');
    }

    this._requireConnection();

    dimmValue = Math.max(
      PROTOCOL_CONFIG.LIMITS.DIM_MIN,
      Math.min(PROTOCOL_CONFIG.LIMITS.DIM_MAX, dimmValue)
    );

    return this._sendDeviceCommand(
      MESSAGE_TYPES.DEVICE_DIM,
      { deviceId: deviceId, dimmvalue: dimmValue },
      `setDimmerValue: deviceId=${deviceId}, dimmValue=${dimmValue}`
    );
  }

  async controlRoom(
    roomId: string,
    action: 'switch' | 'dimm',
    value: boolean | number | null = null
  ): Promise<boolean> {
    this._requireConnection();

    let roomMsg: Record<string, unknown>;

    if (action === 'switch') {
      roomMsg = {
        type_int: MESSAGE_TYPES.ROOM_SWITCH,
        mc: this.nextMc(),
        payload: {
          roomId: roomId,
          switch: value,
        },
      };
    } else if (action === 'dimm' && value !== null) {
      const dimmValue = Math.max(
        PROTOCOL_CONFIG.LIMITS.DIM_MIN,
        Math.min(PROTOCOL_CONFIG.LIMITS.DIM_MAX, value as number)
      );
      roomMsg = {
        type_int: MESSAGE_TYPES.ROOM_DIM,
        mc: this.nextMc(),
        payload: {
          roomId: roomId,
          dimmvalue: dimmValue,
        },
      };
    } else {
      throw new Error(`Invalid room action: ${action}`);
    }

    return this.sendEncrypted(roomMsg);
  }

  async activateScene(sceneId: number): Promise<boolean> {
    if (sceneId === undefined && sceneId !== 0) {
      throw new Error('Scene ID is required');
    }
    if (typeof sceneId !== 'number' || sceneId < 0) {
      throw new Error('Scene ID must be a non-negative number');
    }

    this._requireConnection();

    return this._sendDeviceCommand(
      MESSAGE_TYPES.ACTIVATE_SCENE,
      { sceneId: sceneId },
      `activateScene: sceneId=${sceneId}`
    );
  }

  // Request current state info for all devices
  async requestDeviceStates(): Promise<boolean> {
    if (!this.aesKey || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[XComfort] Cannot request device states - not connected');
      return false;
    }

    console.log(
      '[XComfort] Requesting fresh device data for temperature updates...'
    );

    try {
      await this.sendEncryptedAsync({
        type_int: MESSAGE_TYPES.REQUEST_DEVICES,
        mc: this.nextMc(),
        payload: {},
      });
      await this.sendEncryptedAsync({
        type_int: MESSAGE_TYPES.REQUEST_ROOMS,
        mc: this.nextMc(),
        payload: {},
      });
      await this.sendEncryptedAsync({
        type_int: MESSAGE_TYPES.HEARTBEAT,
        mc: this.nextMc(),
        payload: {},
      });
      console.log('[XComfort] Sent complete state refresh sequence');
      return true;
    } catch (error) {
      console.log('[XComfort] Failed to send state refresh sequence:', error);
      return false;
    }
  }

  // Request info for all devices to refresh temperature data
  async refreshAllDeviceInfo(): Promise<boolean> {
    console.log(`[XComfort] Requesting fresh data...`);
    return this.requestDeviceStates();
  }

  /**
   * Get detailed scene data
   */
  getDetailedScenes(): XComfortScene[] {
    return this.detailedScenes;
  }

  /**
   * Store detailed scene data from SET_ALL_DATA payloads
   */
  setDetailedScenes(scenes: XComfortScene[]): void {
    this.detailedScenes = scenes;
    console.log(`[XComfort] Stored ${scenes.length} detailed scene objects`);
  }
}

export default XComfortConnection;
