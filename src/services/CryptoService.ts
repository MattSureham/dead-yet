/**
 * CryptoService — AES-256-CBC encryption layer for Dead Yet.
 *
 * Encrypts sensitive data (death notes, emergency contacts) at rest
 * using a key derived from the user's PIN hash. Data is stored in
 * AsyncStorage as `DEv1:{iv}:{ciphertext}` strings.
 *
 * ## Design
 *
 *   Key derivation: SHA-256(pinHash) → 32-byte AES-256 key
 *   Cipher:          AES-256-CBC with random 16-byte IV and PKCS7 padding
 *   Output format:   `DEv1:${iv_hex_32}:${ciphertext_hex}`
 *
 * ## Key Material
 *
 *   The `pinHash` comes from `SecurityContext.getPinHash()`, which returns
 *   `saltHex:hashHex` — a 97-character hex string produced by `hashPin()`.
 *   This string is hashed once with SHA-256 to produce a 32-byte AES-256 key.
 *   The operation is deterministic and fast (one SHA-256 call on a short string).
 *
 * ## PIN Change Caveat
 *
 *   Changing the PIN produces a new `pinHash` (new random salt), which means
 *   the derived AES key changes. Data encrypted with the old PIN will be
 *   unreadable after a PIN change. A `reEncrypt()` helper is provided for
 *   migration — callers should re-encrypt all stored data after a PIN change.
 *
 * ## Dependencies
 *
 *   - `expo-crypto` — SHA-256 digest, random bytes (already in project)
 *   - `aes-js` — AES-256-CBC cipher, PKCS7 padding (pure JS, ~20 KB)
 *
 * ## Testability
 *
 *   Uses the same injectable crypto pattern as `utils/hash.ts`:
 *   call `setCryptoImpl()` to mock, `resetCryptoImpl()` to restore.
 */

