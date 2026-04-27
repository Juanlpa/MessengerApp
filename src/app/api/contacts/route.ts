/**
 * GET /api/contacts
 * Lista los amigos aceptados del usuario actual.
 * Retorna los datos públicos del otro usuario en cada friendship.
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // Obtener todas las friendships aceptadas donde el usuario participa
  const { data: friendships, error } = await supabase
    .from('friendships')
    .select(`
      id,
      requester_id,
      addressee_id,
      created_at,
      updated_at
    `)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.sub},addressee_id.eq.${user.sub}`);

  if (error) {
    return NextResponse.json({ error: 'Error al obtener contactos' }, { status: 500 });
  }

  if (!friendships || friendships.length === 0) {
    return NextResponse.json({ contacts: [] });
  }

  type FriendshipRow = { id: string; requester_id: string; addressee_id: string; created_at: string; updated_at: string };

  // Obtener los IDs del "otro" usuario en cada friendship
  const friendIds = (friendships as FriendshipRow[]).map((f) =>
    f.requester_id === user.sub ? f.addressee_id : f.requester_id
  );

  const { data: friendUsers, error: usersError } = await supabase
    .from('users')
    .select('id, username, dh_public_key, created_at')
    .in('id', friendIds);

  if (usersError) {
    return NextResponse.json({ error: 'Error al obtener datos de usuarios' }, { status: 500 });
  }

  // Combinar friendship + datos del amigo
  const contacts = (friendships as FriendshipRow[]).map((f) => {
    const friendId = f.requester_id === user.sub ? f.addressee_id : f.requester_id;
    const friendData = (friendUsers ?? []).find((u: { id: string }) => u.id === friendId);
    return {
      friendship_id: f.id,
      friend: friendData ?? null,
      since: f.updated_at,
    };
  });

  return NextResponse.json({ contacts });
}
