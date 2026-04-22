/**
 * Utilidades criptográficas — Messenger Clone
 * Funciones auxiliares para codificación, random, y aritmética modular.
 */

// ─── Codificación Hex ────────────────────────────────────────────────

/**
 * Convierte un Uint8Array a string hexadecimal.
 */
export function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Convierte un string hexadecimal a Uint8Array.
 * @throws Error si el string no es hex válido.
 */
export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(byte)) {
      throw new Error(`Invalid hex character at position ${i}`);
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

// ─── Codificación UTF-8 ─────────────────────────────────────────────

/**
 * Convierte string a Uint8Array (UTF-8).
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convierte Uint8Array (UTF-8) a string.
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// ─── Base64url (para JWT) ───────────────────────────────────────────

/**
 * Codifica Uint8Array a base64url (sin padding).
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodifica base64url a Uint8Array.
 */
export function fromBase64Url(b64url: string): Uint8Array {
  // Restaurar base64 estándar
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  // Agregar padding si necesario
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Random ─────────────────────────────────────────────────────────

/**
 * Genera bytes aleatorios criptográficamente seguros.
 * Usa crypto.getRandomValues del navegador/Node.
 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback para entornos de test
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

// ─── Comparación constante (timing-safe) ────────────────────────────

/**
 * Compara dos Uint8Arrays en tiempo constante para prevenir timing attacks.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// ─── Operaciones con Uint8Array ─────────────────────────────────────

/**
 * Concatena múltiples Uint8Arrays.
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * XOR de dos Uint8Arrays de igual longitud.
 */
export function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new Error('XOR: arrays must have equal length');
  }
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

// ─── Aritmética Modular BigInt (para Diffie-Hellman) ────────────────

/**
 * Exponenciación modular: (base^exp) mod mod
 * Implementación con cuadrado y multiplicación (square-and-multiply).
 */
export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === BigInt(1)) return BigInt(0);
  let result = BigInt(1);
  base = base % mod;
  while (exp > BigInt(0)) {
    // Si exp es impar, multiplicar result con base
    if (exp % BigInt(2) === BigInt(1)) {
      result = (result * base) % mod;
    }
    // exp ahora debe ser par
    exp = exp >> BigInt(1); // dividir por 2
    base = (base * base) % mod;
  }
  return result;
}

/**
 * Convierte Uint8Array a BigInt (big-endian).
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result = (result << BigInt(8)) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * Convierte BigInt a Uint8Array (big-endian) con longitud fija.
 */
export function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let temp = value;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(temp & BigInt(0xFF));
    temp = temp >> BigInt(8);
  }
  return bytes;
}
