/**
 * Connection - Public API
 *
 * Barrel exports for connection management.
 */

export {
  XComfortBridge,
  type BridgeConnectionState,
} from './XComfortBridge.mjs';

export {
  ConnectionManager,
  type ConnectionState,
  type EncryptionContext,
  type OnRawMessageFn,
  type OnStateChangeFn,
  type OnCloseFn,
} from './ConnectionManager.mjs';

export {
  Authenticator,
  type AuthState,
  type SendRawFn,
  type SendEncryptedFn,
  type OnAuthenticatedFn,
  type GetMcFn,
} from './Authenticator.mjs';
