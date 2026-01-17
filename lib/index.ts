/**
 * xComfort Bridge Library - Public API
 *
 * This is the main entry point for the xComfort Bridge library.
 * Import from here to access all public types and utilities.
 */

// Types
export type {
  BridgeConfig,
  LoggerFunction,
  ConnectionState,
  ConnectionEvents,
  XComfortDeviceData,
  DeviceInfoEntry,
  DeviceState,
  DeviceMetadata,
  XComfortRoomData,
  RoomState,
  XComfortSceneData,
  SceneDeviceEntry,
  ProtocolMessage,
  MessageType,
  BridgeEvents,
  UnsubscribeFunction,
  StateListener,
  EventListener,
  EncryptionConfig,
  ProtocolTimingConfig,
  InfoTextCode,
} from './types.js';

// Constants
export {
  MESSAGE_TYPES,
  ENCRYPTION_CONFIG,
  PROTOCOL_TIMING,
  DIM_LIMITS,
  INFO_TEXT_CODES,
} from './types.js';

// Utilities
export {
  homeyToXComfort,
  xComfortToHomey,
  isValidXComfortDimValue,
  isValidHomeyDimValue,
  clampXComfortDimValue,
} from './utils/index.js';

// TODO: Export XComfortBridge when implemented
// export { XComfortBridge } from './connection/index.js';
