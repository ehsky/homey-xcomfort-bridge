/**
 * XComfort Bridge - Singleton Facade
 *
 * This is the main entry point for xComfort Bridge communication.
 * It orchestrates all modules and provides a clean public API.
 *
 * IMPORTANT: Only ONE instance should exist per application.
 * Access via `this.homey.app.xcomfort` in drivers.
 */

import { MESSAGE_TYPES, PROTOCOL_CONFIG } from '../XComfortProtocol.mjs';
import { ConnectionManager } from './ConnectionManager.mjs';
import { Authenticator } from './Authenticator.mjs';
import { DeviceStateManager } from '../state/DeviceStateManager.mjs';
import { RoomStateManager } from '../state/RoomStateManager.mjs';
import { MessageHandler } from '../messaging/MessageHandler.mjs';
import type {
  ConnectionState,
  ProtocolMessage,
  XComfortDevice,
  XComfortRoom,
  XComfortScene,
  DeviceStateCallback,
  RoomStateCallback,
} from '../types.mjs';

// Re-export ConnectionState as BridgeConnectionState for external consumers
export type BridgeConnectionState = ConnectionState;

// ============================================================================
// XComfortBridge Class
// ============================================================================

export class XComfortBridge {
  private bridgeIp: string;
  private authKey: string;

  // Modules
  private connectionManager: ConnectionManager;
  private authenticator: Authenticator;
  private deviceStateManager: DeviceStateManager;
  private roomStateManager: RoomStateManager;
  private messageHandler: MessageHandler;

  // State
  private connectionState: BridgeConnectionState = 'disconnected';
  private deviceListReceived: boolean = false;
  private detailedScenes: XComfortScene[] = [];

  // Timeouts
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(bridgeIp: string, authKey: string) {
    this.bridgeIp = bridgeIp;
    this.authKey = authKey;

    // Initialize modules
    this.connectionManager = new ConnectionManager(bridgeIp);
    this.deviceStateManager = new DeviceStateManager();
    this.roomStateManager = new RoomStateManager();
    this.messageHandler = new MessageHandler(
      this.deviceStateManager,
      this.roomStateManager
    );

    // Authenticator needs send functions - will be set up during connect
    this.authenticator = new Authenticator(
      authKey,
      (msg) => this.connectionManager.sendRaw(msg),
      (msg) => this.connectionManager.sendEncrypted(msg),
      () => this.connectionManager.nextMc()
    );

    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    // Connection manager callbacks
    this.connectionManager.setOnRawMessage((data, timestamp) => {
      this.handleRawMessage(data, timestamp);
    });

    this.connectionManager.setOnClose((code, reason, shouldReconnect) => {
      this.connectionState = 'disconnected';
      console.log(`[XComfortBridge] Connection closed: ${code} - ${reason}`);

      if (shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    // Authenticator callback
    this.authenticator.setOnAuthenticated(() => {
      this.connectionState = 'connected';
      console.log('[XComfortBridge] Authenticated - requesting device list');

      // Request initial data
      this.connectionManager.sendEncrypted({
        type_int: MESSAGE_TYPES.REQUEST_DEVICES,
        mc: this.connectionManager.nextMc(),
        payload: {},
      });
      this.connectionManager.sendEncrypted({
        type_int: MESSAGE_TYPES.REQUEST_ROOMS,
        mc: this.connectionManager.nextMc(),
        payload: {},
      });
      this.connectionManager.sendEncrypted({
        type_int: MESSAGE_TYPES.HEARTBEAT,
        mc: this.connectionManager.nextMc(),
        payload: {},
      });

      // Start heartbeat
      this.connectionManager.startHeartbeat(() => {
        this.connectionManager.sendEncrypted({
          type_int: MESSAGE_TYPES.HEARTBEAT,
          mc: this.connectionManager.nextMc(),
          payload: {},
        });
      });
    });

    // Message handler callbacks
    this.messageHandler.setOnDeviceListComplete(() => {
      this.deviceListReceived = true;
      console.log('[XComfortBridge] Device discovery complete!');
    });

    this.messageHandler.setOnScenesReceived((scenes) => {
      this.detailedScenes = scenes;
      console.log(`[XComfortBridge] Stored ${scenes.length} scenes`);
    });
  }

  /**
   * Initialize and connect to the bridge
   */
  async init(): Promise<void> {
    if (!this.bridgeIp || !this.authKey) {
      throw new Error('Bridge IP and auth key are required');
    }

    console.log(`[XComfortBridge] Connecting to bridge at ${this.bridgeIp}`);
    return this.connect();
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connectionState = 'connecting';
      this.deviceListReceived = false;
      this.authenticator.reset();
      this.connectionManager.resetMc();

      this.connectionManager.connect().catch(reject);

      // Check for device list received
      this.connectionCheckInterval = setInterval(() => {
        if (this.deviceListReceived) {
          this.clearConnectionTimers();
          this.connectionManager.markEstablished();
          resolve();
        }
      }, 1000);

      // Connection timeout
      this.connectionTimeout = setTimeout(() => {
        this.clearConnectionTimers();
        console.log('[XComfortBridge] Connection timeout');
        this.connectionManager.cleanup();
        reject(new Error('Connection timeout - device list not received'));
      }, PROTOCOL_CONFIG.TIMEOUTS.CONNECTION);
    });
  }

  private clearConnectionTimers(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.connectionManager.isReconnecting()) return;

    this.connectionManager.setReconnecting(true);
    console.log('[XComfortBridge] Scheduling reconnect...');

    setTimeout(() => {
      this.connectionManager.setReconnecting(false);
      this.connect().catch((err) => {
        console.error(`[XComfortBridge] Reconnection failed: ${err.message}`);
      });
    }, PROTOCOL_CONFIG.TIMEOUTS.RECONNECT_DELAY);
  }

