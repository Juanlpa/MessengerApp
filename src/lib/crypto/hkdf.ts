/**
 * HKDF-SHA256 — HMAC-based Key Derivation Function, RFC 5869
 * 
 * Dos fases:
 * 1. Extract: PRK = HMAC-SHA256(salt, IKM)  — concentra entropía
 * 2. Expand: OKM = T(1) || T(2) || ...       — expande a longitud deseada
 *    T(i) = HMAC-SHA256(PRK, T(i-1) || info || i)
 */

import { hmacSHA256 } from './hmac';
import { concatBytes } from './utils';

const HASH_LEN = 32; // SHA-256 output

/**
 * HKDF-Extract: extrae una clave pseudoaleatoria de material de entrada.
 * @param salt - Salt (puede ser Uint8Array vacío; se usa 0x00...00 de 32 bytes)
 * @param ikm - Input Keying Material
 * @returns PRK (Pseudo-Random Key) de 32 bytes
 */
export function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Uint8Array {
  // Si salt es vacío, usar string de zeros de HashLen bytes
  const actualSalt = salt.length > 0 ? salt : new Uint8Array(HASH_LEN);
  return hmacSHA256(actualSalt, ikm);
}

/**
 * HKDF-Expand: expande PRK a la longitud de clave deseada.
 * @param prk - Pseudo-Random Key (de hkdfExtract)
 * @param info - Context/application-specific info (puede ser vacío)
 * @param length - Longitud deseada en bytes (≤ 255 * HashLen)
 * @returns OKM (Output Keying Material) de `length` bytes
 */
export function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  if (length > 255 * HASH_LEN) {
    throw new Error('HKDF-Expand: length too large');
  }

  const n = Math.ceil(length / HASH_LEN);
  const okm = new Uint8Array(n * HASH_LEN);
  let previousT: any = new Uint8Array(0);

  for (let i = 1; i <= n; i++) {
    // T(i) = HMAC-SHA256(PRK, T(i-1) || info || i)
    const counter = new Uint8Array([i]);
    const input = concatBytes(previousT, info, counter);
    previousT = hmacSHA256(prk, input);
    okm.set(previousT, (i - 1) * HASH_LEN);
  }

  return okm.slice(0, length);
}

/**
 * HKDF completo: Extract + Expand en un solo paso.
 * @param ikm - Input Keying Material (ej: DH shared secret)
 * @param salt - Salt (puede ser vacío)
 * @param info - Context info (ej: "messenger-e2e-key")
 * @param length - Longitud de clave deseada en bytes (default 32)
 * @returns Clave derivada de `length` bytes
 */
export function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array | string,
  length: number = 32
): Uint8Array {
  const infoBytes = typeof info === 'string' ? new TextEncoder().encode(info) : info;
  const prk = hkdfExtract(salt, ikm);
  return hkdfExpand(prk, infoBytes, length);
}
