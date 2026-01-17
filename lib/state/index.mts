/**
 * State Management - Public API
 *
 * Barrel exports for device and room state management.
 */

export {
  DeviceStateManager,
  type DeviceStateCallback,
  type DeviceStateUpdate,
  type DeviceMetadata,
  type InfoEntry,
  type XComfortDevice,
} from './DeviceStateManager.mjs';

export {
  RoomStateManager,
  type RoomStateCallback,
  type RoomStateUpdate,
  type XComfortRoom,
} from './RoomStateManager.mjs';