  private handleRawMessage(data: Buffer, timestamp: number): void {
    let rawStr = data.toString();
    if (rawStr.endsWith('\u0004')) rawStr = rawStr.slice(0, -1);

    // Try JSON first (unencrypted handshake)
    try {
      const msg = JSON.parse(rawStr) as ProtocolMessage;
      if (this.authenticator.handleUnencryptedMessage(msg)) {
        // Update encryption context after key exchange
        const ctx = this.authenticator.getEncryptionContext();
        if (ctx) {
          this.connectionManager.setEncryptionContext(ctx);
        }
        return;
      }
    } catch {
      // Not JSON, check for encrypted
    }

    // Handle encrypted messages
    const ctx = this.authenticator.getEncryptionContext();
    if (ctx && this.connectionManager.isEncrypted(rawStr)) {
      try {
        const decrypted = this.connectionManager.decryptMessage(rawStr);
        const msg = JSON.parse(decrypted) as ProtocolMessage;
        this.handleEncryptedMessage(msg, timestamp);
      } catch (e) {
        console.error('[XComfortBridge] Failed to decrypt/parse:', e);
      }
    }
  }

  private handleEncryptedMessage(msg: ProtocolMessage, _rawRecvTime: number): void {
    // Send ACK immediately for messages with 'mc' field
    if (msg.mc !== undefined) {
      setImmediate(() => {
        const ackMsg = { type_int: MESSAGE_TYPES.ACK, ref: msg.mc };
        this.connectionManager.sendEncrypted(ackMsg);
      });
    }

    console.log(
      `[XComfortBridge] << RECV type=${msg.type_int}${msg.mc !== undefined ? ` mc=${msg.mc}` : ''}`
    );

    // Try authenticator first (for auth flow messages)
    if (this.authenticator.handleEncryptedMessage(msg)) {
      return;
    }

    // Then try message handler (for data/state messages)
    process.nextTick(() => {
      this.messageHandler.processMessage(msg).catch((err) => {
        console.error('[XComfortBridge] Message processing error:', err);
      });
    });
  }

  // ===========================================================================
  // Public API - Device State Listeners
  // ===========================================================================

  addDeviceStateListener(deviceId: string, callback: DeviceStateCallback): void {
    this.deviceStateManager.addListener(deviceId, callback);
  }

  addRoomStateListener(roomId: string, callback: RoomStateCallback): void {
    this.roomStateManager.addListener(roomId, callback);
  }

  // ===========================================================================
  // Public API - Device/Room Access
  // ===========================================================================

  getDevices(): XComfortDevice[] {
    return this.deviceStateManager.getAllDevices();
  }

