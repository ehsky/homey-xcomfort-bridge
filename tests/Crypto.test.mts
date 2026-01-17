/**
 * Unit tests for Crypto modules
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
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
} from '../lib/crypto/Encryption.mjs';
import { authHash, generateSalt } from '../lib/crypto/Hash.mjs';
import { ENCRYPTION_CONFIG } from '../lib/types.mjs';

describe('Encryption', () => {
  describe('padToBlockSize', () => {
    it('pads short strings to 16 bytes', () => {
      const padded = padToBlockSize('hello');
      assert.strictEqual(padded.length, 16);
      assert.strictEqual(padded.toString('utf8').startsWith('hello'), true);
    });

    it('adds full block when already aligned (Python behavior)', () => {
      // 16 chars = exactly one block, should add another full block
      const input = '1234567890123456';
      const padded = padToBlockSize(input);
      assert.strictEqual(padded.length, 32); // 16 + 16
    });

    it('pads with null bytes', () => {
      const padded = padToBlockSize('hi');
      // 'hi' is 2 bytes, padded to 16
      assert.strictEqual(padded[2], 0);
      assert.strictEqual(padded[15], 0);
    });
  });

  describe('unpad', () => {
    it('removes trailing null bytes', () => {
      const buf = Buffer.from('hello\x00\x00\x00');
      assert.strictEqual(unpad(buf), 'hello');
    });

    it('handles strings without padding', () => {
      const buf = Buffer.from('hello');
      assert.strictEqual(unpad(buf), 'hello');
    });
  });

  describe('generateKey', () => {
    it('generates 32-byte key for AES-256', () => {
      const key = generateKey();
      assert.strictEqual(key.length, ENCRYPTION_CONFIG.keySize);
      assert.strictEqual(Buffer.isBuffer(key), true);
    });

    it('generates different keys each time', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      assert.notDeepStrictEqual(key1, key2);
    });
  });

  describe('generateIv', () => {
    it('generates 16-byte IV', () => {
      const iv = generateIv();
      assert.strictEqual(iv.length, ENCRYPTION_CONFIG.ivSize);
      assert.strictEqual(Buffer.isBuffer(iv), true);
    });
  });

  describe('createContext', () => {
    it('creates valid context with key and IV', () => {
      const ctx = createContext();
      assert.strictEqual(ctx.key.length, ENCRYPTION_CONFIG.keySize);
      assert.strictEqual(ctx.iv.length, ENCRYPTION_CONFIG.ivSize);
    });
  });

  describe('isValidContext', () => {
    it('returns true for valid context', () => {
      const ctx = createContext();
      assert.strictEqual(isValidContext(ctx), true);
    });

    it('returns false for null', () => {
      assert.strictEqual(isValidContext(null), false);
    });

    it('returns false for wrong key size', () => {
      const ctx: EncryptionContext = {
        key: Buffer.alloc(16), // Wrong size
        iv: Buffer.alloc(16),
      };
      assert.strictEqual(isValidContext(ctx), false);
    });
  });

  describe('formatForExchange', () => {
    it('formats as hex(key):::hex(iv)', () => {
      const ctx = createContext();
      const formatted = formatForExchange(ctx);
      assert.ok(formatted.includes(':::'));
      const [keyHex, ivHex] = formatted.split(':::');
      assert.strictEqual(keyHex!.length, 64); // 32 bytes = 64 hex chars
      assert.strictEqual(ivHex!.length, 32); // 16 bytes = 32 hex chars
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('encrypts and decrypts JSON objects', () => {
      const ctx = createContext();
      const original = { type_int: 1, payload: { value: 42 } };

      const encrypted = encrypt(original, ctx);

      // Encrypted should be base64 with terminator
      assert.ok(encrypted.endsWith('\u0004'));
      const base64Part = encrypted.slice(0, -1);
      assert.ok(/^[A-Za-z0-9+/=]+$/.test(base64Part));

      // Decrypt (remove terminator first)
      const decrypted = decrypt(base64Part, ctx);
      const parsed = JSON.parse(decrypted);

      assert.deepStrictEqual(parsed, original);
    });

    it('handles empty payload', () => {
      const ctx = createContext();
      const original = { type_int: 5 };

      const encrypted = encrypt(original, ctx);
      const base64Part = encrypted.slice(0, -1);
      const decrypted = decrypt(base64Part, ctx);

      assert.deepStrictEqual(JSON.parse(decrypted), original);
    });

    it('handles unicode strings in payload', () => {
      const ctx = createContext();
      const original = { message: 'Héllo Wörld 🌍' };

      const encrypted = encrypt(original, ctx);
      const base64Part = encrypted.slice(0, -1);
      const decrypted = decrypt(base64Part, ctx);

      assert.deepStrictEqual(JSON.parse(decrypted), original);
    });
  });
});

describe('Hash', () => {
  describe('generateSalt', () => {
    it('generates default 32 character salt', () => {
      const salt = generateSalt();
      assert.strictEqual(salt.length, 32);
    });

    it('generates specified length salt', () => {
      const salt = generateSalt(16);
      assert.strictEqual(salt.length, 16);
    });

    it('uses only alphanumeric characters', () => {
      const salt = generateSalt(100);
      assert.ok(/^[A-Za-z0-9]+$/.test(salt));
    });

    it('generates different salts each time', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      assert.notStrictEqual(salt1, salt2);
    });
  });

  describe('authHash', () => {
    it('produces 64-character hex hash', () => {
      const hash = authHash('device123', 'authkey', 'randomsalt');
      assert.strictEqual(hash.length, 64);
      assert.ok(/^[0-9a-f]+$/.test(hash));
    });

    it('is deterministic with same inputs', () => {
      const hash1 = authHash('device', 'key', 'salt');
      const hash2 = authHash('device', 'key', 'salt');
      assert.strictEqual(hash1, hash2);
    });

    it('changes with different salt', () => {
      const hash1 = authHash('device', 'key', 'salt1');
      const hash2 = authHash('device', 'key', 'salt2');
      assert.notStrictEqual(hash1, hash2);
    });

    it('changes with different device ID', () => {
      const hash1 = authHash('device1', 'key', 'salt');
      const hash2 = authHash('device2', 'key', 'salt');
      assert.notStrictEqual(hash1, hash2);
    });

    it('changes with different auth key', () => {
      const hash1 = authHash('device', 'key1', 'salt');
      const hash2 = authHash('device', 'key2', 'salt');
      assert.notStrictEqual(hash1, hash2);
    });
  });
});
