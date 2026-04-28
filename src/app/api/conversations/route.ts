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

  // ?archived=true → muestra solo las archivadas; por defecto muestra las activas
  const showArchived = request.nextUrl.searchParams.get('archived') === 'true';

  const supabase = getSupabaseAdmin();

  // Obtener conversaciones donde el usuario es participante, filtradas por archivado
  const { data: participants, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id, encrypted_shared_key, shared_key_iv, shared_key_mac, is_archived, archived_at, muted_until')
    .eq('user_id', user.sub)
    .eq('is_archived', showArchived);

  console.log('API /conversations GET: user.sub =', user.sub, 'participants =', participants, 'error =', error);

  if (!participants || participants.length === 0) {
    return NextResponse.json({ conversations: [] });
  }



  // Obtener info de las conversaciones y el otro participante
  const conversations = [];
  for (const p of participants) {
    // Buscar el otro participante
    const { data: otherParticipants } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', p.conversation_id)
      .neq('user_id', user.sub)
      .limit(1);

    if (otherParticipants && otherParticipants.length > 0) {
      const { data: otherUser } = await supabase
        .from('users')
        .select('id, username')
        .eq('id', otherParticipants[0].user_id)
        .single();

      // Obtener último mensaje
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('conversation_id', p.conversation_id)
        .order('created_at', { ascending: false })
        .limit(1);

      conversations.push({
        id: p.conversation_id,
        otherUser: otherUser || { id: '', username: 'Unknown' },
        encryptedSharedKey: {
          ciphertext: p.encrypted_shared_key,
          iv: p.shared_key_iv,
          mac: p.shared_key_mac,
        },
        lastMessageAt: lastMsg?.[0]?.created_at || null,
        // Campos de archivado y silenciado (personales por participante)
        isArchived:  (p as any).is_archived  ?? false,
        archivedAt:  (p as any).archived_at  ?? null,
        // muted_until: expuesto para el sistema de push (Jade) —
        // si muted_until > now(), suprimir notificaciones push.
        mutedUntil:  (p as any).muted_until  ?? null,
      });
    } else {
      console.log('API /conversations GET: No other participants found for conversation', p.conversation_id);
    }
  }

  console.log('API /conversations GET: Returning conversations', conversations.length);

  // Ordenar por último mensaje
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
