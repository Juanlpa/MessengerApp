/**
 * POST /api/contacts/request
 * Envía una solicitud de amistad al usuario con addressee_id.
 *
 * Validaciones:
 * - No se puede enviar solicitud a uno mismo
 * - No puede existir ya una solicitud entre los dos usuarios
 * - El addressee_id debe ser un UUID válido de un usuario existente
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { SendRequestSchema } from '@/lib/validation/contacts-schemas';

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = SendRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues ?? (parsed.error as any).errors ?? [];
    return NextResponse.json(
      { error: issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    );
  }

  const { addressee_id } = parsed.data;

  // El usuario no puede enviarse una solicitud a sí mismo
  if (addressee_id === user.sub) {
    return NextResponse.json(
      { error: 'No puedes enviarte una solicitud a ti mismo' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Verificar que el destinatario existe
  const { data: addressee } = await supabase
    .from('users')
    .select('id')
    .eq('id', addressee_id)
    .single();

  if (!addressee) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  // Verificar si ya existe una relación entre ambos usuarios (en cualquier dirección)
  const { data: existing } = await supabase
    .from('friendships')
    .select('id, status')
    .or(
      `and(requester_id.eq.${user.sub},addressee_id.eq.${addressee_id}),` +
      `and(requester_id.eq.${addressee_id},addressee_id.eq.${user.sub})`
    )
    .maybeSingle();

  if (existing) {
    const messages: Record<string, string> = {
      pending: 'Ya existe una solicitud pendiente entre estos usuarios',
      accepted: 'Ya son amigos',
      rejected: 'Esta solicitud fue rechazada previamente',
      blocked: 'No se puede enviar solicitud',
    };
    return NextResponse.json(
      { error: messages[existing.status] ?? 'Ya existe una relación' },
      { status: 409 }
    );
  }

  const { data: friendship, error } = await supabase
    .from('friendships')
    .insert({ requester_id: user.sub, addressee_id, status: 'pending' })
    .select('id, requester_id, addressee_id, status, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error al enviar solicitud' }, { status: 500 });
  }

  return NextResponse.json({ friendship }, { status: 201 });
}
