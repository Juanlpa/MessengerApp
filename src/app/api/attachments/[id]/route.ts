/**
 * GET /api/attachments/[id] — Descarga blob cifrado desde Storage
 * GET /api/attachments/[id]?thumbnail=true — Descarga solo el thumbnail
 *
 * Seguridad: Verifica que el usuario sea participante de la conversación
 * antes de servir el blob. El blob está cifrado — el cliente descifra localmente.
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { logMultimediaEvent } from '@/lib/security/log-multimedia';

const STORAGE_BUCKET = 'encrypted-attachments';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: attachmentId } = await context.params;
  const isThumbnail = request.nextUrl.searchParams.get('thumbnail') === 'true';

  const supabase = getSupabaseAdmin();

  // Obtener metadata del adjunto
  const { data: attachment, error: fetchErr } = await supabase
    .from('attachments')
    .select('*')
    .eq('id', attachmentId)
    .single();

  if (fetchErr || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  // Verificar participación en la conversación
  const { data: participant } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', attachment.conversation_id)
    .eq('user_id', user.sub)
    .single();

  if (!participant) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
  }

  // Determinar qué archivo descargar
  const path = isThumbnail && attachment.thumbnail_path
    ? attachment.thumbnail_path
    : attachment.storage_path;

  // Descargar blob de Storage
  const { data: blob, error: downloadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(path);

  if (downloadErr || !blob) {
    console.error('[download] Storage download error:', downloadErr);
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }

  // Log de descarga
  await logMultimediaEvent('file_downloaded', user.sub, {
    attachment_id: attachmentId,
    filename: attachment.original_filename,
    conversation_id: attachment.conversation_id,
    is_thumbnail: isThumbnail,
  }, request);

  // Retornar metadata + blob como binary
  const arrayBuffer = await blob.arrayBuffer();

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${attachment.original_filename}.enc"`,
      'X-Attachment-Id': attachment.id,
      'X-IV': isThumbnail ? (attachment.thumbnail_iv || '') : attachment.iv,
      'X-MAC': isThumbnail ? (attachment.thumbnail_mac || '') : attachment.mac_tag,
      'X-Mime-Type': attachment.mime_type,
      'X-Original-Filename': attachment.original_filename,
      'X-Size-Bytes': String(attachment.size_bytes),
      'X-Attachment-Type': attachment.attachment_type,
      'X-Duration-Ms': attachment.duration_ms ? String(attachment.duration_ms) : '',
      'X-Waveform-Data': attachment.waveform_data || '',
      'Cache-Control': 'private, no-cache, no-store',
    },
  });
}
