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

  // Parámetros de paginación por cursor
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor'); // created_at del mensaje más antiguo cargado
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);

  // Traer mensajes desde el cursor hacia atrás (orden DESC para cursor eficiente)
  let query = supabase
    .from('messages')
    .select('id, sender_id, server_ciphertext, server_iv, server_mac_tag, ciphertext, iv, mac_tag, created_at, reply_to_id, edited_at, is_deleted')
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
  const messages = hasMore ? (rawMessages || []).slice(0, limit) : (rawMessages || []);
  // Volver a orden cronológico ascendente para el cliente
  messages.reverse();

  // Quitar Capa 2 (at-rest) de cada mensaje
  const masterKey = getServerMasterKey();
  const decryptedMessages = messages.map((msg: any) => {
    // Mensajes eliminados: devolver marcador sin contenido
    if (msg.is_deleted) {
      return {
        id: msg.id,
        senderId: msg.sender_id,
        e2e: null,
        createdAt: msg.created_at,
        isDeleted: true,
        replyToId: msg.reply_to_id ?? null,
        editedAt: msg.edited_at ?? null,
      };
    }
    try {
      const e2eCiphertext = decryptMessageAtRest(
        { ciphertext: msg.server_ciphertext, iv: msg.server_iv, mac: msg.server_mac_tag },
        masterKey
      );
      const e2eData = JSON.parse(e2eCiphertext);
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
        editedAt: msg.edited_at ?? null,
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
        editedAt: msg.edited_at ?? null,
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
    const { e2eEncrypted, replyToId } = body;

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
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('Insert message error:', error);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error('Send message error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
