/**
 * POST /api/groups/[id]/members
 * Agrega un miembro al grupo. Solo admins pueden hacerlo.
 * El nuevo miembro debe ser amigo (friendship aceptada) del admin que lo agrega.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { AddMemberSchema } from '@/lib/validation/groups-schemas';
import { rotateOnMemberJoin } from '@/lib/groups/key-rotation';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: groupId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) {
    const issues = (parsed.error as any).issues ?? (parsed.error as any).errors ?? [];
    return NextResponse.json({ error: issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  const { user_id: newMemberId } = parsed.data;
  const supabase = getSupabaseAdmin();

  // Verificar que el solicitante es admin del grupo
  const { data: adminCheck } = await supabase
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', groupId)
    .eq('user_id', user.sub)
    .single();

  if (!adminCheck) {
    return NextResponse.json({ error: 'Grupo no encontrado o sin acceso' }, { status: 404 });
  }
  if (adminCheck.role !== 'admin') {
    return NextResponse.json({ error: 'Solo los administradores pueden agregar miembros' }, { status: 403 });
  }

  // Verificar que el nuevo miembro no está ya en el grupo
  const { data: existing } = await supabase
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', groupId)
    .eq('user_id', newMemberId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'El usuario ya es miembro del grupo' }, { status: 409 });
  }

  // Verificar límite máximo de 256 miembros
  const { count } = await supabase
    .from('conversation_participants')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', groupId);

  if ((count ?? 0) >= 256) {
    return NextResponse.json({ error: 'El grupo ha alcanzado el límite de 256 miembros' }, { status: 422 });
  }

  // Verificar amistad entre el admin y el nuevo miembro
  const { data: friendship } = await supabase
    .from('friendships')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${user.sub},addressee_id.eq.${newMemberId}),` +
      `and(requester_id.eq.${newMemberId},addressee_id.eq.${user.sub})`
    )
    .maybeSingle();

  if (!friendship) {
    return NextResponse.json(
      { error: 'Solo puedes agregar usuarios que sean tus contactos' },
      { status: 422 }
    );
  }

  const { error } = await supabase
    .from('conversation_participants')
    .insert({
      conversation_id: groupId,
      user_id: newMemberId,
      role: 'member',
      added_by: user.sub,
      encrypted_shared_key: '',
      shared_key_iv: '',
      shared_key_mac: '',
    });

  if (error) {
    return NextResponse.json({ error: 'Error al agregar miembro' }, { status: 500 });
  }

  // Rotar clave del grupo: el nuevo miembro no debe poder descifrar mensajes previos
  try {
    await rotateOnMemberJoin(groupId);
  } catch {
    // No bloquear — el miembro fue agregado; la rotación puede reintentarse
  }

  return NextResponse.json({ success: true, user_id: newMemberId }, { status: 201 });
}
