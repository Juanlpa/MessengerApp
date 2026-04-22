/**
 * key-exchange.ts — Orquesta DH + HKDF para derivar shared key entre dos usuarios
 */

import { computeSharedSecret } from '../crypto/dh';
import { hkdf } from '../crypto/hkdf';
import { encryptAesCbcHmac, decryptAesCbcHmac, type EncryptedData } from '../crypto/encrypt';
import { fromHex } from '../crypto/utils';

/**
 * Deriva la clave compartida E2E entre dos usuarios.
 * @param myPrivateKey - Mi clave privada DH (Uint8Array)
 * @param otherPublicKeyHex - Clave pública DH del otro usuario (hex string de BD)
 * @returns Clave AES de 32 bytes para cifrado de mensajes
 */
export function deriveSharedKey(
  myPrivateKey: Uint8Array,
  otherPublicKeyHex: string
): Uint8Array {
  const otherPubKey = fromHex(otherPublicKeyHex);
  const rawShared = computeSharedSecret(myPrivateKey, otherPubKey);
  // Derivar clave AES de 32 bytes con HKDF
  return hkdf(rawShared, new Uint8Array(0), 'messenger-e2e-shared-key-v1', 32);
}

/**
 * Cifra la shared key para almacenarla en BD.
 * Cada participante guarda su copia cifrada con su password-derived key.
 */
export function encryptSharedKeyForStorage(
  sharedKey: Uint8Array,
  passwordDerivedKey: Uint8Array
): EncryptedData {
  return encryptAesCbcHmac(sharedKey, passwordDerivedKey);
}

/**
 * Descifra la shared key almacenada en BD.
 */
export function decryptSharedKeyFromStorage(
  encrypted: EncryptedData,
  passwordDerivedKey: Uint8Array
): Uint8Array {
  return decryptAesCbcHmac(encrypted, passwordDerivedKey);
}
