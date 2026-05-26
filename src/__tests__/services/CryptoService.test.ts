/**
 * Unit tests for CryptoService — AES-256-CBC encryption/decryption.
 *
 * Uses a mock crypto implementation (Node's built-in crypto for SHA-256 +
 * deterministic "random" bytes) so tests run without native module resolution.
 */

import { cryptoService, setCryptoImpl, resetCryptoImpl, CryptoServiceCryptoImpl } from '../../services/CryptoService';
import * as nodeCrypto from 'crypto';

// ---------------------------------------------------------------------------
// Mock crypto implementation
// ---------------------------------------------------------------------------

/** Real SHA-256 via Node's built-in crypto (synchronous — no dynamic import). */
function mockSha256(data: Uint8Array): Promise<ArrayBuffer> {
  const hash = nodeCrypto.createHash('sha256');
  hash.update(data);
  const buf = hash.digest();
  // Return a copy of the underlying ArrayBuffer
  const ab = new ArrayBuffer(buf.byteLength);
  const view = new Uint8Array(ab);
  view.set(buf);
  return Promise.resolve(ab);
}

/** Deterministic "random" bytes for reproducible tests. */
let mockCounter = 0;

function mockRandomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    bytes[i] = (mockCounter + i) % 256;
  }
  mockCounter += count;
  return bytes;
}

const mockCrypto: CryptoServiceCryptoImpl = {
  getRandomBytes: mockRandomBytes,
  digestAsync: (_algo, data) => mockSha256(data),
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockCounter = 0;
  resetCryptoImpl();
  setCryptoImpl(mockCrypto);
});

