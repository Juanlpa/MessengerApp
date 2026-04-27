/**
 * GET /api/contacts/pending
 * Lista las solicitudes de amistad pendientes RECIBIDAS por el usuario actual.
 * Incluye datos públicos del requester para mostrar en la UI.
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

  const { data: pending, error } = await supabase
    .from('friendships')
    .select('id, requester_id, created_at')
    .eq('addressee_id', user.sub)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Error al obtener solicitudes' }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ requests: [] });
  }

  type PendingRow = { id: string; requester_id: string; created_at: string };

  const requesterIds = (pending as PendingRow[]).map((p) => p.requester_id);

  const { data: requesters } = await supabase
    .from('users')
    .select('id, username, dh_public_key')
    .in('id', requesterIds);

  const requests = (pending as PendingRow[]).map((p) => ({
    friendship_id: p.id,
    requester: (requesters ?? []).find((u: { id: string }) => u.id === p.requester_id) ?? null,
    sent_at: p.created_at,
  }));

  return NextResponse.json({ requests });
}
