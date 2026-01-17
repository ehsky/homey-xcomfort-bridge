/**
 * xComfort Bridge Protocol Constants
 *
 * This module defines all protocol constants, message types, and enums
 * used in the xComfort Bridge WebSocket communication.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as {
  name: string;
  xcomfort: {
    clientType: string;
    clientId: string;
    clientVersion: string;
  };
};

/**
 * Message Types for xComfort Bridge Protocol
 */
export const MESSAGE_TYPES = {
  // System Messages
  NACK: 0,
  ACK: 1,
  HEARTBEAT: 2,
  PING: 3,

  // Connection & Authentication Flow
  CONNECTION_START: 10,
  CONNECTION_CONFIRM: 11,
  SC_INIT_RESPONSE: 12,
  CONNECTION_DECLINED: 13,
  SC_INIT_REQUEST: 14,
  PUBLIC_KEY_RESPONSE: 15,
  SECRET_EXCHANGE: 16,
  SECRET_EXCHANGE_ACK: 17,

  // Authentication Messages
  LOGIN_REQUEST: 30,
  LOGIN_RESPONSE: 32,
  TOKEN_APPLY: 33,
  TOKEN_APPLY_ACK: 34,
  TOKEN_RENEW: 37,
  TOKEN_RENEW_RESPONSE: 38,

  // Data Request Messages
  REQUEST_DEVICES: 240,
  REQUEST_ROOMS: 242,

  // Device Control Messages
  DEVICE_DIM: 280,
  DEVICE_SWITCH: 281,
  ROOM_DIM: 283,
  ROOM_SWITCH: 284,
  ACTIVATE_SCENE: 285,

  // Response/Data Messages
  SET_ALL_DATA: 300,
  SET_HOME_DATA: 303,
  STATE_UPDATE: 310,
  LOG_DATA: 304,
  LOG_ENTRIES: 408,
  ERROR_INFO: 295,
  SET_BRIDGE_STATE: 364,
} as const;

/** Message type values */
export type MessageTypeValue = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

/**
 * Connection States
 */
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  ERROR: 'error',
} as const;

export type ConnectionState =
  (typeof CONNECTION_STATES)[keyof typeof CONNECTION_STATES];

/**
 * Device Types (based on devType field)
 */
export const DEVICE_TYPES = {
  DIMMING_ACTUATOR: 101,
  SWITCHING_ACTUATOR: 100,
  TEMPERATURE_SENSOR: 200,
  // Add more as discovered
} as const;

export type DeviceType = (typeof DEVICE_TYPES)[keyof typeof DEVICE_TYPES];

/**
 * Info Text Codes for Metadata
 */
export const INFO_TEXT_CODES = {
  TEMPERATURE_STANDARD: '1222', // Standard temperature sensor reading (°C)
  HUMIDITY_STANDARD: '1223', // Standard humidity sensor reading (%)
  TEMPERATURE_DIMMER: '1109', // Temperature from dimming actuator
  COMPONENT_CHANNEL: '1111', // Component channel information
  COMPONENT_STATUS: '1119', // Component status information
  // Add more as discovered
} as const;

export type InfoTextCode = (typeof INFO_TEXT_CODES)[keyof typeof INFO_TEXT_CODES];

/**
 * Component Types (based on compType field)
 */
export const COMPONENT_TYPES = {
  DIMMING_ACTUATOR_COMP: 77, // Hardware component for dimming actuators
  // Add more as discovered
} as const;

export type ComponentType =
  (typeof COMPONENT_TYPES)[keyof typeof COMPONENT_TYPES];

/**
 * Timer Types (based on type field)
 */
export const TIMER_TYPES = {
  STANDARD_TIMER: 1, // Standard scheduling timer
  // Add more as discovered
} as const;

export type TimerType = (typeof TIMER_TYPES)[keyof typeof TIMER_TYPES];

/**
 * Client Configuration - from package.json
 */
export const CLIENT_CONFIG = {
  TYPE: packageJson.xcomfort.clientType,
  ID: packageJson.xcomfort.clientId,
  VERSION: packageJson.xcomfort.clientVersion,
  NAME: packageJson.name,
} as const;

/**
 * Protocol Configuration
 */
export const PROTOCOL_CONFIG = {
  ENCRYPTION: {
    ALGORITHM: 'aes-256-cbc',
    KEY_SIZE: 32,
    IV_SIZE: 16,
    BLOCK_SIZE: 16,
    RSA_SCHEME: 'RSAES-PKCS1-V1_5',
  },
  TIMEOUTS: {
    CONNECTION: 30000, // 30 seconds
    HEARTBEAT: 30000, // 30 seconds
    RECONNECT_DELAY: 5000, // 5 seconds
  },
  LIMITS: {
    DIM_MIN: 1,
    DIM_MAX: 99,
    SALT_LENGTH: 12,
  },
} as const;

/**
 * Error Codes
 */
export const ERROR_CODES = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  INVALID_COMMAND: 'INVALID_COMMAND',
  BRIDGE_OFFLINE: 'BRIDGE_OFFLINE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Error Messages
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.CONNECTION_FAILED]: 'Failed to connect to xComfort Bridge',
  [ERROR_CODES.AUTHENTICATION_FAILED]:
    'Authentication with xComfort Bridge failed',
  [ERROR_CODES.DEVICE_NOT_FOUND]: 'Device not found on xComfort Bridge',
  [ERROR_CODES.INVALID_COMMAND]: 'Invalid command sent to xComfort Bridge',
  [ERROR_CODES.BRIDGE_OFFLINE]: 'xComfort Bridge not connected',
};

/**
 * Protocol error with code and details
 */
export interface ProtocolError extends Error {
  code: ErrorCode;
  details: unknown;
}

/**
 * Helper function to get message type name from number
 */
export function getMessageTypeName(typeInt: number): string {
  const entry = Object.entries(MESSAGE_TYPES).find(
    ([, value]) => value === typeInt
  );
  return entry ? entry[0] : `UNKNOWN_${typeInt}`;
}

/**
 * Helper function to validate message type
 */
export function isValidMessageType(typeInt: number): boolean {
  return Object.values(MESSAGE_TYPES).includes(typeInt as MessageTypeValue);
}

/**
 * Helper function to create standardized error
 */
export function createProtocolError(
  code: ErrorCode,
  details: unknown = null
): ProtocolError {
  const error = new Error(
    ERROR_MESSAGES[code] || 'Unknown protocol error'
  ) as ProtocolError;
  error.code = code;
  error.details = details;
  return error;
}
