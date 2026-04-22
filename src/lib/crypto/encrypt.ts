/**
 * Encrypt-then-MAC — AES-256-CBC + HMAC-SHA256
 * 
 * Esquema de cifrado autenticado:
 * 1. Cifrar con AES-256-CBC usando IV aleatorio
 * 2. Calcular HMAC-SHA256 sobre (IV || ciphertext) con clave MAC separada
 * 3. Retornar IV || ciphertext || MAC
 * 
 * Al descifrar:
 * 1. Separar IV, ciphertext, MAC
 * 2. Verificar MAC (timing-safe)
 * 3. Si MAC válido, descifrar con AES-256-CBC
 * 
 * Seguridad: Encrypt-then-MAC es el esquema composicional correcto (Bellare & Namprempre, 2000).
 * La clave de 32 bytes se divide: 16 bytes para cifrado, 16 bytes para MAC.
 * O mejor: se usa HKDF para derivar dos claves de 32 bytes de la clave maestra.
 * Para el prototipo, usamos la clave completa para AES y derivamos la MAC key con HMAC.
 */

import { aesCbcEncrypt, aesCbcDecrypt } from './aes-cbc';
import { hmacSHA256 } from './hmac';
import { randomBytes, constantTimeEqual, concatBytes, stringToBytes } from './utils';

const IV_SIZE = 16;


/**
 * Deriva claves separadas para cifrado y MAC a partir de una clave maestra.
 * Usa HMAC como KDF simple (suficiente para el prototipo).
 */
function deriveKeys(masterKey: Uint8Array): { encKey: Uint8Array; macKey: Uint8Array } {
  const encKey = hmacSHA256(masterKey, stringToBytes('enc-key'));
  const macKey = hmacSHA256(masterKey, stringToBytes('mac-key'));
  return { encKey, macKey };
}

export interface EncryptedData {
  /** IV en hex */
  iv: string;
  /** Ciphertext en hex */
  ciphertext: string;
  /** HMAC-SHA256 tag en hex */
  mac: string;
}

/**
 * Cifra datos con AES-256-CBC + HMAC-SHA256 (Encrypt-then-MAC).
 * @param plaintext - Datos a cifrar (Uint8Array o string)
 * @param key - Clave maestra de 32 bytes
 * @returns Objeto con iv, ciphertext y mac en hex
 */
export function encryptAesCbcHmac(
  plaintext: Uint8Array | string,
  key: Uint8Array
): EncryptedData {
  if (key.length !== 32) {
    throw new Error('Key must be 32 bytes (256 bits)');
  }

  const data = typeof plaintext === 'string' ? stringToBytes(plaintext) : plaintext;
  const { encKey, macKey } = deriveKeys(key);

  // 1. Generar IV aleatorio
  const iv = randomBytes(IV_SIZE);

  // 2. Cifrar con AES-256-CBC
  const ciphertext = aesCbcEncrypt(data, encKey, iv);

  // 3. Calcular MAC sobre IV || ciphertext
  const macInput = concatBytes(iv, ciphertext);
  const mac = hmacSHA256(macKey, macInput);

  // Importar toHex aquí para evitar circular
  const { toHex } = require('./utils');

  return {
    iv: toHex(iv),
    ciphertext: toHex(ciphertext),
    mac: toHex(mac),
  };
}

/**
 * Descifra datos cifrados con AES-256-CBC + HMAC-SHA256.
 * @param encrypted - Objeto con iv, ciphertext y mac en hex
 * @param key - Clave maestra de 32 bytes
 * @returns Uint8Array del plaintext
 * @throws Error si MAC no coincide (datos alterados)
 */
export function decryptAesCbcHmac(
  encrypted: EncryptedData,
  key: Uint8Array
): Uint8Array {
  if (key.length !== 32) {
    throw new Error('Key must be 32 bytes (256 bits)');
  }

  const { fromHex } = require('./utils');
  const iv = fromHex(encrypted.iv);
  const ciphertext = fromHex(encrypted.ciphertext);
  const mac = fromHex(encrypted.mac);

  const { encKey, macKey } = deriveKeys(key);

  // 1. Verificar MAC PRIMERO (antes de descifrar)
  const macInput = concatBytes(iv, ciphertext);
  const expectedMac = hmacSHA256(macKey, macInput);

  if (!constantTimeEqual(mac, expectedMac)) {
    throw new Error('MAC verification failed: data may have been tampered with');
  }

  // 2. MAC válido → descifrar
  return aesCbcDecrypt(ciphertext, encKey, iv);
}
