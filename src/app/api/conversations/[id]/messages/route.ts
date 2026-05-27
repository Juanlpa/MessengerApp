/**
 * GET /api/conversations/[id]/messages — Lista mensajes de una conversación con cursor y adjuntos
 * POST /api/conversations/[id]/messages — Enviar mensaje cifrado con referencias opcionales
 * 
 * El servidor aplica Capa 2 (at-rest) al guardar y la quita al retornar.
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { encryptMessageAtRest, decryptMessageAtRest, getServerMasterKey } from '@/lib/crypto/message-crypto';
import { sendPushNotification, type PushSubscription, type PushPayload } from '@/lib/push/web-push';

type RouteContext = { params: Promise<{ id: string }> };

type AttachmentRow = {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  attachment_type: 'image' | 'voice' | 'file';
  duration_ms: number | null;
  waveform_data: string | null;
};

type MessageRow = {
  id: string;
  sender_id: string;
  server_ciphertext: string;
  server_iv: string;
  server_mac_tag: string;
  created_at: string;
  reply_to_id: string | null;
  edited_at: string | null;
  is_deleted: boolean;
  message_type: 'text' | 'voice' | 'image' | 'file' | null;
  attachment: AttachmentRow | null;
};

type ReplyRow = Pick<
  MessageRow,
  'id' | 'sender_id' | 'server_ciphertext' | 'server_iv' | 'server_mac_tag' | 'created_at' | 'is_deleted'
>;

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

  // Parámetros de paginación por cursor
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor'); // created_at del mensaje más antiguo cargado
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);

  // Traer mensajes desde el cursor hacia atrás (orden DESC para cursor eficiente)
  let query = supabase
    .from('messages')
    .select('id, sender_id, server_ciphertext, server_iv, server_mac_tag, ciphertext, iv, mac_tag, created_at, reply_to_id, edited_at, is_deleted, message_type, attachment_id, attachment:attachments!attachment_id(id, original_filename, mime_type, size_bytes, attachment_type, duration_ms, waveform_data)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit + 1); // uno extra para detectar si hay más

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: rawMessages, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }

  const hasMore = (rawMessages || []).length > limit;
  const messages = (hasMore ? (rawMessages || []).slice(0, limit) : (rawMessages || [])) as MessageRow[];
  
  // Volver a orden cronológico ascendente para el cliente
  messages.reverse();

  const replyIds = Array.from(new Set(
    messages
      .map((msg) => msg.reply_to_id)
      .filter((id): id is string => Boolean(id))
  ));
  const loadedIds = new Set(messages.map((msg) => msg.id));
  const missingReplyIds = replyIds.filter(id => !loadedIds.has(id));
  const replySnapshots = new Map<string, ReplyRow>();

  if (missingReplyIds.length > 0) {
    const { data: rawReplies } = await supabase
      .from('messages')
      .select('id, sender_id, server_ciphertext, server_iv, server_mac_tag, created_at, is_deleted')
      .eq('conversation_id', conversationId)
      .in('id', missingReplyIds);

    ((rawReplies || []) as ReplyRow[]).forEach((reply) => {
      replySnapshots.set(reply.id, reply);
    });
  }

  // Quitar Capa 2 (at-rest) de cada mensaje
  const masterKey = getServerMasterKey();
  const buildReplySnapshot = (replyToId: string | null) => {
    if (!replyToId) return null;
    const reply = replySnapshots.get(replyToId);
    if (!reply) return null;

    if (reply.is_deleted) {
      return {
        id: reply.id,
        senderId: reply.sender_id,
        e2e: null,
        createdAt: reply.created_at,
        isDeleted: true,
      };
    }

    try {
      const e2eCiphertext = decryptMessageAtRest(
        { ciphertext: reply.server_ciphertext, iv: reply.server_iv, mac: reply.server_mac_tag },
        masterKey
      );
      const e2eData = JSON.parse(e2eCiphertext);
      return {
        id: reply.id,
        senderId: reply.sender_id,
        e2e: {
          ciphertext: e2eData.ciphertext,
          iv: e2eData.iv,
          mac: e2eData.mac,
        },
        createdAt: reply.created_at,
        isDeleted: false,
      };
    } catch {
      return null;
    }
  };

  const decryptedMessages = messages.map((msg) => {
    const replyToSnapshot = buildReplySnapshot(msg.reply_to_id ?? null);
    // Mensajes eliminados: devolver marcador sin contenido
    if (msg.is_deleted) {
      return {
        id: msg.id,
        senderId: msg.sender_id,
        e2e: null,
        createdAt: msg.created_at,
        isDeleted: true,
        replyToId: msg.reply_to_id ?? null,
        replyToSnapshot,
        editedAt: msg.edited_at ?? null,
        messageType: msg.message_type || 'text',
        attachment: null,
      };
    }
    try {
      const e2eCiphertext = decryptMessageAtRest(
        { ciphertext: msg.server_ciphertext, iv: msg.server_iv, mac: msg.server_mac_tag },
        masterKey
      );
      const e2eData = JSON.parse(e2eCiphertext);
      const att = msg.attachment;
      return {
        id: msg.id,
        senderId: msg.sender_id,
        e2e: {
          ciphertext: e2eData.ciphertext,
          iv: e2eData.iv,
          mac: e2eData.mac,
        },
        createdAt: msg.created_at,
        isDeleted: false,
        replyToId: msg.reply_to_id ?? null,
        replyToSnapshot,
        editedAt: msg.edited_at ?? null,
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
        isDeleted: false,
        replyToId: msg.reply_to_id ?? null,
        replyToSnapshot,
        editedAt: msg.edited_at ?? null,
        messageType: msg.message_type || 'text',
        attachment: null,
        error: 'Decryption failed',
      };
    }
  });

  return NextResponse.json({ messages: decryptedMessages, hasMore });
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
    const { e2eEncrypted, replyToId, messageType, attachmentId } = body;

    if (!e2eEncrypted || !e2eEncrypted.ciphertext || !e2eEncrypted.iv || !e2eEncrypted.mac) {
      return NextResponse.json({ error: 'Missing E2E encrypted data' }, { status: 400 });
    }

    // Validar replyToId si viene
    if (replyToId) {
      const { data: replyMsg } = await supabase
        .from('messages')
        .select('id')
        .eq('id', replyToId)
        .eq('conversation_id', conversationId)
        .single();
      if (!replyMsg) {
        return NextResponse.json({ error: 'Reply target not found' }, { status: 404 });
      }
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
        reply_to_id: replyToId ?? null,
        message_type: messageType || 'text',
        attachment_id: attachmentId || null,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('Insert message error:', error);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    // Fire-and-forget push notifications to other participants (inline, sin self-fetch)
    pushToOtherParticipants(supabase, conversationId, user.sub).catch(() => {});

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error('Send message error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Envía push notifications directamente a los otros participantes.
 * Anteriormente esto hacía un fetch() a /api/notifications/send (self-fetch),
 * ahora se ejecuta inline para evitar el round-trip HTTP innecesario.
 */
