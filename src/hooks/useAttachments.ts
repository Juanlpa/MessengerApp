'use client';

/**
 * useAttachments.ts — Hook para orquestar subida y descarga de adjuntos cifrados
 *
 * Flujo de subida:
 *  1. Usuario selecciona archivo
 *  2. Validar en CLIENTE (magic bytes, tamaño, extensión)
 *  3. Cifrar archivo con shared key de la conversación (AES-256-CBC + HMAC)
 *  4. Generar thumbnail cifrado si es imagen
 *  5. Subir blob cifrado a servidor vía POST /api/attachments/upload
 *  6. Enviar mensaje con referencia al attachmentId
 *
 * Flujo de descarga:
 *  1. GET /api/attachments/[id] — obtener blob cifrado
 *  2. Descifrar con shared key
 *  3. Mostrar en navegador o descargar
 *
 * Seguridad: Archivo NUNCA pasa en claro por la red ni se almacena sin cifrar.
 */

import { useState, useCallback } from 'react';
import {
  encryptFile,
  decryptFile,
  generateThumbnail,
  encryptThumbnail,
  decryptThumbnail,
  fileToUint8Array,
  bytesToBlobUrl,
  MAX_FILE_SIZE,
} from '@/lib/crypto/file-encrypt';
import {
  validateFile,
  detectMimeType,
  sanitizeFilename,
  getAttachmentType,
} from '@/lib/crypto/mime-validator';
import type { EncryptedData } from '@/lib/crypto/encrypt';

// ─── Types ──────────────────────────────────────────────────────────

export interface UploadProgress {
  phase: 'validating' | 'encrypting' | 'uploading' | 'done' | 'error';
  percent: number;
  message: string;
}

export interface AttachmentMeta {
  id: string;
  storagePath: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  attachmentType: 'image' | 'voice' | 'file';
  thumbnailUrl?: string;
}

