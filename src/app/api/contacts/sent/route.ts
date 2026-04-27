/**
 * GET /api/contacts/sent
 * Lista las solicitudes de amistad ENVIADAS por el usuario actual (estado pending).
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

  const { data: sent, error } = await supabase
    .from('friendships')
    .select('id, addressee_id, created_at')
    .eq('requester_id', user.sub)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Error al obtener solicitudes enviadas' }, { status: 500 });
  }

  if (!sent || sent.length === 0) {
    return NextResponse.json({ requests: [] });
  }

  type SentRow = { id: string; addressee_id: string; created_at: string };

  const addresseeIds = (sent as SentRow[]).map((s) => s.addressee_id);

  const { data: addressees } = await supabase
    .from('users')
    .select('id, username')
    .in('id', addresseeIds);

  const requests = (sent as SentRow[]).map((s) => ({
    friendship_id: s.id,
    addressee: (addressees ?? []).find((u: { id: string }) => u.id === s.addressee_id) ?? null,
    sent_at: s.created_at,
  }));

  return NextResponse.json({ requests });
}
