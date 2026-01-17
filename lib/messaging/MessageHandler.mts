/**
 * Message Handler for xComfort Bridge
 *
 * Handles message routing, ACK management, and state update processing.
 * Extracted from XComfortConnection for single responsibility.
 */

import { MESSAGE_TYPES } from '../XComfortProtocol.mjs';
import { DeviceStateManager } from '../state/DeviceStateManager.mjs';
import { RoomStateManager } from '../state/RoomStateManager.mjs';
import type {
  ProtocolMessage,
  StateUpdateItem,
  HomeData,
  XComfortScene,
  DeviceStateUpdate,
  RoomStateUpdate,
} from '../types.mjs';

// Re-export types for module consumers
export type { ProtocolMessage, StateUpdateItem, HomeData, XComfortScene };

// ============================================================================
// Module-specific Types (internal callbacks)
// ============================================================================

/** Callback for sending encrypted messages */
export type SendEncryptedFn = (msg: Record<string, unknown>) => boolean;

/** Callback when device list is complete */
export type OnDeviceListCompleteFn = () => void;

/** Callback to store scenes */
export type OnScenesReceivedFn = (scenes: XComfortScene[]) => void;

// ============================================================================
// MessageHandler Class
// ============================================================================

export class MessageHandler {
  private deviceStateManager: DeviceStateManager;
  private roomStateManager: RoomStateManager;
  private pendingAcks: Map<number, boolean> = new Map();
  private homeData: HomeData | null = null;
  private onDeviceListComplete?: OnDeviceListCompleteFn;
  private onScenesReceived?: OnScenesReceivedFn;

  constructor(
    deviceStateManager: DeviceStateManager,
    roomStateManager: RoomStateManager
  ) {
    this.deviceStateManager = deviceStateManager;
    this.roomStateManager = roomStateManager;
  }

  /**
   * Set callback for when device list is complete
   */
  setOnDeviceListComplete(callback: OnDeviceListCompleteFn): void {
    this.onDeviceListComplete = callback;
  }

  /**
   * Set callback for when scenes are received
   */
  setOnScenesReceived(callback: OnScenesReceivedFn): void {
    this.onScenesReceived = callback;
  }

  /**
   * Track a pending ACK
   */
  trackAck(mc: number): void {
    this.pendingAcks.set(mc, true);
  }

  /**
   * Clear a pending ACK
   */
  clearAck(ref: number): void {
    this.pendingAcks.delete(ref);
  }

  /**
   * Get home data
   */
  getHomeData(): HomeData | null {
    return this.homeData;
  }

  /**
   * Process an encrypted message (after decryption)
   * Returns true if the message was handled
   */
  async processMessage(msg: ProtocolMessage): Promise<boolean> {
    // Handle incoming ACK messages
    if (msg.type_int === MESSAGE_TYPES.ACK) {
      if (msg.ref) {
        console.log(`[MessageHandler] Received ACK for message ref: ${msg.ref}`);
        this.clearAck(msg.ref);
      }
      return true;
    }

    // Handle NACK
    if (msg.type_int === MESSAGE_TYPES.NACK) {
      console.error(`[MessageHandler] Received NACK for message ref: ${msg.ref}`);
      if (msg.payload) {
        console.error(`[MessageHandler] NACK details:`, JSON.stringify(msg.payload));
      }
      return true;
    }

    // Handle HEARTBEAT responses
    if (msg.type_int === MESSAGE_TYPES.HEARTBEAT) {
      console.log('[MessageHandler] Heartbeat response received');
      return true;
    }

    // Handle PING messages
    if (msg.type_int === MESSAGE_TYPES.PING) {
      console.log(
        `[MessageHandler] PING received - mc=${msg.mc} ref=${msg.ref} (already ACK'd if has mc)`
      );
      return true;
    }

    // Handle SET_HOME_DATA
    if (msg.type_int === MESSAGE_TYPES.SET_HOME_DATA) {
      console.log('[MessageHandler] Received SET_HOME_DATA');
      if (msg.payload) {
        this.processHomeData(msg.payload);
      }
      return true;
    }

    // Handle SET_BRIDGE_STATE
    if (msg.type_int === MESSAGE_TYPES.SET_BRIDGE_STATE) {
      return true;
    }

    // Handle SET_ALL_DATA
    if (msg.type_int === MESSAGE_TYPES.SET_ALL_DATA) {
      console.log('[MessageHandler] Received SET_ALL_DATA');
      console.log(
        `[MessageHandler] SET_ALL_DATA PAYLOAD: ${JSON.stringify(
          msg.payload
        )}`
      );
      this.processDeviceData(msg.payload as Record<string, unknown>);
      return true;
    }

    // Handle STATE_UPDATE
    if (msg.type_int === MESSAGE_TYPES.STATE_UPDATE) {
      console.log('[MessageHandler] Device state update');
      this.processStateUpdate(msg.payload as { item?: StateUpdateItem[] }, {
        typeInt: msg.type_int,
        mc: msg.mc,
        ref: msg.ref,
      });
      return true;
    }

    // Handle ERROR_INFO
    if (msg.type_int === MESSAGE_TYPES.ERROR_INFO) {
      const payload = msg.payload as { info?: string };
      console.log(`[MessageHandler] Error/Info response: ${payload?.info}`);
      return true;
    }

    // Message not handled by this handler
    return false;
  }

