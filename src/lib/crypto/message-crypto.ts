/**
 * message-crypto.ts — Cifrado/descifrado de mensajes (Capa 1 E2E + Capa 2 at-rest)
 */

import { encryptAesCbcHmac, decryptAesCbcHmac, type EncryptedData } from '../crypto/encrypt';
import { fromHex, stringToBytes, bytesToString } from '../crypto/utils';

/**
 * Capa 1 — Cifrado E2E en el cliente
 * Cifra el mensaje con la shared key derivada de DH+HKDF
 */
export function encryptMessageE2E(plaintext: string, sharedKey: Uint8Array): EncryptedData {
  return encryptAesCbcHmac(plaintext, sharedKey);
}

/**
 * Capa 1 — Descifrado E2E en el cliente
 */
export function decryptMessageE2E(encrypted: EncryptedData, sharedKey: Uint8Array): string {
  const decrypted = decryptAesCbcHmac(encrypted, sharedKey);
  return bytesToString(decrypted);
}

/**
 * Capa 2 — Cifrado at-rest en el servidor
 * Cifra el ciphertext E2E con la clave maestra del servidor
 */
export function encryptMessageAtRest(e2eCiphertext: string, masterKey: Uint8Array): EncryptedData {
  return encryptAesCbcHmac(stringToBytes(e2eCiphertext), masterKey);
}

/**
 * Capa 2 — Descifrado at-rest en el servidor
 */
export function decryptMessageAtRest(encrypted: EncryptedData, masterKey: Uint8Array): string {
  const decrypted = decryptAesCbcHmac(encrypted, masterKey);
  return bytesToString(decrypted);
}

/**
 * Obtiene la clave maestra del servidor desde env.
 */
export function getServerMasterKey(): Uint8Array {
  const keyHex = process.env.ENCRYPTION_MASTER_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('ENCRYPTION_MASTER_KEY must be 64 hex chars (256 bits)');
  }
  return fromHex(keyHex);
}

/**
 * Limpia y formatea texto que contiene representaciones E2E de adjuntos (file, image, voice)
 * a un formato amigable para el usuario.
 */
export function cleanAttachmentText(text: string): string {
  if (!text) return '';

  const trimmed = text.trim();
  const regex = /^(\[Reenviado\]\s+)?\[(file|image|voice):[^\]]+\]\s*(.*)$/i;
  const match = trimmed.match(regex);

  if (match) {
    const isForwarded = match[1] || '';
    const type = match[2].toLowerCase();
    const rest = match[3].trim();

    if (type === 'file') {
      return `${isForwarded}📄 ${rest || 'Archivo'}`;
    }
    if (type === 'image') {
      return `${isForwarded}📷 ${rest || 'Foto'}`;
    }
    if (type === 'voice') {
      return `${isForwarded}🎤 Mensaje de voz`;
    }
  }

  return text;
}
