/**
 * GET /api/users/search?q=username
 * Busca usuarios por username.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q');
  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, dh_public_key')
    .ilike('username', `%${q}%`)
    .neq('id', user.sub) // No retornarse a sí mismo
    .limit(10);

  if (error) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  return NextResponse.json({ users: users || [] });
}
