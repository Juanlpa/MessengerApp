/**
 * POST /api/groups
 * Crea un grupo nuevo. El creador es admin automáticamente.
 *
 * Body: { name, description?, member_ids[] }
 * - member_ids son los miembros adicionales (sin incluir al creador)
 * - Mínimo 2 member_ids → grupo de mínimo 3 personas
 * - Máximo 255 member_ids → grupo de máximo 256 personas
 * - Solo se pueden agregar usuarios con amistad aceptada con el creador
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { CreateGroupSchema } from '@/lib/validation/groups-schemas';
import { createInitialGroupKey } from '@/lib/groups/key-rotation';

function extractIssues(error: { issues?: { message: string }[]; errors?: { message: string }[] }) {
  return error.issues ?? error.errors ?? [];
}

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

  const parsed = CreateGroupSchema.safeParse(body);
  if (!parsed.success) {
    const issues = extractIssues(parsed.error as any);
    return NextResponse.json({ error: issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  const { name, description, member_ids } = parsed.data;
  const supabase = getSupabaseAdmin();

  // Verificar que todos los miembros son amigos aceptados del creador
  const { data: friendships } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(
      member_ids
        .map(
          (id) =>
            `and(requester_id.eq.${user.sub},addressee_id.eq.${id}),` +
            `and(requester_id.eq.${id},addressee_id.eq.${user.sub})`
        )
        .join(',')
    );

  const confirmedFriendIds = new Set<string>();
  for (const f of friendships ?? []) {
    const friendId = f.requester_id === user.sub ? f.addressee_id : f.requester_id;
    confirmedFriendIds.add(friendId);
  }

  const nonFriends = member_ids.filter((id) => !confirmedFriendIds.has(id));
  if (nonFriends.length > 0) {
    return NextResponse.json(
      { error: 'Solo puedes agregar contactos que sean tus amigos', non_friends: nonFriends },
      { status: 422 }
    );
  }

  // Crear la conversación de tipo grupo
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({ is_group: true, name, description: description ?? null, created_by: user.sub })
    .select('id')
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: 'Error al crear el grupo' }, { status: 500 });
  }

  // Insertar participantes: creador como admin, resto como member
  const participants = [
    { conversation_id: conv.id, user_id: user.sub, role: 'admin', added_by: user.sub,
      encrypted_shared_key: '', shared_key_iv: '', shared_key_mac: '' },
    ...member_ids.map((id) => ({
      conversation_id: conv.id,
      user_id: id,
      role: 'member',
      added_by: user.sub,
      encrypted_shared_key: '',
      shared_key_iv: '',
      shared_key_mac: '',
    })),
  ];

  const { error: partErr } = await supabase
    .from('conversation_participants')
    .insert(participants);

  if (partErr) {
    // Limpiar conversación huérfana
    await supabase.from('conversations').delete().eq('id', conv.id);
    return NextResponse.json({ error: 'Error al agregar miembros' }, { status: 500 });
  }

  // Crear clave simétrica inicial del grupo (Capa 2: cifrado en reposo)
  try {
    await createInitialGroupKey(conv.id);
  } catch {
    // No bloquear la creación del grupo si falla la clave — puede reintentarse
  }

  return NextResponse.json(
    { group: { id: conv.id, name, description, created_by: user.sub } },
    { status: 201 }
  );
}
