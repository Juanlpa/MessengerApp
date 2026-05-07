/**
 * PATCH /api/conversations/[id]/mute
 * Silencia o activa las notificaciones de una conversación para el usuario autenticado.
 *
 * Body: { muted_until: string | null }
 *   - ISO 8601 datetime → silenciar hasta esa fecha/hora
 *   - null              → desactivar silenciamiento
 *
 * El silenciado es personal. El campo muted_until queda expuesto en GET /api/conversations
 * para que el sistema de notificaciones push (dominio: Jade) pueda suprimirlas
 * cuando muted_until > now().
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { MuteSchema } from '@/lib/validation/conversations-schemas';

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

  const parsed = MuteSchema.safeParse(body);
  if (!parsed.success) {
    const issues = (parsed.error as any).issues ?? (parsed.error as any).errors ?? [];
    return NextResponse.json({ error: issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  const { muted_until } = parsed.data;
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

  const { data: updated, error } = await supabase
    .from('conversation_participants')
    .update({ muted_until })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.sub)
    .select('muted_until')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error al actualizar silenciamiento' }, { status: 500 });
  }

  return NextResponse.json(updated);
}
