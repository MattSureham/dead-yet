import { hashPin, verifyPin, setCryptoImpl, resetCryptoImpl, CryptoImpl } from '../../utils/hash';

/**
 * Deterministic mock crypto implementation for testing.
 * Produces consistent hashes purely from input data (no call count).
 */
function createMockCrypto(): CryptoImpl {
  return {
    getRandomBytes: (count: number) => {
      const bytes = new Uint8Array(count);
      for (let i = 0; i < count; i++) bytes[i] = (i * 13 + 7) % 256;
      return bytes.buffer;
    },
    digestAsync: async (_algorithm: 'SHA-256', data: Uint8Array) => {
      // Deterministic hash based solely on input bytes
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum = (sum * 31 + data[i]) & 0xffffffff;
      }
      const hash = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        hash[i] = ((sum >> (i % 4) * 8) + i * 7) & 0xff;
      }
      // Return ArrayBuffer as required by CryptoImpl interface
      return hash.buffer.slice(0) as ArrayBuffer;
    },
  };
}

describe('hashPin', () => {
  beforeEach(() => {
    resetCryptoImpl();
    setCryptoImpl(createMockCrypto());
  });

  afterEach(() => {
    resetCryptoImpl();
  });

  it('returns a salt:hash formatted string', async () => {
    const result = await hashPin('1234');
    expect(result).toContain(':');
    const [salt, hash] = result.split(':');
    expect(salt.length).toBe(32); // 16 bytes = 32 hex chars
    expect(hash.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it('produces different hashes for different PINs', async () => {
    const hash1 = await hashPin('1234');
    const hash2 = await hashPin('5678');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPin', () => {
  beforeEach(() => {
    resetCryptoImpl();
    setCryptoImpl(createMockCrypto());
  });

  afterEach(() => {
    resetCryptoImpl();
  });

  it('handles legacy plaintext PIN comparison', async () => {
    const legacyPin = '1234';
    const result = await verifyPin('1234', legacyPin);
    expect(result).toBe(true);
  });

  it('rejects wrong PIN for legacy plaintext', async () => {
    const result = await verifyPin('9999', '1234');
    expect(result).toBe(false);
  });

  it('verifies a PIN against a hashed value', async () => {
    const pin = '987654';
    const storedHash = await hashPin(pin);
    const result = await verifyPin(pin, storedHash);
    expect(result).toBe(true);
  });

  it('rejects wrong PIN against hashed value', async () => {
    const storedHash = await hashPin('123456');
    const result = await verifyPin('999999', storedHash);
    expect(result).toBe(false);
  });

  it('returns false for empty or malformed stored hash', async () => {
    expect(await verifyPin('1234', '')).toBe(false);
  });
});