  /**
   * Process SET_HOME_DATA (303) messages
   */
  private processHomeData(payload: Record<string, unknown>): void {
    if (payload.home) {
      this.homeData = payload.home as HomeData;
      console.log(
        `[MessageHandler] Home data stored: ${this.homeData.name || 'unnamed'}`
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

  /**
   * Process device/room/scene data
   */
  private processDeviceData(payload: Record<string, unknown>): void {
    if (payload.devices) {
      const devices = payload.devices as Array<{
        deviceId: string;
        name: string;
        [key: string]: unknown;
      }>;
      console.log(`[MessageHandler] Discovered ${devices.length} devices`);
      devices.forEach((device) => {
        this.deviceStateManager.setDevice(device);
      });
    }

    if (payload.rooms) {
      const rooms = payload.rooms as Array<{
        roomId: string;
        name: string;
        [key: string]: unknown;
      }>;
      console.log(`[MessageHandler] Discovered ${rooms.length} rooms`);
      rooms.forEach((room) => {
        this.roomStateManager.setRoom(room);
      });
    }

    if (payload.scenes) {
      const scenes = payload.scenes as XComfortScene[];
      console.log(
        `[MessageHandler] Found ${scenes.length} scenes from bridge data`
      );
      this.onScenesReceived?.(scenes);
    }

    if (payload.lastItem) {
      console.log('[MessageHandler] Device discovery complete!');
      console.log(
        '[MessageHandler] Waiting for device state changes to populate current states...'
      );
      this.onDeviceListComplete?.();
    }
  }

  /**
   * Process state update messages
   */
  private processStateUpdate(
    payload: { item?: StateUpdateItem[] },
    msgMeta?: { typeInt?: number; mc?: number; ref?: number }
  ): void {
    try {
      const itemCount = payload?.item?.length ?? 0;
      console.log(`[MessageHandler] Processing state update with ${itemCount} items`);
      console.log(`[MessageHandler] STATE PAYLOAD: ${JSON.stringify(payload)}`);

      if (payload?.item) {
        const deviceUpdates = new Map<string, DeviceStateUpdate>();
        const roomUpdates = new Map<string, RoomStateUpdate>();

        payload.item.forEach((item) => {
          if (item.deviceId) {
            const device = this.deviceStateManager.getDevice(String(item.deviceId));
            if (device?.devType === 220) {
              console.log(
                `[MessageHandler] Input event raw item: ${JSON.stringify(item)}`
              );
              console.log(
                `[MessageHandler] Input event meta: deviceId=${item.deviceId}, type=${msgMeta?.typeInt ?? 'n/a'}, mc=${msgMeta?.mc ?? 'n/a'}, ref=${msgMeta?.ref ?? 'n/a'}, ts=${Date.now()}`
              );
            }

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
              const metadata = this.deviceStateManager.parseInfoMetadata(item.info);
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
          this.deviceStateManager.triggerListeners(deviceId, updateData);
        });

        roomUpdates.forEach((updateData, roomId) => {
          this.roomStateManager.triggerListeners(roomId, updateData);
        });
      }
    } catch (error) {
      console.error(`[MessageHandler] Error processing state update:`, error);
    }
  }
}
