import WebSocket from 'ws';
import forge from 'node-forge';
import crypto from 'node:crypto';
import { MESSAGE_TYPES, CLIENT_CONFIG, INFO_TEXT_CODES, PROTOCOL_CONFIG } from './XComfortProtocol.mjs';

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

class XComfortConnection {
  constructor(bridgeIp, authKey) {
    this.bridgeIp = bridgeIp;
    this.authKey = authKey;
    this.ws = null;
    this.devices = new Map();
    this.rooms = new Map();
    
    // Connection state
    this.deviceId = null;
    this.connectionId = null;
    this.aesKey = null;
    this.aesIv = null;
    this.token = null;
    this.publicKey = null;
    this.mc = 0;
    this.connectionState = 'disconnected';
    this.deviceListReceived = false;
    this.pendingAcks = new Map(); // Track pending ACKs for sent messages
    this.connectionEstablished = false; // Track if we ever successfully connected
    
    // Event listeners for device state changes
    this.deviceStateListeners = new Map();
    
    // Event listeners for room state changes
    this.roomStateListeners = new Map();
    
    // Heartbeat interval reference for cleanup
    this.heartbeatInterval = null;
    
    // WebSocket ping interval reference for cleanup
    this.pingInterval = null;
    
    // Base64 regex for encrypted message detection
    this.base64regex = /^[A-Za-z0-9+/=]+$/;
    this.lastMessageInfo = { time: null, type: null, mc: null };
  }

