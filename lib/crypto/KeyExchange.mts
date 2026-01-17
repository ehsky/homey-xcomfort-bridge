/**
 * RSA Key Exchange for xComfort Bridge
 *
 * Handles the initial key exchange where we receive the bridge's public key
 * and send our AES key/IV encrypted with RSA.
 */

import forge from 'node-forge';
import { ENCRYPTION_CONFIG } from '../types.mjs';
import type { EncryptionContext } from './Encryption.mjs';

/**
 * RSA public key type from node-forge
 */
export type RSAPublicKey = forge.pki.rsa.PublicKey;

/**
 * Parse a PEM-encoded public key string
 *
 * @param pemString - PEM-encoded public key from bridge
 * @returns Parsed public key object
 * @throws Error if PEM is invalid
 */
export function parsePublicKey(pemString: string): RSAPublicKey {
  return forge.pki.publicKeyFromPem(pemString);
}

/**
 * Encrypt the AES key and IV for sending to the bridge
 *
 * The format is: "<hex-key>:::<hex-iv>" encrypted with RSA PKCS#1 v1.5
 * and then base64 encoded.
 *
 * @param publicKey - Bridge's RSA public key
 * @param context - Encryption context containing AES key and IV
 * @returns Base64-encoded encrypted secret
 */
export function encryptSecret(
  publicKey: RSAPublicKey,
  context: EncryptionContext
): string {
  // Format: "hex(key):::hex(iv)"
  const secretStr = `${context.key.toString('hex')}:::${context.iv.toString('hex')}`;

  // Encrypt with RSA PKCS#1 v1.5 (matches Python implementation)
  // Cast to 'RSAES-PKCS1-V1_5' which is what node-forge expects
  const encrypted = publicKey.encrypt(
    secretStr,
    ENCRYPTION_CONFIG.rsaScheme as 'RSAES-PKCS1-V1_5'
  );

  // Convert binary string to base64
  return Buffer.from(encrypted, 'binary').toString('base64');
}

/**
 * Validate a public key is suitable for key exchange
 *
 * @param publicKey - Key to validate
 * @returns true if key is valid for encryption
 */
export function isValidPublicKey(publicKey: RSAPublicKey | null): boolean {
  if (!publicKey) return false;

  try {
    // Try to get the key size - if this works, the key is usable
    const keySize = (publicKey as forge.pki.rsa.PublicKey).n.bitLength();
    // Expect at least 2048-bit key for security
    return keySize >= 2048;
  } catch {
    return false;
  }
}
