/**
 * HMAC-SHA256 — Implementación propia según RFC 2104
 * 
 * HMAC(K, m) = H((K' ⊕ opad) || H((K' ⊕ ipad) || m))
 * 
 * Donde:
 * - K' = K si |K| ≤ block_size, sino K' = H(K)
 * - ipad = 0x36 repetido block_size veces
 * - opad = 0x5c repetido block_size veces
 * - block_size = 64 bytes para SHA-256
 */

import { sha256 } from './sha256';
import { xorBytes } from './utils';

const BLOCK_SIZE = 64; // Tamaño de bloque de SHA-256 en bytes

/**
 * Calcula HMAC-SHA256.
 * @param key - Clave secreta (Uint8Array o string)
 * @param message - Mensaje a autenticar (Uint8Array o string)
 * @returns Uint8Array de 32 bytes (256 bits)
 */
export function hmacSHA256(key: Uint8Array | string, message: Uint8Array | string): Uint8Array {
  // Convertir inputs a Uint8Array si son strings
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;

  // Paso 1: Preparar K' (clave ajustada al tamaño de bloque)
  let kPrime: Uint8Array;

  if (keyBytes.length > BLOCK_SIZE) {
    // Si la clave es más larga que el bloque, hashearla
    kPrime = new Uint8Array(BLOCK_SIZE);
    kPrime.set(sha256(keyBytes)); // SHA-256 produce 32 bytes, rellenar con 0s hasta 64
  } else if (keyBytes.length < BLOCK_SIZE) {
    // Si es más corta, rellenar con 0s (pad right)
    kPrime = new Uint8Array(BLOCK_SIZE);
    kPrime.set(keyBytes);
  } else {
    kPrime = new Uint8Array(keyBytes);
  }

  // Paso 2: Crear ipad (0x36) y opad (0x5c) del tamaño del bloque
  const ipad = new Uint8Array(BLOCK_SIZE).fill(0x36);
  const opad = new Uint8Array(BLOCK_SIZE).fill(0x5c);

  // Paso 3: K' XOR ipad, K' XOR opad
  const kXorIpad = xorBytes(kPrime, ipad);
  const kXorOpad = xorBytes(kPrime, opad);

  // Paso 4: Hash interno = H((K' ⊕ ipad) || message)
  const innerInput = new Uint8Array(BLOCK_SIZE + msgBytes.length);
  innerInput.set(kXorIpad);
  innerInput.set(msgBytes, BLOCK_SIZE);
  const innerHash = sha256(innerInput);

  // Paso 5: Hash externo = H((K' ⊕ opad) || inner_hash)
  const outerInput = new Uint8Array(BLOCK_SIZE + 32); // 32 = longitud de SHA-256
  outerInput.set(kXorOpad);
  outerInput.set(innerHash, BLOCK_SIZE);
  const hmac = sha256(outerInput);

  return hmac;
}
