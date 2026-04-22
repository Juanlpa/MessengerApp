/**
 * SHA-256 — Implementación propia según FIPS 180-4
 * 
 * Referencia: https://csrc.nist.gov/pubs/fips/180-4/upd1/final
 * 
 * Proceso:
 * 1. Pre-procesamiento: padding del mensaje a múltiplo de 512 bits
 * 2. Parsing: dividir en bloques de 512 bits (64 bytes)
 * 3. Expansión: generar 64 palabras de 32 bits por bloque (message schedule)
 * 4. Compresión: 64 rondas con constantes K y funciones Ch, Maj, Σ0, Σ1, σ0, σ1
 */

import { stringToBytes } from './utils';

// ─── Constantes K ────────────────────────────────────────────────────
// Primeros 32 bits de las partes fraccionarias de las raíces cúbicas
// de los primeros 64 primos (2..311).
const K: ReadonlyArray<number> = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

// ─── Valores hash iniciales H ───────────────────────────────────────
// Primeros 32 bits de las partes fraccionarias de las raíces cuadradas
// de los primeros 8 primos (2, 3, 5, 7, 11, 13, 17, 19).
const H_INIT: ReadonlyArray<number> = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

// ─── Funciones lógicas de SHA-256 ────────────────────────────────────

/** Rotación circular a la derecha de 32 bits */
function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** Ch(x,y,z) = (x AND y) XOR (NOT x AND z) */
function ch(x: number, y: number, z: number): number {
  return ((x & y) ^ (~x & z)) >>> 0;
}

/** Maj(x,y,z) = (x AND y) XOR (x AND z) XOR (y AND z) */
function maj(x: number, y: number, z: number): number {
  return ((x & y) ^ (x & z) ^ (y & z)) >>> 0;
}

/** Σ0(x) = ROTR²(x) XOR ROTR¹³(x) XOR ROTR²²(x) */
function bigSigma0(x: number): number {
  return (rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22)) >>> 0;
}

/** Σ1(x) = ROTR⁶(x) XOR ROTR¹¹(x) XOR ROTR²⁵(x) */
function bigSigma1(x: number): number {
  return (rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25)) >>> 0;
}

/** σ0(x) = ROTR⁷(x) XOR ROTR¹⁸(x) XOR SHR³(x) */
function smallSigma0(x: number): number {
  return (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
}

/** σ1(x) = ROTR¹⁷(x) XOR ROTR¹⁹(x) XOR SHR¹⁰(x) */
function smallSigma1(x: number): number {
  return (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0;
}

// ─── Padding (Pre-procesamiento) ─────────────────────────────────────

/**
 * Aplica padding al mensaje según FIPS 180-4 §5.1.1:
 * 1. Agregar bit '1' (byte 0x80)
 * 2. Agregar k ceros hasta que longitud ≡ 448 mod 512
 * 3. Agregar longitud original en bits como entero de 64 bits big-endian
 */
function padMessage(message: Uint8Array): Uint8Array {
  const msgLen = message.length;
  const bitLen = msgLen * 8;

  // Calcular cuántos bytes de padding necesitamos
  // Necesitamos: msgLen + 1 (0x80) + k + 8 (longitud) ≡ 0 mod 64
  let paddedLen = msgLen + 1 + 8; // mínimo: mensaje + 0x80 + 8 bytes longitud
  while (paddedLen % 64 !== 0) {
    paddedLen++;
  }

  const padded = new Uint8Array(paddedLen);
  // Copiar mensaje original
  padded.set(message);
  // Agregar bit '1' (0x80)
  padded[msgLen] = 0x80;
  // Los zeros ya están (Uint8Array se inicializa en 0)

  // Agregar longitud en bits como 64-bit big-endian al final
  // JavaScript puede manejar números hasta 2^53, suficiente para nuestro uso
  // Byte alto de la longitud (bits 32-63)
  const highBits = Math.floor(bitLen / 0x100000000);
  padded[paddedLen - 8] = (highBits >>> 24) & 0xff;
  padded[paddedLen - 7] = (highBits >>> 16) & 0xff;
  padded[paddedLen - 6] = (highBits >>> 8) & 0xff;
  padded[paddedLen - 5] = highBits & 0xff;
  // Byte bajo de la longitud (bits 0-31)
  padded[paddedLen - 4] = (bitLen >>> 24) & 0xff;
  padded[paddedLen - 3] = (bitLen >>> 16) & 0xff;
  padded[paddedLen - 2] = (bitLen >>> 8) & 0xff;
  padded[paddedLen - 1] = bitLen & 0xff;

  return padded;
}

// ─── Función principal SHA-256 ───────────────────────────────────────

/**
 * Calcula el hash SHA-256 de un mensaje.
 * @param input - Uint8Array o string UTF-8
 * @returns Uint8Array de 32 bytes (256 bits)
 */
export function sha256(input: Uint8Array | string): Uint8Array {
  // Convertir string a bytes si necesario
  const message = typeof input === 'string' ? stringToBytes(input) : input;

  // Paso 1: Padding
  const padded = padMessage(message);

  // Paso 2: Inicializar variables hash con valores iniciales
  const H = [...H_INIT];

  // Paso 3: Procesar cada bloque de 512 bits (64 bytes)
  const numBlocks = padded.length / 64;

  for (let block = 0; block < numBlocks; block++) {
    const offset = block * 64;

    // Paso 3a: Preparar el message schedule W (64 palabras de 32 bits)
    const W = new Array<number>(64);

    // Las primeras 16 palabras son directamente del bloque (big-endian)
    for (let t = 0; t < 16; t++) {
      const i = offset + t * 4;
      W[t] = ((padded[i] << 24) | (padded[i + 1] << 16) |
              (padded[i + 2] << 8) | padded[i + 3]) >>> 0;
    }

    // Las palabras 16-63 se derivan de las anteriores
    for (let t = 16; t < 64; t++) {
      W[t] = (smallSigma1(W[t - 2]) + W[t - 7] +
              smallSigma0(W[t - 15]) + W[t - 16]) >>> 0;
    }

    // Paso 3b: Inicializar variables de trabajo
    let a = H[0], b = H[1], c = H[2], d = H[3];
    let e = H[4], f = H[5], g = H[6], h = H[7];

    // Paso 3c: 64 rondas de compresión
    for (let t = 0; t < 64; t++) {
      const T1 = (h + bigSigma1(e) + ch(e, f, g) + K[t] + W[t]) >>> 0;
      const T2 = (bigSigma0(a) + maj(a, b, c)) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + T1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (T1 + T2) >>> 0;
    }

    // Paso 3d: Actualizar los valores hash
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  // Paso 4: Producir el hash final (8 palabras × 4 bytes = 32 bytes)
  const hash = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    hash[i * 4] = (H[i] >>> 24) & 0xff;
    hash[i * 4 + 1] = (H[i] >>> 16) & 0xff;
    hash[i * 4 + 2] = (H[i] >>> 8) & 0xff;
    hash[i * 4 + 3] = H[i] & 0xff;
  }

  return hash;
}

/**
 * Conveniencia: SHA-256 que retorna string hexadecimal.
 */
export function sha256Hex(input: Uint8Array | string): string {
  const { toHex } = require('./utils');
  return toHex(sha256(input));
}
