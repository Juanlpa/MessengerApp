/**
 * PATCH /api/groups/[id]/members/[userId]/role
 * Cambia el rol de un miembro (admin ↔ member). Solo admins pueden hacerlo.
 * Un admin no puede degradarse a sí mismo si es el único admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { ChangeRoleSchema } from '@/lib/validation/groups-schemas';

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: groupId, userId: targetId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = ChangeRoleSchema.safeParse(body);
  if (!parsed.success) {
    const issues = (parsed.error as any).issues ?? (parsed.error as any).errors ?? [];
    return NextResponse.json({ error: issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  const { role: newRole } = parsed.data;
  const supabase = getSupabaseAdmin();

  // Verificar que el solicitante es admin
  const { data: requesterMembership } = await supabase
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', groupId)
    .eq('user_id', user.sub)
    .single();

  if (!requesterMembership) {
    return NextResponse.json({ error: 'Grupo no encontrado o sin acceso' }, { status: 404 });
  }
  if (requesterMembership.role !== 'admin') {
    return NextResponse.json({ error: 'Solo los administradores pueden cambiar roles' }, { status: 403 });
  }

  // Verificar que el target es miembro del grupo
  const { data: targetMembership } = await supabase
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', groupId)
    .eq('user_id', targetId)
    .single();

  if (!targetMembership) {
    return NextResponse.json({ error: 'El usuario no es miembro del grupo' }, { status: 404 });
  }

  // Protección: no degradar al único admin
  if (targetMembership.role === 'admin' && newRole === 'member') {
    const { count: adminCount } = await supabase
      .from('conversation_participants')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', groupId)
      .eq('role', 'admin');

    if ((adminCount ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'No se puede degradar al único administrador del grupo' },
        { status: 422 }
      );
    }
  }

  const { error } = await supabase
    .from('conversation_participants')
    .update({ role: newRole })
    .eq('conversation_id', groupId)
    .eq('user_id', targetId);

  if (error) {
    return NextResponse.json({ error: 'Error al cambiar rol' }, { status: 500 });
  }

  return NextResponse.json({ success: true, user_id: targetId, role: newRole });
}
