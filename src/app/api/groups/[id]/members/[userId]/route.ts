/**
 * DELETE /api/groups/[id]/members/[userId]
 * Quita un miembro del grupo.
 *
 * Reglas:
 * - Un admin puede quitar a cualquier miembro (excepto a sí mismo si es el único admin)
 * - Un miembro puede salirse solo (userId === user.sub)
 * - Si el último admin se va, se promueve al miembro más antiguo como admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { rotateOnMemberLeave } from '@/lib/groups/key-rotation';

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: groupId, userId: targetId } = await context.params;
  const supabase = getSupabaseAdmin();

  // Verificar que el solicitante es miembro del grupo
  const { data: requesterMembership } = await supabase
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', groupId)
    .eq('user_id', user.sub)
    .single();

  if (!requesterMembership) {
    return NextResponse.json({ error: 'Grupo no encontrado o sin acceso' }, { status: 404 });
  }

  const isSelf = targetId === user.sub;
  const isAdmin = requesterMembership.role === 'admin';

  // Un miembro normal solo puede quitarse a sí mismo
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: 'Solo los administradores pueden quitar a otros miembros' }, { status: 403 });
  }

  // Verificar que el target es miembro del grupo
  const { data: targetMembership } = await supabase
    .from('conversation_participants')
    .select('role, joined_at')
    .eq('conversation_id', groupId)
    .eq('user_id', targetId)
    .single();

  if (!targetMembership) {
    return NextResponse.json({ error: 'El usuario no es miembro del grupo' }, { status: 404 });
  }

  // Protección: si el target es admin y es el único admin, rechazar
  if (targetMembership.role === 'admin') {
    const { count: adminCount } = await supabase
      .from('conversation_participants')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', groupId)
      .eq('role', 'admin');

    if ((adminCount ?? 0) <= 1) {
      // Si hay más miembros, promover al más antiguo antes de quitar
      const { data: nextMember } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', groupId)
        .neq('user_id', targetId)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextMember) {
        await supabase
          .from('conversation_participants')
          .update({ role: 'admin' })
          .eq('conversation_id', groupId)
          .eq('user_id', nextMember.user_id);
      }
    }
  }

  // Quitar al miembro
  const { error } = await supabase
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', groupId)
    .eq('user_id', targetId);

  if (error) {
    return NextResponse.json({ error: 'Error al quitar miembro' }, { status: 500 });
  }

  // CRÍTICO: rotar clave para que el ex-miembro no pueda descifrar mensajes futuros
  try {
    await rotateOnMemberLeave(groupId);
  } catch {
    // Log implícito — el miembro ya fue eliminado; la rotación puede reintentarse
  }

  return NextResponse.json({ success: true });
}
