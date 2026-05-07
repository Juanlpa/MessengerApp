/**
 * GET /api/conversations — Lista conversaciones del usuario
 * POST /api/conversations — Crear nueva conversación 1-a-1
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const showArchived = request.nextUrl.searchParams.get('archived') === 'true';
  const supabase = getSupabaseAdmin();

  // Query 1: registros del usuario actual
  const { data: myParticipants, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id, encrypted_shared_key, shared_key_iv, shared_key_mac, is_archived, archived_at, muted_until')
    .eq('user_id', user.sub)
    .eq('is_archived', showArchived);

  if (error) return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
  if (!myParticipants || myParticipants.length === 0) return NextResponse.json({ conversations: [] });

  type MyParticipant = {
    conversation_id: string;
    encrypted_shared_key: string;
    shared_key_iv: string;
    shared_key_mac: string;
    is_archived: boolean;
    archived_at: string | null;
    muted_until: string | null;
  };
  const participants = myParticipants as MyParticipant[];
  const conversationIds = participants.map(p => p.conversation_id);

  // Query 2: el otro participante de todas las conversaciones a la vez
  const { data: otherParticipants } = await supabase
    .from('conversation_participants')
    .select('conversation_id, user_id')
    .in('conversation_id', conversationIds)
    .neq('user_id', user.sub);

  const otherUserIdByConv = new Map<string, string>();
  for (const op of (otherParticipants ?? []) as Array<{ conversation_id: string; user_id: string }>) {
    if (!otherUserIdByConv.has(op.conversation_id)) {
      otherUserIdByConv.set(op.conversation_id, op.user_id);
    }
  }

  const otherUserIds = [...new Set(otherUserIdByConv.values())];

  // Query 3: datos de todos los otros usuarios a la vez
  const { data: usersData } = await supabase
    .from('users')
    .select('id, username')
    .in('id', otherUserIds);

  const usersById = new Map<string, { id: string; username: string }>();
  for (const u of (usersData ?? []) as Array<{ id: string; username: string }>) usersById.set(u.id, u);

  // Query 4: último mensaje por conversación (solo created_at, sin contenido cifrado)
  const { data: messages } = await supabase
    .from('messages')
    .select('conversation_id, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });

  const lastMessageByConv = new Map<string, string>();
  for (const msg of messages ?? []) {
    if (!lastMessageByConv.has(msg.conversation_id)) {
      lastMessageByConv.set(msg.conversation_id, msg.created_at);
    }
  }

  // Construir respuesta
  const conversations = [];
  for (const p of participants) {
    const otherUserId = otherUserIdByConv.get(p.conversation_id);
    if (!otherUserId) continue;
    const otherUser = usersById.get(otherUserId);
    if (!otherUser) continue;

    conversations.push({
      id: p.conversation_id,
      otherUser,
      encryptedSharedKey: {
        ciphertext: p.encrypted_shared_key,
        iv: p.shared_key_iv,
        mac: p.shared_key_mac,
      },
      lastMessageAt: lastMessageByConv.get(p.conversation_id) ?? null,
      isArchived:  p.is_archived  ?? false,
      archivedAt:  p.archived_at  ?? null,
      mutedUntil:  p.muted_until  ?? null,
    });
  }

  conversations.sort((a, b) => {
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });

  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { otherUserId, myEncryptedSharedKey, otherEncryptedSharedKey } = body;

    if (!otherUserId || !myEncryptedSharedKey || !otherEncryptedSharedKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Verificar que no existe ya una conversación entre estos dos usuarios
    const { data: existingParticipants } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.sub);

    if (existingParticipants) {
      for (const ep of existingParticipants) {
        const { data: otherInConv } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', ep.conversation_id)
          .eq('user_id', otherUserId)
          .limit(1);
        if (otherInConv && otherInConv.length > 0) {
          return NextResponse.json({ conversationId: ep.conversation_id });
        }
      }
    }

    // Crear conversación
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .insert({})
      .select('id')
      .single();

    if (convErr || !conv) {
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

    // Insertar participantes con sus shared keys cifradas
    const { error: partErr } = await supabase.from('conversation_participants').insert([
      {
        conversation_id: conv.id,
        user_id: user.sub,
        encrypted_shared_key: myEncryptedSharedKey.ciphertext,
        shared_key_iv: myEncryptedSharedKey.iv,
        shared_key_mac: myEncryptedSharedKey.mac,
      },
      {
        conversation_id: conv.id,
        user_id: otherUserId,
        encrypted_shared_key: otherEncryptedSharedKey.ciphertext,
        shared_key_iv: otherEncryptedSharedKey.iv,
        shared_key_mac: otherEncryptedSharedKey.mac,
      },
    ]);

    if (partErr) {
      console.error('Failed to insert participants:', partErr);
      return NextResponse.json({ error: 'Failed to insert participants', details: partErr }, { status: 500 });
    }

    return NextResponse.json({ conversationId: conv.id }, { status: 201 });
  } catch (err) {
    console.error('Create conversation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
