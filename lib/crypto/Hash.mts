/**
 * Hash utilities for xComfort Bridge authentication
 *
 * These hash functions are used during the authentication handshake.
 * The format matches the Python reference implementation exactly.
 */

import crypto from 'node:crypto';

/**
 * Characters used for random salt generation
 */
const SALT_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Default salt length for authentication
 */
const DEFAULT_SALT_LENGTH = 32;

/**
 * Generate authentication hash for xComfort Bridge login
 *
 * This implements the double-SHA256 hash used by the xComfort protocol.
 * Format matches Python: sha256(salt + sha256(deviceId + authKey).hex()).hex()
 *
 * @param deviceId - Bridge device ID (from CONNECTION_START)
 * @param authKey - User's authentication key (from bridge setup)
 * @param salt - Random salt string
 * @returns Hex-encoded hash string
 */
export function authHash(
  deviceId: string,
  authKey: string,
  salt: string
): string {
  // Inner hash: SHA256(deviceId + authKey)
  const innerHash = crypto.createHash('sha256');
  innerHash.update(deviceId);
  innerHash.update(authKey);
  const innerDigest = innerHash.digest('hex');

  // Outer hash: SHA256(salt + innerDigest)
  const outerHash = crypto.createHash('sha256');
  outerHash.update(salt);
  outerHash.update(innerDigest);

  return outerHash.digest('hex');
}

/**
 * Generate a random salt string for authentication
 *
 * Uses cryptographically secure random number generator.
 *
 * @param length - Length of salt to generate (default: 32)
 * @returns Random alphanumeric string
 */
export function generateSalt(length: number = DEFAULT_SALT_LENGTH): string {
  const bytes = crypto.randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    // Use modulo to map random byte to character index
    // This is slightly biased but acceptable for salt generation
    const index = bytes[i]! % SALT_CHARS.length;
    result += SALT_CHARS[index];
  }

  return result;
}

/**
 * Generate a cryptographically secure random string using only
 * characters that are safe for protocol messages
 *
 * @param length - Length of string to generate
 * @returns Random string
 */
export function generateSecureRandom(length: number): string {
  return generateSalt(length);
}
