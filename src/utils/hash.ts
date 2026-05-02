/**
 * PIN hashing utilities for Dead Yet.
 *
 * Uses SHA-256 with a random 16-byte salt to securely hash the user's PIN
 * before storing. The salt is embedded with the hash using the `salt:hash`
 * format so it can be verified later.
 *
 * Requirements: expo-crypto (added as dependency)
 *
 * The crypto implementation is injected via `setCryptoImpl()` to allow
 * seamless mocking in test environments without native module resolution.
 */

export interface CryptoImpl {
  getRandomBytes(count: number): ArrayBuffer;
  digestAsync(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}

let cryptoImpl: CryptoImpl | null = null;

export function setCryptoImpl(impl: CryptoImpl): void {
  cryptoImpl = impl;
}

export function resetCryptoImpl(): void {
  cryptoImpl = null;
}

async function loadCrypto(): Promise<CryptoImpl> {
  if (cryptoImpl) return cryptoImpl;

  try {
    const expoCrypto = await import('expo-crypto');
    const impl: CryptoImpl = {
      getRandomBytes: (count: number): ArrayBuffer => {
        // expo-crypto returns Uint8Array; extract the underlying ArrayBuffer
        const bytes = expoCrypto.getRandomBytes(count);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      },
      digestAsync: async (_algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer> => {
        // expo-crypto.digest accepts BufferSource
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
      'expo-crypto is required for PIN hashing. Install it with: npm install expo-crypto',
    );
  }
}

/** Helper: get a safe ArrayBuffer from a Uint8Array */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

/**
 * Hash a PIN using a random salt.
 * Returns a string in the format "saltHex:hashHex".
 */
export async function hashPin(pin: string): Promise<string> {
  const crypto = await loadCrypto();

  const salt = crypto.getRandomBytes(16);
  const saltHex = arrayBufferToHex(salt);

  const encoder = new TextEncoder();
  const pinBuffer = encoder.encode(pin);

  // SHA-256(pin) then SHA-256(salt || SHA-256(pin)) for effective salted hash
  const keyMaterial = await crypto.digestAsync('SHA-256', pinBuffer);
  const combined = new Uint8Array(salt.byteLength + keyMaterial.byteLength);
  combined.set(new Uint8Array(salt), 0);
  combined.set(new Uint8Array(keyMaterial), salt.byteLength);

  const hashResult = await crypto.digestAsync('SHA-256', combined);
  const hashHex = arrayBufferToHex(hashResult);

  return `${saltHex}:${hashHex}`;
}

/**
 * Verify a PIN against a previously hashed value.
 * @param pin - The plaintext PIN to verify
 * @param storedHash - The stored hash in "saltHex:hashHex" format (or legacy plaintext)
 * @returns true if the PIN matches
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.includes(':')) {
    // Legacy plaintext PIN fallback — compare directly (transitional)
    return pin === storedHash;
  }

  const crypto = await loadCrypto();
  const [saltHex] = storedHash.split(':');
  const salt = hexToArrayBuffer(saltHex);

  const encoder = new TextEncoder();
  const pinBuffer = encoder.encode(pin);

  const keyMaterial = await crypto.digestAsync('SHA-256', pinBuffer);
  const combined = new Uint8Array(salt.byteLength + keyMaterial.byteLength);
  combined.set(new Uint8Array(salt), 0);
  combined.set(new Uint8Array(keyMaterial), salt.byteLength);

  const hashResult = await crypto.digestAsync('SHA-256', combined);
  const computedHash = `${saltHex}:${arrayBufferToHex(hashResult)}`;

  return computedHash === storedHash;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return toArrayBuffer(bytes);
}
