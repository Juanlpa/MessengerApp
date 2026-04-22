/**
 * Módulo Criptográfico — Messenger Clone
 * API pública unificada.
 * 
 * Todas las primitivas implementadas desde cero:
 * - SHA-256 (FIPS 180-4)
 * - HMAC-SHA256 (RFC 2104)
 * - PBKDF2-HMAC-SHA256 (RFC 8018)
 * - AES-256 Block Cipher (FIPS 197)
 * - AES-256-CBC + PKCS7 Padding
 * - Encrypt-then-MAC (AES-256-CBC + HMAC-SHA256)
 * - Diffie-Hellman (RFC 3526 Grupo 14, 2048-bit)
 * - HKDF-SHA256 (RFC 5869)
 */

// Hashing
export { sha256, sha256Hex } from './sha256';
export { hmacSHA256 } from './hmac';

// Key Derivation
export { pbkdf2 } from './pbkdf2';
export { hkdf, hkdfExtract, hkdfExpand } from './hkdf';

// Symmetric Encryption
export { aesEncryptBlock, aesDecryptBlock, AES_BLOCK_SIZE } from './aes';
export { aesCbcEncrypt, aesCbcDecrypt, pkcs7Pad, pkcs7Unpad } from './aes-cbc';
export { encryptAesCbcHmac, decryptAesCbcHmac } from './encrypt';
export type { EncryptedData } from './encrypt';

// Key Exchange
export { generateDHKeyPair, computeSharedSecret, DH_PRIME, DH_GENERATOR } from './dh';
export type { DHKeyPair } from './dh';

// Utilities
export {
  toHex, fromHex,
  stringToBytes, bytesToString,
  toBase64Url, fromBase64Url,
  randomBytes, constantTimeEqual,
  concatBytes, xorBytes,
  modPow, bytesToBigInt, bigIntToBytes,
} from './utils';