  async init() {
    if (!this.bridgeIp || !this.authKey) {
      throw new Error('Bridge IP and auth key are required');
    }
    
    console.log(`[XComfort] Connecting to bridge at ${this.bridgeIp}`);
    return this.connect();
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        let connectPromiseSettled = false;
        
        // Disable perMessageDeflate compression for simpler/faster framing
        // Some embedded devices don't handle compression well
        this.ws = new WebSocket(`ws://${this.bridgeIp}`, {
          perMessageDeflate: false
        });
        
        this.ws.on('open', () => {
          console.log('[XComfort] WebSocket connected, awaiting handshake...');
          
          // Set TCP_NODELAY to disable Nagle's algorithm
          // This ensures ACKs are sent immediately without buffering
          if (this.ws._socket) {
            this.ws._socket.setNoDelay(true);
            console.log('[XComfort] TCP_NODELAY enabled');
          }
          
          // Note: We do NOT use WebSocket-level ping frames.
          // The xComfort bridge uses its own protocol-level ping (type=3)
          // which we handle by responding with PONG. Adding WebSocket pings
          // may interfere with the bridge's connection management.
        });
        
        this.ws.on('message', (data) => {
          const rawRecvTime = Date.now();
          console.log(`[XComfort] RAW MSG at ${rawRecvTime}, size=${data.length}`);
          try {
            this.handleMessage(data, rawRecvTime);
          } catch (err) {
            console.error('[XComfort] Message handling error:', err);
          }
        });
        
        this.ws.on('error', (err) => {
          console.error('[XComfort] WebSocket error:', err);
          if (!connectPromiseSettled) {
            connectPromiseSettled = true;
            reject(err);
          }
        });
        
        // Log any unexpected WebSocket-level events for debugging
        this.ws.on('unexpected-response', (req, res) => {
          console.error(`[XComfort] Unexpected WebSocket response: ${res.statusCode}`);
        });
        
        this.ws.on('ping', (data) => {
          console.log('[XComfort] Received WebSocket ping frame');
        });
        
        this.ws.on('pong', (data) => {
          console.log('[XComfort] Received WebSocket pong frame');
        });
        
        this.ws.on('close', (code, reason) => {
          this.connectionState = 'disconnected';
          
          const closeTime = Date.now();
          const timeSinceLastMsg = this.lastMessageInfo.time ? closeTime - this.lastMessageInfo.time : 'N/A';
          console.log(`[XComfort] Connection closed at ${closeTime}. Code: ${code}, Reason: ${reason || 'No reason'}`);
          console.log(`[XComfort] Last message: type=${this.lastMessageInfo.type}, mc=${this.lastMessageInfo.mc}, ${timeSinceLastMsg}ms ago`);
          
          // If the promise hasn't been settled yet, reject it (connection failed before completing)
          if (!connectPromiseSettled) {
            connectPromiseSettled = true;
            reject(new Error(`Connection closed before completing: code ${code}`));
            // Don't auto-reconnect on initial connection failure
            return;
          }
          
          // Only auto-reconnect if we had previously connected successfully
          if (this.connectionEstablished && !this.reconnecting) {
            this.reconnecting = true;
            console.log('[XComfort] Connection lost. Attempting to reconnect in 5 seconds...');
            setTimeout(() => {
              this.reconnecting = false;
              this.connectionState = 'connecting';
              this.deviceListReceived = false; // Reset flag
              this.pendingAcks.clear(); // Clear pending ACKs
              this.mc = 0; // Reset message counter
              this.connect().catch(err => {
                console.error(`[XComfort] Reconnection failed: ${err.message}`);
              });
            }, PROTOCOL_CONFIG.TIMEOUTS.RECONNECT_DELAY);
          } else if (!this.connectionEstablished) {
            console.log('[XComfort] Initial connection failed - not auto-reconnecting');
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
            // Clean up the WebSocket to prevent lingering connections
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
  generateSalt(length = PROTOCOL_CONFIG.LIMITS.SALT_LENGTH) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Helper: Hash per Python code
  hash(deviceId, authKey, salt) {
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
  // NOTE: Python always pads to next block, even if already aligned
  // When length % blockSize == 0, Python adds a full block (16 bytes) of padding
  padToBlockSize(str) {
    const buf = Buffer.from(str, 'utf8');
    const blockSize = PROTOCOL_CONFIG.ENCRYPTION.BLOCK_SIZE;
    let pad = blockSize - (buf.length % blockSize);
    // Python: pad_size = AES.block_size - (length % AES.block_size)
    // This means when length % 16 == 0, pad_size = 16 (full block added)
    // Our old code returned early when pad == 0, which was wrong
    const padded = Buffer.alloc(buf.length + pad, 0);
    buf.copy(padded);
    return padded;
  }

  // Helper: AES encrypt and base64 encode
  encryptAES256CBC(jsonObj) {
    const msgStr = JSON.stringify(jsonObj);
    const padded = this.padToBlockSize(msgStr);
    const cipher = crypto.createCipheriv(PROTOCOL_CONFIG.ENCRYPTION.ALGORITHM, this.aesKey, this.aesIv);
    cipher.setAutoPadding(false);
    let encrypted = cipher.update(padded);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString('base64') + '\u0004';
  }

  // Helper to send encrypted messages (with optional callback for flush confirmation)
  sendEncrypted(jsonObj, callback = null) {
    if (this.ws.readyState !== this.ws.OPEN) {
      console.error('[XComfort] Cannot send message - WebSocket not open');
      if (callback) callback(new Error('WebSocket not open'));
      return false;
    }
    try {
      const data = this.encryptAES256CBC(jsonObj);
      // Log ALL outgoing messages for debugging with full payload
      console.log(`[XComfort] SEND type=${jsonObj.type_int} mc=${jsonObj.mc || 'N/A'} ref=${jsonObj.ref || 'N/A'} payload=${JSON.stringify(jsonObj.payload || {})}`);
      if (callback) {
        // Use callback to know when data is flushed to kernel buffer
        this.ws.send(data, callback);
      } else {
        this.ws.send(data);
      }
      return true;
    } catch (error) {
      console.error('[XComfort] Failed to send encrypted message:', error);
      if (callback) callback(error);
      return false;
    }
  }

  // Async version that awaits the send callback (matching Python's await self.send())
  sendEncryptedAsync(jsonObj) {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== this.ws.OPEN) {
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
  _isConnected() {
    return this.aesKey && this.ws && this.ws.readyState === this.ws.OPEN;
  }

  /**
   * Helper method to validate connection state
   * @throws {Error} If connection is not ready
   */
  _requireConnection() {
    if (!this._isConnected()) {
      throw new Error('xComfort Bridge not connected. Command will be retried when connection is restored.');
    }
  }

  /**
   * Helper method to create and send a protocol message
   * @param {number} type_int - Message type from MESSAGE_TYPES
   * @param {Object} payload - Message payload (optional)
   * @param {string} logMessage - Console log message (optional)
   */
  _sendMessage(type_int, payload = {}, logMessage = null) {
    const message = { type_int, mc: this.nextMc() };
    if (Object.keys(payload).length > 0) {
      message.payload = payload;
    }
    
    this.ws.send(JSON.stringify(message));
    
    if (logMessage) {
      console.log(`[XComfort] ${logMessage}`);
    }
  }

  /**
   * Helper method to send encrypted device control commands
   * @param {number} messageType - Message type from MESSAGE_TYPES
   * @param {Object} payload - Command payload
   * @param {string} action - Action description for logging
   */
  _sendDeviceCommand(messageType, payload, action) {
    console.log(`[XComfort] ${action} called:`, payload);
    
    const message = {
      type_int: messageType,
      mc: this.nextMc(),
      payload: payload
    };
    
    console.log(`[XComfort] Sending ${action.toLowerCase()} command:`, message);
    const result = this.sendEncrypted(message);
    console.log(`[XComfort] ${action} command sent, result: ${result}`);
    
    return result;
  }

  // Message counter
  nextMc() {
    return ++this.mc;
  }

  // Add device state listener
  addDeviceStateListener(deviceId, callback) {
    if (!this.deviceStateListeners.has(deviceId)) {
      this.deviceStateListeners.set(deviceId, []);
    }
    this.deviceStateListeners.get(deviceId).push(callback);
    console.log(`[XComfort] Added state listener for device ${deviceId}`);
  }



  // Add room state listener
  addRoomStateListener(roomId, callback) {
    if (!this.roomStateListeners.has(roomId)) {
      this.roomStateListeners.set(roomId, []);
    }
    this.roomStateListeners.get(roomId).push(callback);
    console.log(`[XComfort] Added state listener for room ${roomId}`);
  }



  // Trigger device state listeners (non-blocking via setImmediate)
  // This ensures message handling returns quickly and doesn't block the WebSocket
  triggerDeviceStateListeners(deviceId, stateData) {
    if (this.deviceStateListeners.has(deviceId)) {
      const listeners = this.deviceStateListeners.get(deviceId);
      listeners.forEach(callback => {
        // Defer callback to next event loop tick to not block message handling
        setImmediate(() => {
          try {
            callback(deviceId, stateData);
          } catch (error) {
            console.error(`[XComfort] Error in device state listener for device ${deviceId}:`, error);
          }
        });
      });
    }
  }

  // Trigger room state listeners (non-blocking via setImmediate)
  triggerRoomStateListeners(roomId, stateData) {
    if (this.roomStateListeners.has(roomId)) {
      const listeners = this.roomStateListeners.get(roomId);
      listeners.forEach(callback => {
        // Defer callback to next event loop tick to not block message handling
        setImmediate(() => {
          try {
            callback(roomId, stateData);
          } catch (error) {
            console.error(`[XComfort] Error in room state listener for room ${roomId}:`, error);
          }
        });
      });
    }
  }

  // Message handler - designed to return as fast as possible
  // ACK is sent synchronously, all processing is deferred
  handleMessage(data, rawRecvTime) {
    let rawStr = data.toString();
    if (rawStr.endsWith('\u0004')) rawStr = rawStr.slice(0, -1);

    // Try JSON first (unencrypted handshake)
    try {
      const msg = JSON.parse(rawStr);
      // Handshake messages need immediate handling
      this.handleUnencryptedMessage(msg);
      return;
    } catch (e) {
      // Not JSON, check for encrypted
    }

    // Handle encrypted messages
    if (this.aesKey && this.aesIv && this.base64regex.test(rawStr)) {
      try {
        const decrypted = this.decryptMessageSync(rawStr);
        const msg = JSON.parse(decrypted);
        this.handleEncryptedMessage(msg, rawRecvTime);
      } catch (e) {
        console.error('[XComfort] Failed to decrypt/parse message:', e);
        console.error('[XComfort] Raw data length:', rawStr.length);
      }
    } else if (this.aesKey) {
      // We have encryption set up but received non-base64 data
      console.warn('[XComfort] Received non-encrypted data after handshake:', rawStr.substring(0, 100));
    }
  }

  // Synchronous decryption for minimal message handler latency
  decryptMessageSync(rawStr) {
    let encryptedBuf = Buffer.from(rawStr, 'base64');
    const paddedLength = Math.ceil(encryptedBuf.length / 16) * 16;
    if (encryptedBuf.length < paddedLength) {
      const oldBuf = encryptedBuf;
      encryptedBuf = Buffer.alloc(paddedLength, 0);
      oldBuf.copy(encryptedBuf);
    }

    const decipher = crypto.createDecipheriv(PROTOCOL_CONFIG.ENCRYPTION.ALGORITHM, this.aesKey, this.aesIv);
    decipher.setAutoPadding(false);
    let decrypted = Buffer.concat([
      decipher.update(encryptedBuf),
      decipher.final(),
    ]);
    return decrypted.toString('utf8').replace(/\x00+$/, '');
  }

  // Keep async version for compatibility
  async decryptMessage(rawStr) {
    return this.decryptMessageSync(rawStr);
  }

  handleUnencryptedMessage(msg) {
    if (msg.type_int === MESSAGE_TYPES.CONNECTION_START) {
      this.deviceId = msg.payload.device_id;
      this.connectionId = msg.payload.connection_id;
      console.log(`[XComfort] CONNECTION_START received. deviceId=${this.deviceId}`);
      
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
      this.ws.send(JSON.stringify(confirmMsg));
      console.log('[XComfort] Sent CONNECTION_CONFIRM');
    } else if (msg.type_int === MESSAGE_TYPES.SC_INIT_RESPONSE) {
      this._sendMessage(MESSAGE_TYPES.SC_INIT_REQUEST, {}, 'Sent SC_INIT');
    } else if (msg.type_int === MESSAGE_TYPES.SC_INIT_REQUEST) {
      this._sendMessage(MESSAGE_TYPES.SC_INIT_REQUEST, undefined, 'Requested public key');
    } else if (msg.type_int === MESSAGE_TYPES.PUBLIC_KEY_RESPONSE) {
      this.publicKey = forge.pki.publicKeyFromPem(msg.payload.public_key);
      console.log('[XComfort] Received public key');
      
      this.aesKey = crypto.randomBytes(PROTOCOL_CONFIG.ENCRYPTION.KEY_SIZE);
      this.aesIv = crypto.randomBytes(PROTOCOL_CONFIG.ENCRYPTION.IV_SIZE);
      const secretStr = this.aesKey.toString('hex') + ':::' + this.aesIv.toString('hex');
      
      const encrypted = this.publicKey.encrypt(secretStr, PROTOCOL_CONFIG.ENCRYPTION.RSA_SCHEME);
      const secret = Buffer.from(encrypted, 'binary').toString('base64');
      const secretMsg = {
        type_int: MESSAGE_TYPES.SECRET_EXCHANGE,
        mc: this.nextMc(),
        payload: { secret },
      };
      this.ws.send(JSON.stringify(secretMsg));
      console.log('[XComfort] Sent encrypted AES keys');
    }
  }

  handleEncryptedMessage(msg, rawRecvTime = Date.now()) {
    const startTime = Date.now();
    const decryptTime = startTime - rawRecvTime;
    // Track last message for debugging disconnects
    this.lastMessageInfo = { time: startTime, type: msg.type_int, mc: msg.mc || null };
    
    // DEBUG: Log raw message size to check if larger messages cause issues
    const msgSize = JSON.stringify(msg).length;
    console.log(`[XComfort] MSG SIZE: ${msgSize} bytes, type=${msg.type_int} decrypt=${decryptTime}ms`);
    
    // ACK IMMEDIATELY for ALL messages with 'mc' field - completely synchronous
    // Use direct ws.send() to minimize any latency - don't wait for callback
    // The goal is to get ACK out as fast as possible and return from this handler
    if ('mc' in msg) {
      const ackMsg = {
        type_int: MESSAGE_TYPES.ACK,
        ref: msg.mc
      };
      
      // Use setImmediate to defer ACK slightly - this matches Python's async behavior
      // where context switches happen between operations. The xComfort bridge may
      // have timing-sensitive firmware that expects a small delay before ACK.
      setImmediate(() => {
        try {
          const preEncrypt = Date.now();
          const data = this.encryptAES256CBC(ackMsg);
          const postEncrypt = Date.now();
          // Use send with callback to track when data is flushed
          this.ws.send(data, { fin: true }, (err) => {
            if (err) {
              console.error(`[XComfort] ACK send error for mc=${msg.mc}:`, err);
            } else {
              console.log(`[XComfort] >> ACK mc=${msg.mc} FLUSHED at ${Date.now()}`);
            }
          });
          const postSend = Date.now();
          console.log(`[XComfort] >> ACK mc=${msg.mc} encrypt=${postEncrypt - preEncrypt}ms queue=${postSend - postEncrypt}ms fromRaw=${postSend - rawRecvTime}ms`);
        } catch (err) {
          console.error(`[XComfort] Failed to send ACK for mc=${msg.mc}:`, err);
        }
      });
    }
    
    // Debug: Log incoming message types with timestamp
    console.log(`[XComfort] << RECV type=${msg.type_int}${msg.mc !== undefined ? ` mc=${msg.mc}` : ''}${msg.ref !== undefined ? ` ref=${msg.ref}` : ''} T+${Date.now() - startTime}ms`);

    // Queue message for processing - use process.nextTick for highest priority
    // This ensures we return from the message handler immediately
    process.nextTick(() => {
      this._processMessage(msg).catch(err => {
        console.error('[XComfort] Message processing error:', err);
      });
    });
  }

  // Separated message processing - runs in next event loop tick
  async _processMessage(msg) {
    // Handle incoming ACK messages (bridge acknowledging our messages)
    if (msg.type_int === MESSAGE_TYPES.ACK) {
      if (msg.ref) {
        console.log(`[XComfort] Received ACK for message ref: ${msg.ref}`);
        this.pendingAcks.delete(msg.ref);
      }
      return;
    }

    // Handle NACK (negative acknowledgment / errors)
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

    // Handle PING messages (keep-alive from bridge)
    // NOTE: If PING has 'mc' field, it's already ACK'd in handleEncryptedMessage
    // Python doesn't have special PING handling - it just ACKs any message with 'mc'
    // Log PING details to understand what fields it contains
    if (msg.type_int === MESSAGE_TYPES.PING) {
      console.log(`[XComfort] PING received - mc=${msg.mc} ref=${msg.ref} (already ACK'd if has mc)`);
      return;
    }

    // Handle SET_HOME_DATA (home configuration data)
    if (msg.type_int === MESSAGE_TYPES.SET_HOME_DATA) {
      console.log('[XComfort] Received SET_HOME_DATA');
      if (msg.payload) {
        this.processHomeData(msg.payload);
      }
      return;
    }

    // Handle SET_BRIDGE_STATE (bridge state updates)
    if (msg.type_int === MESSAGE_TYPES.SET_BRIDGE_STATE) {
      return;
    }

    if (msg.type_int === MESSAGE_TYPES.SECRET_EXCHANGE_ACK) {
      const salt = this.generateSalt();
      const password = this.hash(this.deviceId, this.authKey, salt);
      
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
      this.token = msg.payload.token;
      console.log('[XComfort] Login successful, received token');
      
      const applyTokenMsg = {
        type_int: MESSAGE_TYPES.TOKEN_APPLY,
        mc: this.nextMc(),
        payload: { token: this.token },
      };
      this.sendEncrypted(applyTokenMsg);
    } else if (msg.type_int === MESSAGE_TYPES.TOKEN_APPLY_ACK) {
      // Check if this is the first or second TOKEN_APPLY_ACK
      if (this.connectionState !== 'token_renewed') {
        // First TOKEN_APPLY_ACK - now renew token (matching Python reference exactly)
        console.log('[XComfort] Token applied, renewing token...');
        this.connectionState = 'renewing';
        
        const renewTokenMsg = {
          type_int: MESSAGE_TYPES.TOKEN_RENEW,
          mc: this.nextMc(),
          payload: { token: this.token },
        };
        this.sendEncrypted(renewTokenMsg);
      } else {
        // Second TOKEN_APPLY_ACK after token renewal - NOW we're fully connected
        console.log('[XComfort] Fully authenticated with renewed token!');
        this.connectionState = 'connected';
        
        // Request initial data
        this.sendEncrypted({ type_int: MESSAGE_TYPES.REQUEST_DEVICES, mc: this.nextMc(), payload: {} });
        this.sendEncrypted({ type_int: MESSAGE_TYPES.REQUEST_ROOMS, mc: this.nextMc(), payload: {} });
        this.sendEncrypted({ type_int: MESSAGE_TYPES.HEARTBEAT, mc: this.nextMc(), payload: {} });
        
        // Start heartbeat
        this.startHeartbeat();
      }
    } else if (msg.type_int === MESSAGE_TYPES.TOKEN_RENEW_RESPONSE) {
      // Token renewed - apply the new token
      this.token = msg.payload.token;
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
      this.processDeviceData(msg.payload);
    } else if (msg.type_int === MESSAGE_TYPES.STATE_UPDATE) {
      console.log('[XComfort] Device state update');
      this.processStateUpdate(msg.payload);
    } else if (msg.type_int === MESSAGE_TYPES.ERROR_INFO) {
      // Error/Info responses 
      console.log(`[XComfort] Error/Info response: ${msg.payload?.info}`);
      
    } else {
      console.log(`[XComfort] Unhandled message type: ${msg.type_int}`);
    }
  }

  /**
   * Process SET_HOME_DATA (303) messages
   * Contains home configuration and metadata
   */
  processHomeData(payload) {
    // Store any relevant home configuration data
    if (payload.home) {
      this.homeData = payload.home;
      console.log(`[XComfort] Home data stored: ${payload.home.name || 'unnamed'}`);
    }
    
    // Process any devices or rooms included in home data
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

  processDeviceData(payload) {
    if (payload.devices) {
      console.log(`[XComfort] Discovered ${payload.devices.length} devices`);
      payload.devices.forEach(device => {
        this.devices.set(device.deviceId, device);
      });
    }
    
    if (payload.rooms) {
      console.log(`[XComfort] Discovered ${payload.rooms.length} rooms`);
      payload.rooms.forEach(room => {
        this.rooms.set(room.roomId, room);
      });
    }

    if (payload.scenes) {
      console.log(`[XComfort] Found ${payload.scenes.length} scenes from bridge data`);
      
      // Store the detailed scene data for the scene manager
      this.setDetailedScenes(payload.scenes);
    }
    
    if (payload.lastItem) {
      this.deviceListReceived = true;
      console.log('[XComfort] Device discovery complete!');
      
      // Note: xComfort Bridge doesn't provide initial device states
      // States are only sent when devices actually change (type 310 messages)
      // This is normal behavior - devices will show unknown state until operated
      console.log('[XComfort] Waiting for device state changes to populate current states...');
    }
  }

  processStateUpdate(payload) {
    try {
      // Minimal logging to avoid blocking the event loop
      const itemCount = payload?.item?.length || 0;
      console.log(`[XComfort] Processing state update with ${itemCount} items`);
      
      // DEBUG: Log full payload for state updates to compare ON vs OFF
      console.log(`[XComfort] STATE PAYLOAD: ${JSON.stringify(payload)}`);
      
      if (payload && payload.item) {
        // Group items by deviceId to combine state and metadata updates
        const deviceUpdates = new Map();
        // Track room updates separately
        const roomUpdates = new Map();
      
      payload.item.forEach((item) => {
        // Handle device updates
        if (item.deviceId) {
          // Get or create device update object
          if (!deviceUpdates.has(item.deviceId)) {
            deviceUpdates.set(item.deviceId, {});
          }
          const deviceUpdate = deviceUpdates.get(item.deviceId);
          
          // Process actual device state data (switch/dim)
          if (item.hasOwnProperty('switch') || item.hasOwnProperty('dimmvalue')) {
            deviceUpdate.switch = item.switch;
            deviceUpdate.dimmvalue = item.dimmvalue;
            deviceUpdate.power = item.power;
            deviceUpdate.curstate = item.curstate;
          } 
          // Process known metadata info types (temperature, humidity ONLY)
          else if (item.hasOwnProperty('info') && Array.isArray(item.info)) {
            const metadata = this.parseInfoMetadata(item.info);
            if (Object.keys(metadata).length > 0) {
              deviceUpdate.metadata = metadata;
            }
          }
        }
        // Handle room updates
        else if (item.roomId) {
          // Store complete room state
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
            errorState: item.errorState
          });
        }
      });
      
      // Send combined updates for each device (deferred via setImmediate)
      deviceUpdates.forEach((updateData, deviceId) => {
        this.triggerDeviceStateListeners(deviceId, updateData);
      });
      
      // Send room updates (deferred via setImmediate)
      roomUpdates.forEach((updateData, roomId) => {
        this.triggerRoomStateListeners(roomId, updateData);
      });
      }
    } catch (error) {
      console.error(`[XComfort] Error processing state update:`, error);
    }
  }

  // Parse known info metadata types based on xcomfort-python reference
  // Note: Text code "1109" confirmed as temperature for dimming actuators (devType 101)
  // Made public so devices can access it for polling temperature data
  parseInfoMetadata(infoArray) {
    const metadata = {};
    
    infoArray.forEach((info) => {
      if (info.text && info.value !== undefined) {
        switch (info.text) {
          case INFO_TEXT_CODES.TEMPERATURE_STANDARD:
            // Temperature sensor reading (°C) - standard xComfort text code
            metadata.temperature = parseFloat(info.value);
            break;
          case INFO_TEXT_CODES.HUMIDITY_STANDARD:
            // Humidity sensor reading (%) - standard xComfort text code
            metadata.humidity = parseFloat(info.value);
            break;
          case INFO_TEXT_CODES.TEMPERATURE_DIMMER:
            // Temperature reading for dimming actuators
            metadata.temperature = parseFloat(info.value);
            break;
          // Silently ignore unknown info types
        }
      }
    });
    
    return metadata;
  }

  startHeartbeat() {
    // Clear existing heartbeat if any
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      if (this.ws.readyState === this.ws.OPEN && this.connectionState === 'connected') {
        this.sendEncrypted({ type_int: MESSAGE_TYPES.HEARTBEAT, mc: this.nextMc(), payload: {} });
      }
    }, PROTOCOL_CONFIG.TIMEOUTS.HEARTBEAT);
  }

  // Cleanup method for proper resource management
  cleanup() {
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
  getDevices() {
    return Array.from(this.devices.values());
  }

  getRooms() {
    return Array.from(this.rooms.values());
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  async switchDevice(deviceId, switchState) {
    // Basic input validation
    if (!deviceId) {
      throw new Error('Device ID is required');
    }
    if (typeof switchState !== 'boolean') {
      throw new Error('Switch state must be a boolean');
    }
    
    // Connection validation
    this._requireConnection();
    
    return this._sendDeviceCommand(
      MESSAGE_TYPES.DEVICE_SWITCH,
      { deviceId: deviceId, switch: switchState },
      `switchDevice: deviceId=${deviceId}, switchState=${switchState}`
    );
  }

  async setDimmerValue(deviceId, dimmValue) {
    // Basic input validation
    if (!deviceId) {
      throw new Error('Device ID is required');
    }
    if (typeof dimmValue !== 'number' || isNaN(dimmValue)) {
      throw new Error('Dimmer value must be a number');
    }
    
    // Connection validation
    this._requireConnection();
    
    // Clamp value to valid range
    dimmValue = Math.max(PROTOCOL_CONFIG.LIMITS.DIM_MIN, Math.min(PROTOCOL_CONFIG.LIMITS.DIM_MAX, dimmValue));
    
    return this._sendDeviceCommand(
      MESSAGE_TYPES.DEVICE_DIM,
      { deviceId: deviceId, dimmvalue: dimmValue },
      `setDimmerValue: deviceId=${deviceId}, dimmValue=${dimmValue}`
    );
  }

  async controlRoom(roomId, action, value = null) {
    this._requireConnection();
    
    let roomMsg;
    
    if (action === 'switch') {
      roomMsg = {
        type_int: MESSAGE_TYPES.ROOM_SWITCH,
        mc: this.nextMc(),
        payload: {
          roomId: roomId,
          switch: value
        }
      };
    } else if (action === 'dimm' && value !== null) {
      value = Math.max(PROTOCOL_CONFIG.LIMITS.DIM_MIN, Math.min(PROTOCOL_CONFIG.LIMITS.DIM_MAX, value));
      roomMsg = {
        type_int: MESSAGE_TYPES.ROOM_DIM,
        mc: this.nextMc(),
        payload: {
          roomId: roomId,
          dimmvalue: value
        }
      };
    } else {
      throw new Error(`Invalid room action: ${action}`);
    }
    
    return this.sendEncrypted(roomMsg);
  }

  async activateScene(sceneId) {
    // Basic input validation
    if (!sceneId && sceneId !== 0) {
      throw new Error('Scene ID is required');
    }
    if (typeof sceneId !== 'number' || sceneId < 0) {
      throw new Error('Scene ID must be a non-negative number');
    }
    
    // Connection validation
    this._requireConnection();
    
    return this._sendDeviceCommand(
      MESSAGE_TYPES.ACTIVATE_SCENE,
      { sceneId: sceneId },
      `activateScene: sceneId=${sceneId}`
    );
  }

  // Request current state info for all devices to get fresh temperature data
  async requestDeviceStates() {
    if (!this.aesKey || !this.ws || this.ws.readyState !== this.ws.OPEN) {
      console.log('[XComfort] Cannot request device states - not connected');
      return false;
    }

    console.log('[XComfort] Requesting fresh device data for temperature updates...');
    
    // Send the same sequence of messages as during initial connection
    // This ensures we get both device and room state updates
    try {
      await this.sendEncrypted({ type_int: MESSAGE_TYPES.REQUEST_DEVICES, mc: this.nextMc(), payload: {} });
      await this.sendEncrypted({ type_int: MESSAGE_TYPES.REQUEST_ROOMS, mc: this.nextMc(), payload: {} });
      await this.sendEncrypted({ type_int: MESSAGE_TYPES.HEARTBEAT, mc: this.nextMc(), payload: {} });
      console.log('[XComfort] Sent complete state refresh sequence');
      return true;
    } catch (error) {
      console.log('[XComfort] Failed to send state refresh sequence:', error);
      return false;
    }
  }



  // Request info for all devices to refresh temperature data
  async refreshAllDeviceInfo() {
    console.log(`[XComfort] Requesting fresh data...`);
    
    // Simply request fresh home data - this is what works during initial connection
    return this.requestDeviceStates();
  }

  /**
   * Get detailed scene data that was received in SET_ALL_DATA messages
   * @returns {Array} Array of detailed scene objects
   */
  getDetailedScenes() {
    return this.detailedScenes || [];
  }

  /**
   * Store detailed scene data from SET_ALL_DATA payloads
   * @param {Array} scenes - Array of scene objects from bridge
   */
  setDetailedScenes(scenes) {
    this.detailedScenes = scenes;
    console.log(`[XComfort] Stored ${scenes.length} detailed scene objects`);
  }
}

export default XComfortConnection;
