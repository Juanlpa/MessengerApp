/**
 * file-encrypt.ts — Cifrado/descifrado de archivos binarios
 * Reutiliza AES-256-CBC + HMAC-SHA256 (módulo cripto propio).
 * Archivos cifrados con la shared key de la conversación (DH+HKDF).
 */

import { encryptAesCbcHmac, decryptAesCbcHmac, type EncryptedData } from './encrypt';

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const THUMB_MAX_W = 320;
const THUMB_MAX_H = 320;

/**
 * Cifra un archivo binario con la shared key de la conversación.
 */
export function encryptFile(fileBytes: Uint8Array, sharedKey: Uint8Array): EncryptedData {
  if (fileBytes.length > MAX_FILE_SIZE) {
    throw new Error(`File exceeds 25 MB limit (${fileBytes.length} bytes)`);
  }
  if (sharedKey.length !== 32) {
    throw new Error('Key must be 32 bytes');
  }
  return encryptAesCbcHmac(fileBytes, sharedKey);
}

/**
 * Descifra un archivo. Verifica MAC antes de descifrar.
 */
export function decryptFile(encrypted: EncryptedData, sharedKey: Uint8Array): Uint8Array {
  if (sharedKey.length !== 32) throw new Error('Key must be 32 bytes');
  return decryptAesCbcHmac(encrypted, sharedKey);
}

/**
 * Genera thumbnail JPEG de una imagen en el cliente (Canvas API).
 */
export async function generateThumbnail(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > THUMB_MAX_W) { h = Math.round(h * (THUMB_MAX_W / w)); w = THUMB_MAX_W; }
      if (h > THUMB_MAX_H) { w = Math.round(w * (THUMB_MAX_H / h)); h = THUMB_MAX_H; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('No canvas context')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        if (!blob) { reject(new Error('Thumbnail blob failed')); return; }
        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
      }, 'image/jpeg', 0.7);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

/** Cifra thumbnail con IV independiente. */
export function encryptThumbnail(bytes: Uint8Array, key: Uint8Array): EncryptedData {
  return encryptAesCbcHmac(bytes, key);
}

/** Descifra thumbnail. */
export function decryptThumbnail(enc: EncryptedData, key: Uint8Array): Uint8Array {
  return decryptAesCbcHmac(enc, key);
}

/** Convierte File a Uint8Array. */
export async function fileToUint8Array(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Crea Blob URL para mostrar archivo descifrado en el navegador. */
export function bytesToBlobUrl(bytes: Uint8Array, mimeType: string): string {
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}
