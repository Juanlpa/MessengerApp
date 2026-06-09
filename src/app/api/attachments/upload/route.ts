/**
 * POST /api/attachments/upload — Sube un archivo cifrado a Supabase Storage
 *
 * Flujo:
 *  1. Autenticar usuario via JWT
 *  2. Validar participación en la conversación
 *  3. Validar metadata (MIME whitelist, tamaño)
 *  4. Recibir blob cifrado (el cliente ya cifró con la shared key)
 *  5. Subir a Supabase Storage bucket 'encrypted-attachments'
 *  6. Insertar registro en tabla attachments
 *  7. Retornar attachmentId
 *
 * NOTA: El servidor NO puede verificar magic bytes porque recibe el archivo
 * ya cifrado. La validación de magic bytes ocurre en el CLIENTE antes de cifrar.
 * El servidor valida la metadata declarada contra whitelist.
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { isAllowedMimeType, sanitizeFilename, isBlockedExtension } from '@/lib/crypto/mime-validator';
import { logMultimediaEvent } from '@/lib/security/log-multimedia';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const STORAGE_BUCKET = 'encrypted-attachments';

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();

    const encryptedBlob = formData.get('encryptedFile') as File | null;
    const thumbnailBlob = formData.get('encryptedThumbnail') as File | null;
    const conversationId = formData.get('conversationId') as string | null;
    const iv = formData.get('iv') as string | null;
    const macTag = formData.get('macTag') as string | null;
    const mimeType = formData.get('mimeType') as string | null;
    const originalFilename = formData.get('originalFilename') as string | null;
    const sizeBytes = formData.get('sizeBytes') as string | null;
    const attachmentType = formData.get('attachmentType') as string | null;
    const thumbnailIv = formData.get('thumbnailIv') as string | null;
    const thumbnailMac = formData.get('thumbnailMac') as string | null;
    const durationMs = formData.get('durationMs') as string | null;
    const waveformData = formData.get('waveformData') as string | null;

    // ── Validaciones ──────────────────────────────────────────────

    if (!encryptedBlob || !conversationId || !iv || !macTag || !mimeType || !originalFilename || !sizeBytes) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const fileSizeNum = parseInt(sizeBytes, 10);

    // Validar tamaño original
    if (isNaN(fileSizeNum) || fileSizeNum <= 0 || fileSizeNum > MAX_FILE_SIZE) {
      await logMultimediaEvent('file_size_exceeded', user.sub, {
        filename: originalFilename,
        size_bytes: fileSizeNum,
        reason: `Size ${fileSizeNum} exceeds ${MAX_FILE_SIZE}`,
      }, request);
      return NextResponse.json(
        { error: `File size exceeds 25 MB limit` },
        { status: 413 },
      );
    }

    // Validar extensión
    if (isBlockedExtension(originalFilename)) {
      await logMultimediaEvent('file_type_rejected', user.sub, {
        filename: originalFilename,
        declared_mime: mimeType,
        reason: 'Blocked file extension',
      }, request);
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 415 },
      );
    }

    // Validar MIME declarado contra whitelist
    if (!isAllowedMimeType(mimeType)) {
      await logMultimediaEvent('file_type_rejected', user.sub, {
        filename: originalFilename,
        declared_mime: mimeType,
        reason: 'MIME type not in whitelist',
      }, request);
      return NextResponse.json(
        { error: `File type ${mimeType} is not allowed` },
        { status: 415 },
      );
    }

    // Validar attachment_type
    const validTypes = ['image', 'file', 'voice'];
    const attType = attachmentType && validTypes.includes(attachmentType) ? attachmentType : 'file';

    // Sanitizar nombre
    const safeName = sanitizeFilename(originalFilename);

    // ── Verificar participación ───────────────────────────────────

    const supabase = getSupabaseAdmin();

    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.sub)
      .single();

    if (!participant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    // ── Subir blob cifrado a Storage ──────────────────────────────

    const timestamp = Date.now();
    const storagePath = `${conversationId}/${timestamp}_${safeName}.enc`;

    const blobBuffer = await encryptedBlob.arrayBuffer();
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, new Uint8Array(blobBuffer), {
        contentType: 'application/octet-stream', // siempre octet-stream, está cifrado
        upsert: false,
      });

    if (uploadErr) {
      console.error('[upload] Storage upload error:', uploadErr);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    // ── Subir thumbnail cifrado (si existe) ───────────────────────

    let thumbPath: string | null = null;
    if (thumbnailBlob && thumbnailIv && thumbnailMac) {
      thumbPath = `${conversationId}/${timestamp}_thumb_${safeName}.enc`;
      const thumbBuffer = await thumbnailBlob.arrayBuffer();
      const { error: thumbErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(thumbPath, new Uint8Array(thumbBuffer), {
          contentType: 'application/octet-stream',
          upsert: false,
        });

      if (thumbErr) {
        console.error('[upload] Thumbnail upload error:', thumbErr);
        // No fallar por thumbnail — el archivo principal ya subió
        thumbPath = null;
      }
    }

    // ── Insertar registro en attachments ──────────────────────────

    const { data: attachment, error: insertErr } = await supabase
      .from('attachments')
      .insert({
        conversation_id: conversationId,
        uploader_id: user.sub,
        storage_path: storagePath,
        iv,
        mac_tag: macTag,
        mime_type: mimeType,
        original_filename: safeName,
        size_bytes: fileSizeNum,
        thumbnail_path: thumbPath,
        thumbnail_iv: thumbnailIv || null,
        thumbnail_mac: thumbnailMac || null,
        attachment_type: attType,
        duration_ms: durationMs ? parseInt(durationMs, 10) : null,
        waveform_data: waveformData || null,
      })
      .select('id')
      .single();

    if (insertErr || !attachment) {
      console.error('[upload] Insert attachment error:', insertErr);
      // Limpiar archivo subido si falla el insert
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      if (thumbPath) await supabase.storage.from(STORAGE_BUCKET).remove([thumbPath]);
      return NextResponse.json({ error: 'Failed to save attachment metadata' }, { status: 500 });
    }

    // ── Log de seguridad ──────────────────────────────────────────

    await logMultimediaEvent('file_uploaded', user.sub, {
      filename: safeName,
      mime_type: mimeType,
      size_bytes: fileSizeNum,
      conversation_id: conversationId,
      attachment_id: attachment.id,
      attachment_type: attType,
    }, request);

    return NextResponse.json({
      attachmentId: attachment.id,
      storagePath,
    }, { status: 201 });
  } catch (err) {
    console.error('[upload] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
