/**
 * GET  /api/groups/[id] — Detalles del grupo con lista de miembros y roles
 * PATCH /api/groups/[id] — Editar nombre/descripción/avatar (solo admins)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { UpdateGroupSchema } from '@/lib/validation/groups-schemas';

type RouteContext = { params: Promise<{ id: string }> };

function extractIssues(error: { issues?: { message: string }[]; errors?: { message: string }[] }) {
  return error.issues ?? error.errors ?? [];
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await context.params;
  const supabase = getSupabaseAdmin();

  // Verificar que el usuario es participante del grupo
  const { data: membership } = await supabase
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', id)
    .eq('user_id', user.sub)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Grupo no encontrado o sin acceso' }, { status: 404 });
  }

  // Datos del grupo
  const { data: group, error: groupErr } = await supabase
    .from('conversations')
    .select('id, name, description, avatar_url, created_by, created_at, is_group')
    .eq('id', id)
    .eq('is_group', true)
    .single();

  if (groupErr || !group) {
    return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });
  }

  // Miembros con sus roles
  const { data: participants } = await supabase
    .from('conversation_participants')
    .select('user_id, role, joined_at, added_by')
    .eq('conversation_id', id);

  const memberIds = (participants ?? []).map((p: any) => p.user_id);
  const { data: users } = await supabase
    .from('users')
    .select('id, username')
    .in('id', memberIds);

  const members = (participants ?? []).map((p: any) => ({
    user_id: p.user_id,
    role: p.role,
    joined_at: p.joined_at,
    added_by: p.added_by,
    username: (users ?? []).find((u: any) => u.id === p.user_id)?.username ?? 'Desconocido',
  }));

  return NextResponse.json({ group: { ...group, members } });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = UpdateGroupSchema.safeParse(body);
  if (!parsed.success) {
    const issues = extractIssues(parsed.error as any);
    return NextResponse.json({ error: issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Solo admins pueden editar el grupo
  const { data: membership } = await supabase
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', id)
    .eq('user_id', user.sub)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Grupo no encontrado o sin acceso' }, { status: 404 });
  }

  if (membership.role !== 'admin') {
    return NextResponse.json({ error: 'Solo los administradores pueden editar el grupo' }, { status: 403 });
  }

  const { data: updated, error } = await supabase
    .from('conversations')
    .update(parsed.data)
    .eq('id', id)
    .eq('is_group', true)
    .select('id, name, description, avatar_url')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error al actualizar el grupo' }, { status: 500 });
  }

  return NextResponse.json({ group: updated });
}
