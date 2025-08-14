/**
 * xComfort Bridge Protocol Constants
 * 
 * This module defines all protocol constants, message types, and enums
 * used in the xComfort Bridge WebSocket communication.
 */

// Load basic package info
const packageJson = require('../package.json');

/**
 * Message Types for xComfort Bridge Protocol
 */
const MESSAGE_TYPES = {
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
  
  // Response/Data Messages
  SET_ALL_DATA: 300,
  STATE_UPDATE: 310,
  
  // System Messages
  ACK: 1,
  HEARTBEAT: 2
};

/**
 * Connection States
 */
const CONNECTION_STATES = {
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
const DEVICE_TYPES = {
  DIMMING_ACTUATOR: 101,
  SWITCHING_ACTUATOR: 100,
  TEMPERATURE_SENSOR: 200,
  // Add more as discovered
};

/**
 * Info Text Codes for Metadata
 */
const INFO_TEXT_CODES = {
  TEMPERATURE_STANDARD: "1222",    // Standard temperature sensor reading (°C)
  HUMIDITY_STANDARD: "1223",       // Standard humidity sensor reading (%)
  TEMPERATURE_DIMMER: "1109",      // Temperature from dimming actuator (devType 101)
  // Add more as discovered
};

/**
 * Client Configuration - from package.json
 */
const CLIENT_CONFIG = {
  TYPE: packageJson.xcomfort.clientType,
  ID: packageJson.xcomfort.clientId,
  VERSION: packageJson.version,
  NAME: packageJson.name
};

/**
 * Protocol Configuration
 */
const PROTOCOL_CONFIG = {
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
const ERROR_CODES = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  INVALID_COMMAND: 'INVALID_COMMAND',
  BRIDGE_OFFLINE: 'BRIDGE_OFFLINE'
};

const ERROR_MESSAGES = {
  [ERROR_CODES.CONNECTION_FAILED]: 'Failed to connect to xComfort Bridge',
  [ERROR_CODES.AUTHENTICATION_FAILED]: 'Authentication with xComfort Bridge failed',
  [ERROR_CODES.DEVICE_NOT_FOUND]: 'Device not found on xComfort Bridge',
  [ERROR_CODES.INVALID_COMMAND]: 'Invalid command sent to xComfort Bridge',
  [ERROR_CODES.BRIDGE_OFFLINE]: 'xComfort Bridge not connected'
};

/**
 * Helper function to get message type name from number
 */
function getMessageTypeName(typeInt) {
  const entry = Object.entries(MESSAGE_TYPES).find(([key, value]) => value === typeInt);
  return entry ? entry[0] : `UNKNOWN_${typeInt}`;
}

/**
 * Helper function to validate message type
 */
function isValidMessageType(typeInt) {
  return Object.values(MESSAGE_TYPES).includes(typeInt);
}

/**
 * Helper function to create standardized error
 */
function createProtocolError(code, details = null) {
  const error = new Error(ERROR_MESSAGES[code] || 'Unknown protocol error');
  error.code = code;
  error.details = details;
  return error;
}

module.exports = {
  MESSAGE_TYPES,
  CONNECTION_STATES,
  DEVICE_TYPES,
  INFO_TEXT_CODES,
  CLIENT_CONFIG,
  PROTOCOL_CONFIG,
  ERROR_CODES,
  ERROR_MESSAGES,
  getMessageTypeName,
  isValidMessageType,
  createProtocolError
};
