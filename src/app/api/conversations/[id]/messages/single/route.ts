/**
 * GET /api/conversations/[id]/messages/single?messageId=xxx
 * 
 * Retorna un mensaje individual con Capa 2 descifrada (para Realtime).
 * El cliente descifra Capa 1 (E2E) localmente.
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { decryptMessageAtRest, getServerMasterKey } from '@/lib/crypto/message-crypto';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: conversationId } = await context.params;
  const messageId = request.nextUrl.searchParams.get('messageId');

  if (!messageId) {
    return NextResponse.json({ error: 'messageId required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verificar participación
  const { data: participant } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.sub)
    .single();

  if (!participant) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
  }

  // Obtener el mensaje con metadata de adjunto
  const { data: msg, error } = await supabase
    .from('messages')
    .select('id, sender_id, server_ciphertext, server_iv, server_mac_tag, created_at, message_type, attachment_id, attachment:attachments!attachment_id(id, original_filename, mime_type, size_bytes, attachment_type, duration_ms, waveform_data)')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .single();

  if (error || !msg) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  // Quitar Capa 2 (at-rest)
  try {
    const masterKey = getServerMasterKey();
    const typedMsg = msg as any;
    const e2eCiphertext = decryptMessageAtRest(
      { ciphertext: typedMsg.server_ciphertext, iv: typedMsg.server_iv, mac: typedMsg.server_mac_tag },
      masterKey
    );
    const e2eData = JSON.parse(e2eCiphertext);

    const att = typedMsg.attachment;
    return NextResponse.json({
      message: {
        id: typedMsg.id,
        senderId: typedMsg.sender_id,
        e2e: {
          ciphertext: e2eData.ciphertext,
          iv: e2eData.iv,
          mac: e2eData.mac,
        },
        createdAt: typedMsg.created_at,
        messageType: typedMsg.message_type || 'text',
        attachment: att ? {
          id: att.id,
          filename: att.original_filename,
          mimeType: att.mime_type,
          sizeBytes: att.size_bytes,
          attachmentType: att.attachment_type,
          durationMs: att.duration_ms ?? null,
          waveformData: att.waveform_data ? JSON.parse(att.waveform_data) : [],
        } : null,
      },
    });
  } catch (err) {
    console.error('Failed to decrypt message:', err);
    return NextResponse.json({ error: 'Decryption failed' }, { status: 500 });
  }
}
