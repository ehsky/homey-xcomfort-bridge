/**
 * AES-256-CBC Encryption for xComfort Bridge
 *
 * This module handles symmetric encryption/decryption after key exchange.
 * Used for all message traffic once the connection is established.
 */

import crypto from 'node:crypto';
import { ENCRYPTION_CONFIG } from '../types.js';

/**
 * Configuration for the encryption module
 */
export interface EncryptionConfig {
  algorithm: string;
  keySize: number;
  ivSize: number;
  blockSize: number;
}

/**
 * Encryption context containing the AES key and IV
 */
export interface EncryptionContext {
  key: Buffer;
  iv: Buffer;
}

/**
 * Protocol terminator appended to encrypted messages
 */
const MESSAGE_TERMINATOR = '\u0004';

/**
 * Pad a string to AES block size using null bytes
 *
 * NOTE: Python's implementation always pads to the next block.
 * When length % blockSize == 0, it adds a full block (16 bytes) of padding.
 * This matches that behavior exactly.
 *
 * @param str - String to pad
 * @param blockSize - Block size in bytes (default: 16 for AES)
 * @returns Padded buffer
 */
export function padToBlockSize(
  str: string,
  blockSize: number = ENCRYPTION_CONFIG.blockSize
): Buffer {
  const buf = Buffer.from(str, 'utf8');
  const padding = blockSize - (buf.length % blockSize);
  // Always add padding, even if already aligned (matches Python behavior)
  const padded = Buffer.alloc(buf.length + padding, 0);
  buf.copy(padded);
  return padded;
}

/**
 * Remove null-byte padding from decrypted data
 *
 * @param buf - Buffer with potential null-byte padding
 * @returns String with trailing null bytes removed
 */
export function unpad(buf: Buffer): string {
  return buf.toString('utf8').replace(/\x00+$/, '');
}

/**
 * Encrypt a JSON object using AES-256-CBC
 *
 * @param data - Object to encrypt (will be JSON.stringify'd)
 * @param context - Encryption context with key and IV
 * @returns Base64-encoded encrypted string with terminator
 * @throws Error if encryption fails
 */
export function encrypt(
  data: Record<string, unknown>,
  context: EncryptionContext
): string {
  const jsonStr = JSON.stringify(data);
  const padded = padToBlockSize(jsonStr);

  const cipher = crypto.createCipheriv(
    ENCRYPTION_CONFIG.algorithm,
    context.key,
    context.iv
  );
  cipher.setAutoPadding(false);

  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString('base64') + MESSAGE_TERMINATOR;
}

/**
 * Decrypt a base64-encoded AES-256-CBC encrypted message
 *
 * @param encryptedBase64 - Base64-encoded encrypted data (without terminator)
 * @param context - Encryption context with key and IV
 * @returns Decrypted string with padding removed
 * @throws Error if decryption fails
 */
export function decrypt(
  encryptedBase64: string,
  context: EncryptionContext
): string {
  let encryptedBuf = Buffer.from(encryptedBase64, 'base64');

  // Ensure buffer is aligned to block size
  const paddedLength =
    Math.ceil(encryptedBuf.length / ENCRYPTION_CONFIG.blockSize) *
    ENCRYPTION_CONFIG.blockSize;

  if (encryptedBuf.length < paddedLength) {
    const alignedBuf = Buffer.alloc(paddedLength, 0);
    encryptedBuf.copy(alignedBuf);
    encryptedBuf = alignedBuf;
  }

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_CONFIG.algorithm,
    context.key,
    context.iv
  );
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([
    decipher.update(encryptedBuf),
    decipher.final(),
  ]);

  return unpad(decrypted);
}

/**
 * Generate a random AES key
 *
 * @returns Random 32-byte key for AES-256
 */
export function generateKey(): Buffer {
  return crypto.randomBytes(ENCRYPTION_CONFIG.keySize);
}

/**
 * Generate a random initialization vector
 *
 * @returns Random 16-byte IV
 */
export function generateIv(): Buffer {
  return crypto.randomBytes(ENCRYPTION_CONFIG.ivSize);
}

/**
 * Create a new encryption context with random key and IV
 *
 * @returns Fresh encryption context
 */
export function createContext(): EncryptionContext {
  return {
    key: generateKey(),
    iv: generateIv(),
  };
}

/**
 * Format key and IV for RSA encryption exchange
 *
 * The format is: "<hex-key>:::<hex-iv>"
 * This matches the Python implementation's format.
 *
 * @param context - Encryption context
 * @returns Formatted string for RSA encryption
 */
export function formatForExchange(context: EncryptionContext): string {
  return `${context.key.toString('hex')}:::${context.iv.toString('hex')}`;
}

/**
 * Validate that an encryption context has valid key and IV
 *
 * @param context - Context to validate
 * @returns true if context is valid
 */
export function isValidContext(context: EncryptionContext | null): boolean {
  if (!context) return false;
  return (
    Buffer.isBuffer(context.key) &&
    Buffer.isBuffer(context.iv) &&
    context.key.length === ENCRYPTION_CONFIG.keySize &&
    context.iv.length === ENCRYPTION_CONFIG.ivSize
  );
}
