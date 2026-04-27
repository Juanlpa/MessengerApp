/**
 * DELETE /api/contacts/[id]
 * Elimina una friendship (contacto o solicitud).
 * Permitido para cualquiera de los dos usuarios que son parte de la friendship.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await context.params;

  const supabase = getSupabaseAdmin();

  // Verificar que el usuario es parte de esta friendship antes de borrar
  const { data: friendship } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id')
    .eq('id', id)
    .single();

  if (!friendship) {
    return NextResponse.json({ error: 'Relación no encontrada' }, { status: 404 });
  }

  // Solo los participantes pueden eliminar
  if (friendship.requester_id !== user.sub && friendship.addressee_id !== user.sub) {
    return NextResponse.json({ error: 'Sin permiso para eliminar esta relación' }, { status: 403 });
  }

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'Error al eliminar contacto' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
