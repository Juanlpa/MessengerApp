/**
 * PATCH /api/conversations/[id]/archive
 * Archiva o desarchiva una conversación para el usuario autenticado.
 *
 * Body: { archived: boolean }
 *   - true  → archivar (ocultar de la lista principal)
 *   - false → desarchivar (volver a la lista principal)
 *
 * El archivado es personal: no afecta a los demás participantes de la conversación.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { ArchiveSchema } from '@/lib/validation/conversations-schemas';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: conversationId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = ArchiveSchema.safeParse(body);
  if (!parsed.success) {
    const issues = (parsed.error as any).issues ?? (parsed.error as any).errors ?? [];
    return NextResponse.json({ error: issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  const { archived } = parsed.data;
  const supabase = getSupabaseAdmin();

  // Verificar que el usuario es participante
  const { data: membership } = await supabase
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.sub)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Conversación no encontrada o sin acceso' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('conversation_participants')
    .update({
      is_archived: archived,
      archived_at: archived ? now : null,
    })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.sub)
    .select('is_archived, archived_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error al actualizar archivado' }, { status: 500 });
  }

  return NextResponse.json(updated);
}
