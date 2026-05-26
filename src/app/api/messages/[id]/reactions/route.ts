/**
 * POST   /api/messages/[id]/reactions — Agregar o quitar (toggle) una reacción
 * GET    /api/messages/[id]/reactions — Obtener reacciones de un mensaje
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: messageId } = await context.params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('message_reactions')
    .select('emoji, user_id')
    .eq('message_id', messageId);

  if (error) return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });

  // Agrupar por emoji
  const grouped: Record<string, string[]> = {};
  for (const row of data || []) {
    if (!grouped[row.emoji]) grouped[row.emoji] = [];
    grouped[row.emoji].push(row.user_id);
  }
  const reactions = Object.entries(grouped).map(([emoji, userIds]) => ({ emoji, userIds }));

  return NextResponse.json({ reactions });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: messageId } = await context.params;
  const supabase = getSupabaseAdmin();

  let emoji: string;
  try {
    const body = await request.json();
    emoji = body.emoji;
    if (!emoji || typeof emoji !== 'string' || emoji.length > 8) {
      return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Verificar que el mensaje existe y el usuario es participante
  const { data: msg } = await supabase
    .from('messages')
    .select('conversation_id')
    .eq('id', messageId)
    .single();

  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  const { data: participant } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', msg.conversation_id)
    .eq('user_id', user.sub)
    .single();

  if (!participant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 });

  // Toggle: si ya existe, eliminar; si no, insertar
  const { data: existing } = await supabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', user.sub)
    .eq('emoji', emoji)
    .single();

  if (existing) {
    await supabase.from('message_reactions').delete().eq('id', existing.id);
    return NextResponse.json({ action: 'removed' });
  } else {
    await supabase.from('message_reactions').insert({ message_id: messageId, user_id: user.sub, emoji });
    return NextResponse.json({ action: 'added' });
  }
}
