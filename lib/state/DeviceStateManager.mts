/**
 * Device State Manager for xComfort Bridge
 *
 * Manages device state tracking and listener notifications.
 * Extracted from XComfortConnection for single responsibility.
 */

import { INFO_TEXT_CODES } from '../XComfortProtocol.mjs';
import type {
  XComfortDevice,
  InfoEntry,
  DeviceMetadata,
  DeviceStateUpdate,
  DeviceStateCallback,
} from '../types.mjs';

// Re-export types for module consumers
export type { XComfortDevice, InfoEntry, DeviceMetadata, DeviceStateUpdate, DeviceStateCallback };

// ============================================================================
// DeviceStateManager Class
// ============================================================================

export class DeviceStateManager {
  private devices: Map<string, XComfortDevice> = new Map();
  private listeners: Map<string, DeviceStateCallback[]> = new Map();

  /**
   * Add a device to the state manager
   */
  setDevice(device: XComfortDevice): void {
    this.devices.set(device.deviceId, device);
  }

  /**
   * Get a device by ID
   */
  getDevice(deviceId: string): XComfortDevice | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Get all devices
   */
  getAllDevices(): XComfortDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Clear all devices
   */
  clearDevices(): void {
    this.devices.clear();
  }

  /**
   * Get the number of devices
   */
  get deviceCount(): number {
    return this.devices.size;
  }

  /**
   * Add a state listener for a specific device
   */
  addListener(deviceId: string, callback: DeviceStateCallback): void {
    if (!this.listeners.has(deviceId)) {
      this.listeners.set(deviceId, []);
    }
    this.listeners.get(deviceId)!.push(callback);
    console.log(`[DeviceStateManager] Added state listener for device ${deviceId}`);
  }

  /**
   * Remove a state listener for a specific device
   */
  removeListener(deviceId: string, callback: DeviceStateCallback): boolean {
    const deviceListeners = this.listeners.get(deviceId);
    if (!deviceListeners) return false;

    const index = deviceListeners.indexOf(callback);
    if (index === -1) return false;

    deviceListeners.splice(index, 1);
    if (deviceListeners.length === 0) {
      this.listeners.delete(deviceId);
    }
    return true;
  }

  /**
   * Remove all listeners for a specific device
   */
  removeAllListeners(deviceId: string): void {
    this.listeners.delete(deviceId);
  }

  /**
   * Trigger state listeners for a device (non-blocking via setImmediate)
   */
  triggerListeners(deviceId: string, stateData: DeviceStateUpdate): void {
    const deviceListeners = this.listeners.get(deviceId);
    if (!deviceListeners) return;

    deviceListeners.forEach((callback) => {
      setImmediate(() => {
        try {
          callback(deviceId, stateData);
        } catch (error) {
          console.error(
            `[DeviceStateManager] Error in state listener for device ${deviceId}:`,
            error
          );
        }
      });
    });
  }

  /**
   * Parse known info metadata types from device info array
   */
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
}
