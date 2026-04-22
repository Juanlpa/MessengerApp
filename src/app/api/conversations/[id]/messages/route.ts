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

  // Obtener mensajes (los más recientes primero, luego invertir para mostrar en orden)
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, sender_id, server_ciphertext, server_iv, server_mac_tag, ciphertext, iv, mac_tag, created_at')
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
      return {
        id: msg.id,
        senderId: msg.sender_id,
        // Retornar datos E2E para que el cliente descifre Capa 1
        e2e: {
          ciphertext: e2eData.ciphertext,
          iv: e2eData.iv,
          mac: e2eData.mac,
        },
        createdAt: msg.created_at,
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
    const { e2eEncrypted } = body;

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
        // Capa 1 (E2E) — guardados como referencia pero el dato real va en Capa 2
        ciphertext: e2eEncrypted.ciphertext,
        iv: e2eEncrypted.iv,
        mac_tag: e2eEncrypted.mac,
        // Capa 2 (at-rest)
        server_ciphertext: serverEncrypted.ciphertext,
        server_iv: serverEncrypted.iv,
        server_mac_tag: serverEncrypted.mac,
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