async function pushToOtherParticipants(
  supabase: ReturnType<typeof import('@/lib/supabase/admin').getSupabaseAdmin>,
  conversationId: string,
  senderId: string
) {
  // 1. Obtener otros participantes con su muted_until
  const { data: others } = await supabase
    .from('conversation_participants')
    .select('user_id, muted_until')
    .eq('conversation_id', conversationId)
    .neq('user_id', senderId);

  if (!others || others.length === 0) return;

  // 2. Obtener nombre del remitente
  const { data: senderData } = await supabase
    .from('users')
    .select('username')
    .eq('id', senderId)
    .single();

  const senderName = senderData?.username || 'Alguien';

  // 3. Para cada participante no silenciado, buscar suscripciones y enviar

  await Promise.allSettled(
    (others as Array<{ user_id: string; muted_until: string | null }>).map(async (p) => {
      // Respetar muted_until
      if (p.muted_until && new Date(p.muted_until) > new Date()) return;

      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', p.user_id);

      if (!subscriptions || subscriptions.length === 0) return;

      const payload = {
        title: senderName,
        body: 'Nuevo mensaje',
        conversationId,
        type: 'message' as const,
      };

      const expiredEndpoints: string[] = [];

      await Promise.allSettled(
        (subscriptions as PushSubscription[]).map(async (sub) => {
          try {
            await sendWithRetry(sub, payload);
          } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              expiredEndpoints.push(sub.endpoint);
            }
          }
        })
      );

      // Limpiar suscripciones expiradas
      if (expiredEndpoints.length > 0) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', p.user_id)
          .in('endpoint', expiredEndpoints);
      }
    })
  );
}

/**
 * Reintenta enviar una push notification hasta maxAttempts veces con backoff exponencial.
 * Errores definitivos (404/410) se relanzán inmediatamente sin reintentar.
 */
async function sendWithRetry(
  sub: PushSubscription,
  payload: PushPayload,
  maxAttempts = 3
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sendPushNotification(sub, payload);
      return;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      // Suscripción expirada o inválida: no reintentar
      if (status === 404 || status === 410) throw err;
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 500 * attempt)); // 500ms, 1000ms
      }
    }
  }
  throw lastErr;
}