afterEach(() => {
  resetCryptoImpl();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CryptoService', () => {
  const samplePinHash =
    'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6:a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8';

  describe('encrypt + decrypt roundtrip', () => {
    it('encrypts and decrypts a simple string', async () => {
      const plaintext = 'Hello, Dead Yet!';
      const encrypted = await cryptoService.encrypt(plaintext, samplePinHash);
      const decrypted = await cryptoService.decrypt(encrypted, samplePinHash);

      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts JSON data', async () => {
      const data = JSON.stringify({
        name: 'John Doe',
        accounts: [{ institution: 'Bank of America', type: 'bank' }],
        other: 'Some important notes here.',
      });
      const encrypted = await cryptoService.encrypt(data, samplePinHash);
      const decrypted = await cryptoService.decrypt(encrypted, samplePinHash);

      expect(decrypted).toBe(data);
      expect(JSON.parse(decrypted)).toEqual({
        name: 'John Doe',
        accounts: [{ institution: 'Bank of America', type: 'bank' }],
        other: 'Some important notes here.',
      });
    });

    it('encrypts and decrypts an empty string', async () => {
      const encrypted = await cryptoService.encrypt('', samplePinHash);
      const decrypted = await cryptoService.decrypt(encrypted, samplePinHash);

      expect(decrypted).toBe('');
    });

    it('encrypts and decrypts a long string (10KB)', async () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = await cryptoService.encrypt(plaintext, samplePinHash);
      const decrypted = await cryptoService.decrypt(encrypted, samplePinHash);

      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts unicode text', async () => {
      const plaintext = '日本語テスト 🎉 Café résumé 你好';
      const encrypted = await cryptoService.encrypt(plaintext, samplePinHash);
      const decrypted = await cryptoService.decrypt(encrypted, samplePinHash);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('encrypted output format', () => {
    it('produces output starting with DEv1: prefix', async () => {
      const encrypted = await cryptoService.encrypt('test', samplePinHash);
      expect(encrypted.startsWith('DEv1:')).toBe(true);
    });

    it('contains exactly two colons (prefix + IV:data separator)', async () => {
      const encrypted = await cryptoService.encrypt('test', samplePinHash);
      const afterPrefix = encrypted.slice(5); // skip 'DEv1:'
      const colonCount = afterPrefix.split(':').length - 1;
      expect(colonCount).toBe(1);
    });

    it('produces a 32-char hex IV', async () => {
      const encrypted = await cryptoService.encrypt('test', samplePinHash);
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3); // DEv1, IV, ciphertext
      expect(parts[1].length).toBe(32); // 16 bytes = 32 hex chars
    });

    it('produces different ciphertexts for the same plaintext (random IV)', async () => {
      const e1 = await cryptoService.encrypt('test', samplePinHash);
      mockCounter = 100; // advance counter to get different IV
      const e2 = await cryptoService.encrypt('test', samplePinHash);

      // Same plaintext but different IV should produce different ciphertext
      expect(e1).not.toBe(e2);
    });
  });

  describe('wrong PIN hash', () => {
    const wrongPinHash =
      'ffffffffffffffffffffffffffffffff:0000000000000000000000000000000000000000000000000000000000000000';

    it('throws on decrypt with wrong pinHash', async () => {
      const encrypted = await cryptoService.encrypt('secret', samplePinHash);

      await expect(
        cryptoService.decrypt(encrypted, wrongPinHash),
      ).rejects.toThrow();
    });

    it('different pinHash produces different derived key', async () => {
      const e1 = await cryptoService.encrypt('test', samplePinHash);
      const e2 = await cryptoService.encrypt('test', wrongPinHash);

      // Same plaintext, different keys → different ciphertext
      expect(e1).not.toBe(e2);

      // Each should decrypt with its own key
      const d1 = await cryptoService.decrypt(e1, samplePinHash);
      const d2 = await cryptoService.decrypt(e2, wrongPinHash);
      expect(d1).toBe('test');
      expect(d2).toBe('test');

      // Cross-decryption should fail
      await expect(
        cryptoService.decrypt(e1, wrongPinHash),
      ).rejects.toThrow();
    });
  });

  describe('isEncrypted', () => {
    it('returns true for DEv1: prefix', () => {
      expect(cryptoService.isEncrypted('DEv1:abc123:def456')).toBe(true);
    });

    it('returns false for plaintext', () => {
      expect(cryptoService.isEncrypted('{"key": "value"}')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(cryptoService.isEncrypted('')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(cryptoService.isEncrypted(null)).toBe(false);
      expect(cryptoService.isEncrypted(undefined)).toBe(false);
    });

    it('returns false for numbers', () => {
      expect(cryptoService.isEncrypted(123)).toBe(false);
    });

    it('returns true for actual encrypted output', async () => {
      const encrypted = await cryptoService.encrypt('test', samplePinHash);
      expect(cryptoService.isEncrypted(encrypted)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('throws when encrypting with empty pinHash', async () => {
      await expect(cryptoService.encrypt('test', '')).rejects.toThrow(
        'pinHash is required',
      );
    });

    it('throws when decrypting with empty pinHash', async () => {
      await expect(
        cryptoService.decrypt('DEv1:abc:def', ''),
      ).rejects.toThrow('pinHash is required');
    });

    it('throws when decrypting non-encrypted data', async () => {
      await expect(
        cryptoService.decrypt('plain text', samplePinHash),
      ).rejects.toThrow('not in encrypted format');
    });

    it('throws when decrypting with missing IV separator', async () => {
      await expect(
        cryptoService.decrypt('DEv1:no-separator-here', samplePinHash),
      ).rejects.toThrow('missing IV separator');
    });

    it('throws when decrypting with bad IV length', async () => {
      await expect(
        cryptoService.decrypt('DEv1:short:someciphertext', samplePinHash),
      ).rejects.toThrow('bad IV');
    });

    it('throws when decrypting corrupted ciphertext', async () => {
      const encrypted = await cryptoService.encrypt('test', samplePinHash);
      // Corrupt the ciphertext by flipping bits in the last portion
      const corrupted = encrypted.slice(0, -4) + 'ffff';
      await expect(
        cryptoService.decrypt(corrupted, samplePinHash),
      ).rejects.toThrow();
    });
  });

  describe('reEncrypt', () => {
    const newPinHash =
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

    it('re-encrypts data with a new pinHash', async () => {
      const encrypted = await cryptoService.encrypt('migrate me', samplePinHash);
      const reEncrypted = await cryptoService.reEncrypt(
        encrypted,
        samplePinHash,
        newPinHash,
      );

      // Should decrypt with the new pinHash
      const decrypted = await cryptoService.decrypt(reEncrypted, newPinHash);
      expect(decrypted).toBe('migrate me');

      // Should NOT decrypt with the old pinHash
      await expect(
        cryptoService.decrypt(reEncrypted, samplePinHash),
      ).rejects.toThrow();
    });
  });

  describe('key derivation determinism', () => {
    it('produces the same ciphertext for the same pinHash and plaintext (fixed IV)', async () => {
      // Reset mock counter so IVs are the same
      mockCounter = 0;
      const e1 = await cryptoService.encrypt('same', samplePinHash);

      mockCounter = 0;
      const e2 = await cryptoService.encrypt('same', samplePinHash);

      // Same plaintext + same key + same IV → identical ciphertext
      expect(e1).toBe(e2);
    });
  });
});
