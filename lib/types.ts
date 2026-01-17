/**
 * xComfort Bridge - Shared TypeScript Interfaces
 *
 * This file contains all shared type definitions used across the application.
 * Keep this file focused on interfaces - implementation should be in respective modules.
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
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'error';

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
 * Raw device data from xComfort Bridge
 */
export interface XComfortDeviceData {
  deviceId: string;
  name: string;
  devType: number;
  dimmable: boolean;
  roomId?: string;
  info?: DeviceInfoEntry[];
}

/**
 * Device info entry (metadata like temperature, humidity)
 */
export interface DeviceInfoEntry {
  text: string;
  value: string | number;
}

/**
 * Device state update
 */
export interface DeviceState {
  switch?: boolean;
  dimmvalue?: number;
  power?: number;
  curstate?: number;
  metadata?: DeviceMetadata;
}

/**
 * Parsed device metadata
 */
export interface DeviceMetadata {
  temperature?: number;
  humidity?: number;
}

// =============================================================================
// Room Types
// =============================================================================

/**
 * Raw room data from xComfort Bridge
 */
export interface XComfortRoomData {
  roomId: string;
  name: string;
  devices?: string[];
}

/**
 * Room state update
 */
export interface RoomState {
  switch?: boolean;
  dimmvalue?: number;
  lightsOn?: number;
  loadsOn?: number;
  windowsOpen?: number;
  doorsOpen?: number;
  presence?: number;
  shadsClosed?: number;
  power?: number;
  errorState?: number;
}

// =============================================================================
// Scene Types
// =============================================================================

/**
 * Scene data from xComfort Bridge
 */
export interface XComfortSceneData {
  sceneId: number;
  name: string;
  devices?: SceneDeviceEntry[];
}

/**
 * Device configuration within a scene
 */
export interface SceneDeviceEntry {
  deviceId: string;
  value: number;
}

// =============================================================================
// Protocol Types
// =============================================================================

/**
 * Base protocol message structure
 */
export interface ProtocolMessage {
  type_int: number;
  mc?: number;
  ref?: number;
  payload?: Record<string, unknown>;
}

/**
 * Message types enum (matches XComfortProtocol.js)
 */
export const MESSAGE_TYPES = {
  // System Messages
  NACK: 0,
  ACK: 1,
  HEARTBEAT: 2,
  PING: 3,

  // Connection & Authentication
  CONNECTION_START: 10,
  CONNECTION_CONFIRM: 11,
  SC_INIT_RESPONSE: 12,
  CONNECTION_DECLINED: 13,
  SC_INIT_REQUEST: 14,
  PUBLIC_KEY_RESPONSE: 15,
  SECRET_EXCHANGE: 16,
  SECRET_EXCHANGE_ACK: 17,

  // Authentication
  LOGIN_REQUEST: 30,
  LOGIN_RESPONSE: 32,
  TOKEN_APPLY: 33,
  TOKEN_APPLY_ACK: 34,
  TOKEN_RENEW: 37,
  TOKEN_RENEW_RESPONSE: 38,

  // Data Requests
  REQUEST_DEVICES: 240,
  REQUEST_ROOMS: 242,

  // Device Control
  DEVICE_DIM: 280,
  DEVICE_SWITCH: 281,
  ROOM_DIM: 283,
  ROOM_SWITCH: 284,
  ACTIVATE_SCENE: 285,

  // Response/Data
  SET_ALL_DATA: 300,
  SET_HOME_DATA: 303,
  STATE_UPDATE: 310,
  LOG_DATA: 304,
  LOG_ENTRIES: 408,
  ERROR_INFO: 295,
  SET_BRIDGE_STATE: 364,
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

// =============================================================================
// Event Types
// =============================================================================

/**
 * All bridge events
 */
export interface BridgeEvents extends ConnectionEvents {
  deviceStateChange: [deviceId: string, state: DeviceState];
  roomStateChange: [roomId: string, state: RoomState];
  devicesDiscovered: [devices: XComfortDeviceData[]];
  roomsDiscovered: [rooms: XComfortRoomData[]];
  scenesDiscovered: [scenes: XComfortSceneData[]];
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
// Encryption Types
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
