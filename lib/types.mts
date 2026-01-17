/**
 * xComfort Bridge - Shared TypeScript Interfaces
 *
 * This file contains all shared type definitions used across the application.
 * All modules should import types from here to avoid duplication.
 */

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for initializing the XComfortBridge
 */
export interface BridgeConfig {
  /** IP address of the xComfort Bridge */
  ip: string;
  /** Authentication key (found under bridge cover) */
  authKey: string;
  /** Optional logger function (defaults to console.log) */
  logger?: LoggerFunction;
  /** Reconnect delay in ms (default: 5000) */
  reconnectDelay?: number;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
}

/** Logger function signature */
export type LoggerFunction = (...args: unknown[]) => void;

// =============================================================================
// Connection Types
// =============================================================================

/**
 * Connection state machine states
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticating'
  | 'renewing'
  | 'token_renewed'
  | 'error';

/**
 * Authentication state values
 */
export type AuthState =
  | 'idle'
  | 'awaiting_connection'
  | 'awaiting_public_key'
  | 'awaiting_secret_ack'
  | 'awaiting_login_response'
  | 'awaiting_token_apply'
  | 'awaiting_token_renew'
  | 'authenticated';

/**
 * Encryption context for AES
 */
export interface EncryptionContext {
  key: Buffer;
  iv: Buffer;
}

/**
 * Connection event types
 */
export interface ConnectionEvents {
  connected: [];
  disconnected: [code: number, reason: string];
  reconnecting: [attempt: number];
  stateChange: [state: ConnectionState];
  error: [error: Error];
}

// =============================================================================
// Device Types
// =============================================================================

/**
 * Device from xComfort Bridge
 */
export interface XComfortDevice {
  deviceId: string;
  name: string;
  dimmable?: boolean;
  devType?: number;
  info?: InfoEntry[];
  [key: string]: unknown;
}

/**
 * Info entry for device metadata (temperature, humidity, etc.)
 */
export interface InfoEntry {
  text: string;
  value: string | number;
}

/**
 * Device state update payload
 */
export interface DeviceStateUpdate {
  switch?: boolean;
  dimmvalue?: number;
  power?: number;
  curstate?: unknown;
  metadata?: DeviceMetadata;
}

/**
 * Parsed device metadata
 */
export interface DeviceMetadata {
  temperature?: number;
  humidity?: number;
}

/**
 * Device state listener callback
 */
export type DeviceStateCallback = (
  deviceId: string,
  stateData: DeviceStateUpdate
) => void | Promise<void>;

// =============================================================================
// Room Types
// =============================================================================

/**
 * Room from xComfort Bridge
 */
export interface XComfortRoom {
  roomId: string;
  name: string;
  devices?: unknown[];
  [key: string]: unknown;
}

/**
 * Room state update payload
 */
export interface RoomStateUpdate {
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

/**
 * Room state listener callback
 */
export type RoomStateCallback = (
  roomId: string,
  stateData: RoomStateUpdate
) => void | Promise<void>;

// =============================================================================
// Scene Types
// =============================================================================

/**
 * Scene from xComfort Bridge
 */
export interface XComfortScene {
  sceneId?: number;
  name?: string;
  devices?: unknown[];
  [key: string]: unknown;
}

// =============================================================================
// Protocol Types
// =============================================================================

/**
 * Protocol message structure
 */
export interface ProtocolMessage {
  type_int: number;
  mc?: number;
  ref?: number;
  payload?: Record<string, unknown>;
}

/**
 * State update item from bridge
 */
export interface StateUpdateItem {
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

/**
 * Home data from bridge
 */
export interface HomeData {
  name?: string;
  [key: string]: unknown;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * All bridge events
 */
export interface BridgeEvents extends ConnectionEvents {
  deviceStateChange: [deviceId: string, state: DeviceStateUpdate];
  roomStateChange: [roomId: string, state: RoomStateUpdate];
  devicesDiscovered: [devices: XComfortDevice[]];
  roomsDiscovered: [rooms: XComfortRoom[]];
  scenesDiscovered: [scenes: XComfortScene[]];
}

// =============================================================================
// Listener Types
// =============================================================================

/**
 * Unsubscribe function returned when adding listeners
 */
export type UnsubscribeFunction = () => void;

/**
 * State change listener callback
 */
export type StateListener<T> = (id: string, state: T) => void;

/**
 * Generic event listener
 */
export type EventListener<T extends unknown[]> = (...args: T) => void;

// =============================================================================
// Encryption Configuration
// =============================================================================

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  algorithm: string;
  keySize: number;
  ivSize: number;
  blockSize: number;
  rsaScheme: string;
}

/**
 * Default encryption configuration
 */
export const ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-cbc',
  keySize: 32,
  ivSize: 16,
  blockSize: 16,
  rsaScheme: 'RSAES-PKCS1-V1_5',
};

// =============================================================================
// Protocol Configuration
// =============================================================================

/**
 * Protocol timing configuration
 */
export interface ProtocolTimingConfig {
  connectionTimeout: number;
  heartbeatInterval: number;
  reconnectDelay: number;
  ackTimeout: number;
}

/**
 * Default protocol timing
 */
export const PROTOCOL_TIMING: ProtocolTimingConfig = {
  connectionTimeout: 30000,
  heartbeatInterval: 30000,
  reconnectDelay: 5000,
  ackTimeout: 5000,
};

/**
 * Dim value limits
 */
export const DIM_LIMITS = {
  MIN: 1,
  MAX: 99,
} as const;

// =============================================================================
// Info Text Codes
// =============================================================================

/**
 * Known info text codes for device metadata
 */
export const INFO_TEXT_CODES = {
  TEMPERATURE_STANDARD: '1222',
  HUMIDITY_STANDARD: '1223',
  TEMPERATURE_DIMMER: '1109',
  COMPONENT_CHANNEL: '1111',
  COMPONENT_STATUS: '1119',
} as const;

export type InfoTextCode = (typeof INFO_TEXT_CODES)[keyof typeof INFO_TEXT_CODES];