export interface DownloadedAttachment {
  blobUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useAttachments(
  conversationId: string,
  token: string,
  sharedKey: Uint8Array | null,
) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sube un archivo cifrado al servidor.
   * @returns attachmentId y metadata, o null si falla
   */
  const uploadAttachment = useCallback(async (
    file: File,
  ): Promise<AttachmentMeta | null> => {
    if (!sharedKey) {
      setError('No hay clave de conversación disponible');
      return null;
    }

    setError(null);

    try {
      // ── 1. Validación en cliente (magic bytes) ────────────────
      setUploadProgress({ phase: 'validating', percent: 10, message: 'Validando archivo...' });

      const fileBytes = await fileToUint8Array(file);
      const validationError = validateFile(fileBytes, file.name, file.type);
      if (validationError) {
        setUploadProgress({ phase: 'error', percent: 0, message: validationError });
        setError(validationError);
        return null;
      }

      // ── 2. Cifrar archivo ─────────────────────────────────────
      setUploadProgress({ phase: 'encrypting', percent: 30, message: 'Cifrando archivo...' });

      const encrypted = encryptFile(fileBytes, sharedKey);
      const mimeType = detectMimeType(fileBytes) || file.type;
      const attachmentType = getAttachmentType(mimeType);
      const safeName = sanitizeFilename(file.name);

      // ── 3. Generar thumbnail cifrado (si es imagen) ───────────
      let thumbnailEncrypted: EncryptedData | null = null;
      if (attachmentType === 'image') {
        setUploadProgress({ phase: 'encrypting', percent: 45, message: 'Generando thumbnail...' });
        try {
          const thumbBytes = await generateThumbnail(file);
          thumbnailEncrypted = encryptThumbnail(thumbBytes, sharedKey);
        } catch (thumbErr) {
          // Thumbnail es opcional — no bloquear por esto
          console.warn('[useAttachments] Thumbnail generation failed:', thumbErr);
        }
      }

      // ── 4. Preparar FormData ──────────────────────────────────
      setUploadProgress({ phase: 'uploading', percent: 60, message: 'Subiendo archivo cifrado...' });

      const formData = new FormData();

      // Blob cifrado del archivo principal
      const encryptedBlob = createBlobFromEncrypted(encrypted);
      formData.append('encryptedFile', encryptedBlob, `${safeName}.enc`);

      // Metadata
      formData.append('conversationId', conversationId);
      formData.append('iv', encrypted.iv);
      formData.append('macTag', encrypted.mac);
      formData.append('mimeType', mimeType);
      formData.append('originalFilename', safeName);
      formData.append('sizeBytes', String(fileBytes.length));
      formData.append('attachmentType', attachmentType);

      // Thumbnail cifrado (si existe)
      if (thumbnailEncrypted) {
        const thumbBlob = createBlobFromEncrypted(thumbnailEncrypted);
        formData.append('encryptedThumbnail', thumbBlob, `thumb_${safeName}.enc`);
        formData.append('thumbnailIv', thumbnailEncrypted.iv);
        formData.append('thumbnailMac', thumbnailEncrypted.mac);
      }

      // ── 5. Subir ─────────────────────────────────────────────
      const res = await fetch('/api/attachments/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errData.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();

      setUploadProgress({ phase: 'done', percent: 100, message: '¡Archivo subido!' });

      // Limpiar progress después de 2s
      setTimeout(() => setUploadProgress(null), 2000);

      return {
        id: data.attachmentId,
        storagePath: data.storagePath,
        mimeType,
        filename: safeName,
        sizeBytes: fileBytes.length,
        attachmentType,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir archivo';
      setUploadProgress({ phase: 'error', percent: 0, message: msg });
      setError(msg);
      return null;
    }
  }, [conversationId, token, sharedKey]);

  /**
   * Descarga y descifra un adjunto completo.
   */
  const downloadAttachment = useCallback(async (
    attachmentId: string,
    isThumbnail = false,
  ): Promise<DownloadedAttachment | null> => {
    if (!sharedKey) {
      setError('No hay clave de conversación disponible');
      return null;
    }

    try {
      const url = `/api/attachments/${attachmentId}${isThumbnail ? '?thumbnail=true' : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
      }

      // Leer metadata de los headers
      const iv = res.headers.get('X-IV') || '';
      const mac = res.headers.get('X-MAC') || '';
      const mimeType = res.headers.get('X-Mime-Type') || 'application/octet-stream';
      const filename = res.headers.get('X-Original-Filename') || 'download';
      const sizeBytes = parseInt(res.headers.get('X-Size-Bytes') || '0', 10);

      // Leer blob cifrado
      const arrayBuffer = await res.arrayBuffer();
      const ciphertextHex = bufferToHex(new Uint8Array(arrayBuffer));

      // Descifrar
      const encrypted: EncryptedData = { iv, ciphertext: ciphertextHex, mac };
      const decryptFn = isThumbnail ? decryptThumbnail : decryptFile;
      const decryptedBytes = decryptFn(encrypted, sharedKey);

      // Crear URL para mostrar en el navegador
      const blobUrl = bytesToBlobUrl(decryptedBytes, mimeType);

      return { blobUrl, filename, mimeType, sizeBytes };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al descargar';
      setError(msg);
      return null;
    }
  }, [token, sharedKey]);

  /**
   * Descarga un adjunto y dispara la descarga del navegador.
   */
  const triggerDownload = useCallback(async (attachmentId: string) => {
    const result = await downloadAttachment(attachmentId);
    if (!result) return;

    const a = document.createElement('a');
    a.href = result.blobUrl;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Limpiar blob URL después de un momento
    setTimeout(() => URL.revokeObjectURL(result.blobUrl), 5000);
  }, [downloadAttachment]);

  /**
   * Limpia el error actual.
   */
  const clearError = useCallback(() => {
    setError(null);
    setUploadProgress(null);
  }, []);

  return {
    uploadAttachment,
    downloadAttachment,
    triggerDownload,
    uploadProgress,
    error,
    clearError,
  };
}

// ─── Helpers internos ───────────────────────────────────────────────

/**
 * Convierte EncryptedData (hex strings) a un Blob binario para enviar al servidor.
 */
function createBlobFromEncrypted(encrypted: EncryptedData): Blob {
  // El ciphertext está en hex — convertir a bytes para enviar eficientemente
  const bytes = hexToBytes(encrypted.ciphertext);
  return new Blob([bytes], { type: 'application/octet-stream' });
}

/** Hex string → Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Uint8Array → Hex string */
function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