  getRooms(): XComfortRoom[] {
    return this.roomStateManager.getAllRooms();
  }

  getDevice(deviceId: string): XComfortDevice | undefined {
    return this.deviceStateManager.getDevice(deviceId);
  }

  getRoom(roomId: string): XComfortRoom | undefined {
    return this.roomStateManager.getRoom(roomId);
  }

  getDetailedScenes(): XComfortScene[] {
    return this.detailedScenes;
  }

  // ===========================================================================
  // Public API - Device Control
  // ===========================================================================

  async switchDevice(deviceId: string, switchState: boolean): Promise<boolean> {
    this.requireConnection();

    return this.connectionManager.sendEncrypted({
      type_int: MESSAGE_TYPES.DEVICE_SWITCH,
      mc: this.connectionManager.nextMc(),
      payload: { deviceId, switch: switchState },
    });
  }

  async setDimmerValue(deviceId: string, dimmValue: number): Promise<boolean> {
    this.requireConnection();

    dimmValue = Math.max(
      PROTOCOL_CONFIG.LIMITS.DIM_MIN,
      Math.min(PROTOCOL_CONFIG.LIMITS.DIM_MAX, dimmValue)
    );

    return this.connectionManager.sendEncrypted({
      type_int: MESSAGE_TYPES.DEVICE_DIM,
      mc: this.connectionManager.nextMc(),
      payload: { deviceId, dimmvalue: dimmValue },
    });
  }

  async controlRoom(
    roomId: string,
    action: 'switch' | 'dimm',
    value: boolean | number | null = null
  ): Promise<boolean> {
    this.requireConnection();

    if (action === 'switch') {
      return this.connectionManager.sendEncrypted({
        type_int: MESSAGE_TYPES.ROOM_SWITCH,
        mc: this.connectionManager.nextMc(),
        payload: { roomId, switch: value },
      });
    } else if (action === 'dimm' && value !== null) {
      const dimmValue = Math.max(
        PROTOCOL_CONFIG.LIMITS.DIM_MIN,
        Math.min(PROTOCOL_CONFIG.LIMITS.DIM_MAX, value as number)
      );
      return this.connectionManager.sendEncrypted({
        type_int: MESSAGE_TYPES.ROOM_DIM,
        mc: this.connectionManager.nextMc(),
        payload: { roomId, dimmvalue: dimmValue },
      });
    }

    throw new Error(`Invalid room action: ${action}`);
  }

  async activateScene(sceneId: number): Promise<boolean> {
    this.requireConnection();

    return this.connectionManager.sendEncrypted({
      type_int: MESSAGE_TYPES.ACTIVATE_SCENE,
      mc: this.connectionManager.nextMc(),
      payload: { sceneId },
    });
  }

  // ===========================================================================
  // Public API - State Refresh
  // ===========================================================================

  async requestDeviceStates(): Promise<boolean> {
    if (!this.connectionManager.isConnected()) {
      console.log('[XComfortBridge] Cannot request states - not connected');
      return false;
    }

    try {
      await this.connectionManager.sendEncryptedAsync({
        type_int: MESSAGE_TYPES.REQUEST_DEVICES,
        mc: this.connectionManager.nextMc(),
        payload: {},
      });
      await this.connectionManager.sendEncryptedAsync({
        type_int: MESSAGE_TYPES.REQUEST_ROOMS,
        mc: this.connectionManager.nextMc(),
        payload: {},
      });
      return true;
    } catch {
      return false;
    }
  }

  async refreshAllDeviceInfo(): Promise<boolean> {
    return this.requestDeviceStates();
  }

  // ===========================================================================
  // Public API - Utilities
  // ===========================================================================

  parseInfoMetadata(infoArray: Array<{ text: string; value: string | number }>) {
    return this.deviceStateManager.parseInfoMetadata(infoArray);
  }

  get isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  get state(): BridgeConnectionState {
    return this.connectionState;
  }

  cleanup(): void {
    this.clearConnectionTimers();
    this.connectionManager.cleanup();
    this.connectionState = 'disconnected';
  }

  private requireConnection(): void {
    if (!this.connectionManager.isConnected()) {
      throw new Error('xComfort Bridge not connected');
    }
  }
}
