/**
 * xComfort Bridge Protocol Constants
 * 
 * This module defines all protocol constants, message types, and enums
 * used in the xComfort Bridge WebSocket communication.
 */

// Load basic package info
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

/**
 * Message Types for xComfort Bridge Protocol
 */
export const MESSAGE_TYPES = {
  // Connection & Authentication Flow
  CONNECTION_START: 10,
  CONNECTION_CONFIRM: 11,
  SC_INIT_RESPONSE: 12,
  SC_INIT_REQUEST: 14,
  PUBLIC_KEY_RESPONSE: 15,
  SECRET_EXCHANGE: 16,
  SECRET_EXCHANGE_ACK: 17,
  
  // Authentication Messages
  LOGIN_REQUEST: 30,
  LOGIN_RESPONSE: 32,
  TOKEN_APPLY: 33,
  TOKEN_APPLY_ACK: 34,
  
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
  
  // System Messages
  ACK: 1,
  HEARTBEAT: 2
};

/**
 * Connection States
 */
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  ERROR: 'error'
};

/**
 * Device Types (based on devType field)
 */
export const DEVICE_TYPES = {
  DIMMING_ACTUATOR: 101,
  SWITCHING_ACTUATOR: 100,
  TEMPERATURE_SENSOR: 200,
  // Add more as discovered
};

/**
 * Info Text Codes for Metadata
 */
export const INFO_TEXT_CODES = {
  TEMPERATURE_STANDARD: "1222",    // Standard temperature sensor reading (°C)
  HUMIDITY_STANDARD: "1223",       // Standard humidity sensor reading (%)
  TEMPERATURE_DIMMER: "1109",      // Temperature from dimming actuator
  COMPONENT_CHANNEL: "1111",       // Component channel information
  COMPONENT_STATUS: "1119",        // Component status information
  // Add more as discovered
};

/**
 * Component Types (based on compType field)
 */
export const COMPONENT_TYPES = {
  DIMMING_ACTUATOR_COMP: 77,       // Hardware component for dimming actuators
  // Add more as discovered
};

/**
 * Timer Types (based on type field)
 */
export const TIMER_TYPES = {
  STANDARD_TIMER: 1,               // Standard scheduling timer
  // Add more as discovered
};

/**
 * Client Configuration - from package.json
 */
export const CLIENT_CONFIG = {
  TYPE: packageJson.xcomfort.clientType,
  ID: packageJson.xcomfort.clientId,
  VERSION: packageJson.xcomfort.clientVersion,
  NAME: packageJson.name
};

/**
 * Protocol Configuration
 */
export const PROTOCOL_CONFIG = {
  ENCRYPTION: {
    ALGORITHM: 'aes-256-cbc',
    KEY_SIZE: 32,
    IV_SIZE: 16,
    BLOCK_SIZE: 16,
    RSA_SCHEME: 'RSAES-PKCS1-V1_5'
  },
  TIMEOUTS: {
    CONNECTION: 30000,      // 30 seconds
    HEARTBEAT: 30000,       // 30 seconds
    RECONNECT_DELAY: 5000   // 5 seconds
  },
  LIMITS: {
    DIM_MIN: 1,
    DIM_MAX: 99,
    SALT_LENGTH: 12
  }
};

/**
 * Error Codes and Messages
 */
export const ERROR_CODES = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  INVALID_COMMAND: 'INVALID_COMMAND',
  BRIDGE_OFFLINE: 'BRIDGE_OFFLINE'
};

export const ERROR_MESSAGES = {
  [ERROR_CODES.CONNECTION_FAILED]: 'Failed to connect to xComfort Bridge',
  [ERROR_CODES.AUTHENTICATION_FAILED]: 'Authentication with xComfort Bridge failed',
  [ERROR_CODES.DEVICE_NOT_FOUND]: 'Device not found on xComfort Bridge',
  [ERROR_CODES.INVALID_COMMAND]: 'Invalid command sent to xComfort Bridge',
  [ERROR_CODES.BRIDGE_OFFLINE]: 'xComfort Bridge not connected'
};

/**
 * Helper function to get message type name from number
 */
export function getMessageTypeName(typeInt) {
  const entry = Object.entries(MESSAGE_TYPES).find(([key, value]) => value === typeInt);
  return entry ? entry[0] : `UNKNOWN_${typeInt}`;
}

/**
 * Helper function to validate message type
 */
export function isValidMessageType(typeInt) {
  return Object.values(MESSAGE_TYPES).includes(typeInt);
}

/**
 * Helper function to create standardized error
 */
export function createProtocolError(code, details = null) {
  const error = new Error(ERROR_MESSAGES[code] || 'Unknown protocol error');
  error.code = code;
  error.details = details;
  return error;
}
