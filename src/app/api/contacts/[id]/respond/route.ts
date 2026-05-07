/**
 * PATCH /api/contacts/[id]/respond
 * Acepta o rechaza una solicitud de amistad.
 *
 * Solo el addressee (destinatario) puede responder.
 * Solo se pueden responder solicitudes en estado 'pending'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { RespondRequestSchema } from '@/lib/validation/contacts-schemas';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = RespondRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues ?? (parsed.error as any).errors ?? [];
    return NextResponse.json(
      { error: issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    );
  }

  const { status } = parsed.data;
  const supabase = getSupabaseAdmin();

  // Verificar que la solicitud existe y el usuario actual es el destinatario
  const { data: friendship } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .eq('id', id)
    .single();

  if (!friendship) {
    return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
  }

  // Solo el addressee puede responder
  if (friendship.addressee_id !== user.sub) {
    return NextResponse.json({ error: 'Sin permiso para responder esta solicitud' }, { status: 403 });
  }

  // Solo se responden solicitudes pendientes
  if (friendship.status !== 'pending') {
    return NextResponse.json(
      { error: `La solicitud ya fue ${friendship.status}` },
      { status: 409 }
    );
  }

  const { data: updated, error } = await supabase
    .from('friendships')
    .update({ status })
    .eq('id', id)
    .select('id, requester_id, addressee_id, status, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error al actualizar solicitud' }, { status: 500 });
  }

  return NextResponse.json({ friendship: updated });
}
