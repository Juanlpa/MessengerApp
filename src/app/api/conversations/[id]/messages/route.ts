/**
 * GET /api/conversations/[id]/messages — Lista mensajes de una conversación
 * POST /api/conversations/[id]/messages — Enviar mensaje cifrado
 * 
 * El servidor aplica Capa 2 (at-rest) al guardar y la quita al retornar.
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { encryptMessageAtRest, decryptMessageAtRest, getServerMasterKey } from '@/lib/crypto/message-crypto';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: conversationId } = await context.params;
  const supabase = getSupabaseAdmin();

  // Verificar que el usuario es participante
  const { data: participant } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.sub)
    .single();

  if (!participant) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
  }

  // Obtener mensajes con metadata de adjuntos
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, sender_id, server_ciphertext, server_iv, server_mac_tag, ciphertext, iv, mac_tag, created_at, message_type, attachment_id, attachment:attachments!attachment_id(id, original_filename, mime_type, size_bytes, attachment_type, duration_ms, waveform_data)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }

  // Quitar Capa 2 (at-rest) de cada mensaje
  const masterKey = getServerMasterKey();
  const decryptedMessages = (messages || []).map((msg: any) => {
    try {
      // Descifrar la capa at-rest para recuperar el ciphertext E2E original
      const e2eCiphertext = decryptMessageAtRest(
        { ciphertext: msg.server_ciphertext, iv: msg.server_iv, mac: msg.server_mac_tag },
        masterKey
      );
      // Parsear el JSON del E2E ciphertext
      const e2eData = JSON.parse(e2eCiphertext);
      const att = msg.attachment as any;
      return {
        id: msg.id,
        senderId: msg.sender_id,
        e2e: {
          ciphertext: e2eData.ciphertext,
          iv: e2eData.iv,
          mac: e2eData.mac,
        },
        createdAt: msg.created_at,
        messageType: msg.message_type || 'text',
        attachment: att ? {
          id: att.id,
          filename: att.original_filename,
          mimeType: att.mime_type,
          sizeBytes: att.size_bytes,
          attachmentType: att.attachment_type,
          durationMs: att.duration_ms ?? null,
          waveformData: att.waveform_data ? JSON.parse(att.waveform_data) : [],
        } : null,
      };
    } catch (err) {
      console.error('Failed to decrypt at-rest layer for message:', msg.id, err);
      return {
        id: msg.id,
        senderId: msg.sender_id,
        e2e: null,
        createdAt: msg.created_at,
        error: 'Decryption failed',
      };
    }
  });

  return NextResponse.json({ messages: decryptedMessages });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: conversationId } = await context.params;
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

  try {
    const body = await request.json();
    const { e2eEncrypted, messageType, attachmentId } = body;

    if (!e2eEncrypted || !e2eEncrypted.ciphertext || !e2eEncrypted.iv || !e2eEncrypted.mac) {
      return NextResponse.json({ error: 'Missing E2E encrypted data' }, { status: 400 });
    }

    // Aplicar Capa 2 — cifrado at-rest
    const masterKey = getServerMasterKey();
    const e2ePayload = JSON.stringify(e2eEncrypted);
    const serverEncrypted = encryptMessageAtRest(e2ePayload, masterKey);

    // Guardar en BD (todo ciphertext, nada en claro)
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.sub,
        ciphertext: e2eEncrypted.ciphertext,
        iv: e2eEncrypted.iv,
        mac_tag: e2eEncrypted.mac,
        server_ciphertext: serverEncrypted.ciphertext,
        server_iv: serverEncrypted.iv,
        server_mac_tag: serverEncrypted.mac,
        message_type: messageType || 'text',
        attachment_id: attachmentId || null,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('Insert message error:', error);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    // Fire-and-forget push notifications to other participants
    triggerPushForOtherParticipants(supabase, conversationId, user.sub, request).catch(() => {});

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error('Send message error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function triggerPushForOtherParticipants(
  supabase: ReturnType<typeof import('@/lib/supabase/admin').getSupabaseAdmin>,
  conversationId: string,
  senderId: string,
  request: NextRequest
) {
  const { data: others } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .neq('user_id', senderId);

  if (!others || others.length === 0) return;

  const { data: senderData } = await supabase
    .from('users')
    .select('username')
    .eq('id', senderId)
    .single();

  const senderName = senderData?.username || 'Alguien';
  const baseUrl = request.nextUrl.origin;

  await Promise.allSettled(
    others.map((p: { user_id: string }) =>
      fetch(`${baseUrl}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: request.headers.get('Authorization') || '',
        },
        body: JSON.stringify({
          userId: p.user_id,
          title: senderName,
          body: 'Nuevo mensaje',
          conversationId,
          type: 'message',
        }),
      })
    )
  );
}
