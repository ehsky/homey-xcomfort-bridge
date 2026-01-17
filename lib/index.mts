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
} from './types.mjs';

// Constants
export {
  MESSAGE_TYPES,
  ENCRYPTION_CONFIG,
  PROTOCOL_TIMING,
  DIM_LIMITS,
  INFO_TEXT_CODES,
} from './types.mjs';

// Utilities
export {
  homeyToXComfort,
  xComfortToHomey,
  isValidXComfortDimValue,
  isValidHomeyDimValue,
  clampXComfortDimValue,
} from './utils/index.mjs';

// Crypto
export * from './crypto/index.mjs';
// TODO: Export XComfortBridge when implemented
// export { XComfortBridge } from './connection/index.js';
