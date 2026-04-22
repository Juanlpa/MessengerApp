/**
 * AES-256-CBC Mode — Cipher Block Chaining con PKCS7 padding
 * 
 * CBC: cada bloque de plaintext se XOR con el bloque cifrado anterior antes de cifrarse.
 * PKCS7: padding donde el valor de cada byte de padding = número de bytes de padding.
 */

import { aesEncryptBlock, aesDecryptBlock, AES_BLOCK_SIZE } from './aes';
import { xorBytes } from './utils';

// ─── PKCS7 Padding ──────────────────────────────────────────────────

/** Agrega padding PKCS7 para llenar al siguiente múltiplo de blockSize */
export function pkcs7Pad(data: Uint8Array): Uint8Array {
  const padLen = AES_BLOCK_SIZE - (data.length % AES_BLOCK_SIZE);
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  for (let i = data.length; i < padded.length; i++) {
    padded[i] = padLen;
  }
  return padded;
}

/** Quita padding PKCS7. Lanza error si padding inválido. */
export function pkcs7Unpad(data: Uint8Array): Uint8Array {
  if (data.length === 0 || data.length % AES_BLOCK_SIZE !== 0) {
    throw new Error('Invalid padded data length');
  }
  const padLen = data[data.length - 1];
  if (padLen < 1 || padLen > AES_BLOCK_SIZE) {
    throw new Error('Invalid PKCS7 padding value');
  }
  // Verificar que todos los bytes de padding son correctos
  for (let i = data.length - padLen; i < data.length; i++) {
    if (data[i] !== padLen) {
      throw new Error('Invalid PKCS7 padding');
    }
  }
  return data.slice(0, data.length - padLen);
}

// ─── CBC Encrypt ─────────────────────────────────────────────────────

/**
 * Cifra datos con AES-256-CBC.
 * @param plaintext - Datos a cifrar (se aplica PKCS7 padding automáticamente)
 * @param key - Clave de 32 bytes
 * @param iv - Vector de inicialización de 16 bytes
 * @returns Ciphertext (con padding, múltiplo de 16 bytes)
 */
export function aesCbcEncrypt(plaintext: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  if (key.length !== 32) throw new Error('Key must be 32 bytes');
  if (iv.length !== AES_BLOCK_SIZE) throw new Error('IV must be 16 bytes');

  const padded = pkcs7Pad(plaintext);
  const numBlocks = padded.length / AES_BLOCK_SIZE;
  const ciphertext = new Uint8Array(padded.length);

  let previousBlock = iv;

  for (let i = 0; i < numBlocks; i++) {
    const offset = i * AES_BLOCK_SIZE;
    const plaintextBlock = padded.slice(offset, offset + AES_BLOCK_SIZE);
    
    // XOR con bloque anterior (o IV para el primer bloque)
    const xored = xorBytes(plaintextBlock, previousBlock);
    
    // Cifrar el bloque XOR'd
    const encryptedBlock = aesEncryptBlock(xored, key);
    
    // Guardar y usar como "previousBlock" para el siguiente
    ciphertext.set(encryptedBlock, offset);
    previousBlock = encryptedBlock;
  }

  return ciphertext;
}

// ─── CBC Decrypt ─────────────────────────────────────────────────────

/**
 * Descifra datos con AES-256-CBC.
 * @param ciphertext - Datos cifrados (múltiplo de 16 bytes)
 * @param key - Clave de 32 bytes
 * @param iv - Vector de inicialización de 16 bytes
 * @returns Plaintext (sin padding)
 */
export function aesCbcDecrypt(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  if (key.length !== 32) throw new Error('Key must be 32 bytes');
  if (iv.length !== AES_BLOCK_SIZE) throw new Error('IV must be 16 bytes');
  if (ciphertext.length === 0 || ciphertext.length % AES_BLOCK_SIZE !== 0) {
    throw new Error('Ciphertext length must be multiple of 16');
  }

  const numBlocks = ciphertext.length / AES_BLOCK_SIZE;
  const padded = new Uint8Array(ciphertext.length);

  let previousBlock = iv;

  for (let i = 0; i < numBlocks; i++) {
    const offset = i * AES_BLOCK_SIZE;
    const ciphertextBlock = ciphertext.slice(offset, offset + AES_BLOCK_SIZE);
    
    // Descifrar el bloque
    const decryptedBlock = aesDecryptBlock(ciphertextBlock, key);
    
    // XOR con bloque anterior (o IV) para obtener plaintext
    const plaintextBlock = xorBytes(decryptedBlock, previousBlock);
    
    padded.set(plaintextBlock, offset);
    previousBlock = ciphertextBlock;
  }

  return pkcs7Unpad(padded);
}