import * as aes from 'aes-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Injectable crypto interface for test mocking (matches hash.ts pattern). */
export interface CryptoServiceCryptoImpl {
  getRandomBytes(count: number): Uint8Array;
  digestAsync(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}

// ---------------------------------------------------------------------------
// Internal crypto loader
// ---------------------------------------------------------------------------

let cryptoImpl: CryptoServiceCryptoImpl | null = null;

/**
 * Inject a mock crypto implementation for testing.
 * Call `resetCryptoImpl()` to restore the real expo-crypto module.
 */
export function setCryptoImpl(impl: CryptoServiceCryptoImpl): void {
  cryptoImpl = impl;
}

/** Restore the real expo-crypto module after a test mock. */
export function resetCryptoImpl(): void {
  cryptoImpl = null;
}

async function loadCrypto(): Promise<CryptoServiceCryptoImpl> {
  if (cryptoImpl) return cryptoImpl;

  try {
    const expoCrypto = await import('expo-crypto');
    const impl: CryptoServiceCryptoImpl = {
      getRandomBytes: (count: number): Uint8Array => {
        return expoCrypto.getRandomBytes(count);
      },
      digestAsync: async (
        _algorithm: 'SHA-256',
        data: Uint8Array,
      ): Promise<ArrayBuffer> => {
        const result = await expoCrypto.digest(
          expoCrypto.CryptoDigestAlgorithm.SHA256,
          data as BufferSource,
        );
        return result;
      },
    };
    cryptoImpl = impl;
    return impl;
  } catch {
    throw new Error(
      'expo-crypto is required for encryption. Install it with: npm install expo-crypto',
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Derive a 32-byte AES-256 key from the user's PIN hash. */
async function deriveKey(pinHash: string): Promise<Uint8Array> {
  const crypto = await loadCrypto();
  const encoder = new TextEncoder();
  const pinHashBytes = encoder.encode(pinHash);
  const keyMaterial = await crypto.digestAsync('SHA-256', pinHashBytes);
  return new Uint8Array(keyMaterial);
}

/** Convert a hex string to a Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Convert a Uint8Array to a hex string. */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENCRYPTED_PREFIX = 'DEv1:';
const IV_BYTE_LENGTH = 16; // AES block size
const IV_HEX_LENGTH = IV_BYTE_LENGTH * 2; // 32 hex chars

// ---------------------------------------------------------------------------
// CryptoService
// ---------------------------------------------------------------------------

class CryptoService {
  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Encrypt plaintext using a key derived from the PIN hash.
   *
   * @param plaintext - The string to encrypt (typically JSON-serialized data).
   * @param pinHash   - The user's PIN hash from `SecurityContext.getPinHash()`.
   * @returns A string in `DEv1:{iv}:{ciphertext}` format ready for storage.
   */
  async encrypt(plaintext: string, pinHash: string): Promise<string> {
    if (!pinHash) {
      throw new Error('pinHash is required for encryption');
    }

    const crypto = await loadCrypto();
    const key = await deriveKey(pinHash);
    const iv = crypto.getRandomBytes(IV_BYTE_LENGTH);

    // Convert plaintext→bytes→pad (use native TextEncoder for full Unicode support)
    const textBytes = new TextEncoder().encode(plaintext);
    const padded = aes.padding.pkcs7.pad(textBytes);

    // AES-256-CBC encrypt
    const aesCbc = new aes.ModeOfOperation.cbc(key, iv);
    const encrypted = aesCbc.encrypt(padded);

    return `${ENCRYPTED_PREFIX}${bytesToHex(iv)}:${bytesToHex(encrypted)}`;
  }

  /**
   * Decrypt data previously encrypted with `encrypt()`.
   *
   * @param encrypted - The `DEv1:{iv}:{ciphertext}` string.
   * @param pinHash   - The user's PIN hash (must match the one used for encryption).
   * @returns The original plaintext string.
   * @throws If the PIN is wrong, data is corrupted, or format is invalid.
   */
  async decrypt(encrypted: string, pinHash: string): Promise<string> {
    if (!pinHash) {
      throw new Error('pinHash is required for decryption');
    }
    if (!encrypted || !this.isEncrypted(encrypted)) {
      throw new Error(
        'Data is not in encrypted format (must start with "DEv1:")',
      );
    }

    const payload = encrypted.slice(ENCRYPTED_PREFIX.length);
    const colonIdx = payload.indexOf(':');
    if (colonIdx === -1) {
      throw new Error('Invalid encrypted format: missing IV separator');
    }

    const ivHex = payload.slice(0, colonIdx);
    const cipherHex = payload.slice(colonIdx + 1);

    if (ivHex.length !== IV_HEX_LENGTH || cipherHex.length < 32) {
      throw new Error('Invalid encrypted format: bad IV or ciphertext length');
    }

    const key = await deriveKey(pinHash);
    const iv = hexToBytes(ivHex);
    const cipherBytes = hexToBytes(cipherHex);

    try {
      const aesCbc = new aes.ModeOfOperation.cbc(key, iv);
      const decrypted = aesCbc.decrypt(cipherBytes);
      const unpadded = aes.padding.pkcs7.strip(decrypted);
      return new TextDecoder().decode(unpadded);
    } catch {
      throw new Error(
        'Decryption failed — wrong PIN or corrupted data',
      );
    }
  }

  /**
   * Check whether a stored value is an encrypted blob.
   *
   * @returns `true` if the string starts with the `DEv1:` prefix.
   */
  isEncrypted(data: unknown): boolean {
    return typeof data === 'string' && data.startsWith(ENCRYPTED_PREFIX);
  }

  /**
   * Re-encrypt a single encrypted value with a new PIN hash.
   *
   * Useful after a PIN change: decrypts with the old hash and immediately
   * re-encrypts with the new one.
   *
   * @param encryptedData - The `DEv1:...` string encrypted with oldPinHash.
   * @param oldPinHash    - The previous PIN hash.
   * @param newPinHash    - The new PIN hash.
   * @returns The re-encrypted data string.
   */
  async reEncrypt(
    encryptedData: string,
    oldPinHash: string,
    newPinHash: string,
  ): Promise<string> {
    const plaintext = await this.decrypt(encryptedData, oldPinHash);
    return this.encrypt(plaintext, newPinHash);
  }
}

/** Singleton instance — import as `cryptoService`. */
export const cryptoService = new CryptoService();
