/**
 * Crypto module exports
 *
 * This module provides all cryptographic functions for the xComfort Bridge:
 * - AES-256-CBC symmetric encryption (for message traffic)
 * - RSA key exchange (for initial handshake)
 * - Hash functions (for authentication)
 */

// AES encryption
export {
  encrypt,
  decrypt,
  padToBlockSize,
  unpad,
  generateKey,
  generateIv,
  createContext,
  formatForExchange,
  isValidContext,
  type EncryptionContext,
  type EncryptionConfig,
} from './Encryption.mjs';

// Hash utilities
export { authHash, generateSalt, generateSecureRandom } from './Hash.mjs';

// RSA key exchange
export {
  parsePublicKey,
  encryptSecret,
  isValidPublicKey,
  type RSAPublicKey,
} from './KeyExchange.mjs';
