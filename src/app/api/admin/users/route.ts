/**
 * GET /api/admin/users — Lista todos los usuarios (solo admin).
 *
 * Operación crítica: requiere rol admin verificado contra la DB.
 * No expone datos sensibles (password_hash, salt, claves).
 */
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/require-admin';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, role, is_active, is_online, created_at, last_seen')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Error al listar usuarios' }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}
