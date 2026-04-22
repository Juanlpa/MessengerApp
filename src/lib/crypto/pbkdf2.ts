/**
 * PBKDF2-HMAC-SHA256 — Implementación propia según RFC 8018 (PKCS #5 v2.1)
 * 
 * PBKDF2(P, S, c, dkLen) = T1 || T2 || ... || Tdklen/hlen
 * Ti = U1 XOR U2 XOR ... XOR Uc
 * U1 = PRF(P, S || INT(i))    donde PRF = HMAC-SHA256
 * Uj = PRF(P, U_{j-1})
 * 
 * Parámetros:
 * - P: password (key derivation input)
 * - S: salt
 * - c: iteration count
 * - dkLen: derived key length en bytes
 */

import { hmacSHA256 } from './hmac';
import { xorBytes, concatBytes } from './utils';

const HMAC_LEN = 32; // SHA-256 produce 32 bytes

/**
 * Codifica un entero de 32 bits en big-endian (4 bytes).
 * Usado para el contador de bloque INT(i) en PBKDF2.
 */
function intToBytes(i: number): Uint8Array {
  return new Uint8Array([
    (i >>> 24) & 0xff,
    (i >>> 16) & 0xff,
    (i >>> 8) & 0xff,
    i & 0xff,
  ]);
}

/**
 * Calcula PBKDF2 con HMAC-SHA256 como PRF.
 * @param password - Contraseña (string o Uint8Array)
 * @param salt - Salt (string o Uint8Array)  
 * @param iterations - Número de iteraciones (recomendado ≥ 100,000)
 * @param dkLen - Longitud de la clave derivada en bytes (default 32 = 256 bits)
 * @returns Uint8Array de dkLen bytes
 */
export function pbkdf2(
  password: Uint8Array | string,
  salt: Uint8Array | string,
  iterations: number,
  dkLen: number = 32
): Uint8Array {
  // Validar inputs
  if (iterations < 1) {
    throw new Error('PBKDF2: iterations must be >= 1');
  }
  if (dkLen < 1) {
    throw new Error('PBKDF2: dkLen must be >= 1');
  }
  if (dkLen > (Math.pow(2, 32) - 1) * HMAC_LEN) {
    throw new Error('PBKDF2: derived key too long');
  }

  // Convertir inputs a bytes
  const P = typeof password === 'string' ? new TextEncoder().encode(password) : password;
  const S = typeof salt === 'string' ? new TextEncoder().encode(salt) : salt;

  // Calcular cuántos bloques necesitamos
  const numBlocks = Math.ceil(dkLen / HMAC_LEN);

  // Generar cada bloque Ti
  const blocks: Uint8Array[] = [];

  for (let i = 1; i <= numBlocks; i++) {
    // U1 = PRF(P, S || INT(i))
    const saltWithCounter = concatBytes(S, intToBytes(i));
    let U = hmacSHA256(P, saltWithCounter);
    let T: any = Uint8Array.from(U); // Ti = U1

    // U2..Uc: iterar y XOR
    for (let j = 2; j <= iterations; j++) {
      U = hmacSHA256(P, U); // Uj = PRF(P, U_{j-1})
      T = xorBytes(T, U as any);   // Ti = Ti XOR Uj
    }

    blocks.push(T);
  }

  // Concatenar bloques y truncar a dkLen
  const dk = concatBytes(...blocks);
  return dk.slice(0, dkLen);
}
