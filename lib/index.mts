/**
 * xComfort Bridge Library - Public API
 *
 * This is the main entry point for the xComfort Bridge library.
 * Import from here to access all public types and utilities.
 */

// =============================================================================
// Types (from central types.mts)
// =============================================================================
export type {
  // Configuration
  BridgeConfig,
  LoggerFunction,
  // Connection
  ConnectionState,
  AuthState,
  EncryptionContext,
  ConnectionEvents,
  // Device
  XComfortDevice,
  InfoEntry,
  DeviceStateUpdate,
  DeviceMetadata,
  DeviceStateCallback,
  // Room
  XComfortRoom,
  RoomStateUpdate,
  RoomStateCallback,
  // Scene
  XComfortScene,
  // Protocol
  ProtocolMessage,
  StateUpdateItem,
  HomeData,
  // Events
  BridgeEvents,
  UnsubscribeFunction,
  StateListener,
  EventListener,
  // Config types
  EncryptionConfig,
  ProtocolTimingConfig,
  InfoTextCode,
} from './types.mjs';

// =============================================================================
// Constants
// =============================================================================
export {
  ENCRYPTION_CONFIG,
  PROTOCOL_TIMING,
  DIM_LIMITS,
  INFO_TEXT_CODES,
} from './types.mjs';

// =============================================================================
// Utilities
// =============================================================================
export {
  homeyToXComfort,
  xComfortToHomey,
  isValidXComfortDimValue,
  isValidHomeyDimValue,
  clampXComfortDimValue,
} from './utils/index.mjs';

// =============================================================================
// Crypto
// =============================================================================
export * from './crypto/index.mjs';

// =============================================================================
// Connection (modular architecture)
// =============================================================================
export { XComfortBridge, type BridgeConnectionState } from './connection/index.mjs';

// =============================================================================
// State Management
// =============================================================================
export { DeviceStateManager, RoomStateManager } from './state/index.mjs';

// =============================================================================
// Messaging
// =============================================================================
export { MessageHandler } from './messaging/index.mjs';
