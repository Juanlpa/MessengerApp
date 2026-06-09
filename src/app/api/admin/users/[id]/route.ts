/**
 * Gestión de un usuario por un administrador (operaciones críticas).
 *   GET    /api/admin/users/[id]  → detalle
 *   PATCH  /api/admin/users/[id]  → actualizar rol / activar-desactivar / username
 *   DELETE /api/admin/users/[id]  → eliminar (anonimización + revocar sesiones)
 *
 * Todas requieren rol admin verificado contra la DB (requireAdmin).
 */
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/require-admin';
import { revokeAllSessions } from '@/lib/auth/sessionManager';
import { logSecurityEvent } from '@/lib/auth/securityLogs';

type RouteContext = { params: Promise<{ id: string }> };

// ── GET: detalle de un usuario ──────────────────────────────────────────────
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, role, is_active, is_online, created_at, last_seen')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  return NextResponse.json({ user: data });
}

// ── PATCH: actualizar rol / estado / username ───────────────────────────────
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const adminId = auth.user!.sub;
  const body = await request.json();
  const { role, is_active, username } = body as {
    role?: string; is_active?: boolean; username?: string;
  };

  const update: Record<string, unknown> = {};

  if (role !== undefined) {
    if (role !== 'user' && role !== 'admin') {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }
    // Un admin no puede quitarse a sí mismo el rol admin (evita auto-bloqueo)
    if (id === adminId && role !== 'admin') {
      return NextResponse.json({ error: 'No puedes quitarte tu propio rol de administrador' }, { status: 400 });
    }
    update.role = role;
  }

  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active debe ser booleano' }, { status: 400 });
    }
    // Un admin no puede desactivarse a sí mismo
    if (id === adminId && is_active === false) {
      return NextResponse.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 400 });
    }
    update.is_active = is_active;
  }

  if (username !== undefined) {
    if (typeof username !== 'string' || username.length < 3 || username.length > 30 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json({ error: 'Username inválido (3-30, letras/números/_)' }, { status: 400 });
    }
    const supabaseCheck = getSupabaseAdmin();
    const { data: taken } = await supabaseCheck
      .from('users').select('id').eq('username', username).neq('id', id).maybeSingle();
    if (taken) return NextResponse.json({ error: 'Username ya está en uso' }, { status: 409 });
    update.username = username;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('users').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });

  // Si se desactivó al usuario, invalidar sus sesiones activas de inmediato
  if (update.is_active === false) {
    await revokeAllSessions(id);
  }

  await logSecurityEvent('ADMIN_USER_UPDATED', adminId, { targetUserId: id, changes: Object.keys(update) });
  return NextResponse.json({ success: true });
}

// ── DELETE: eliminar (anonimización, igual que la baja de cuenta propia) ─────
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const adminId = auth.user!.sub;

  // Un admin no puede eliminarse a sí mismo desde aquí (usar baja de cuenta propia)
  if (id === adminId) {
    return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta desde el panel' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const anonId = id.slice(0, 8);

  // Anonimizar + borrar credenciales (impide login) — los datos referenciados
  // (mensajes, llamadas) se conservan por integridad referencial.
  const { error } = await supabase
    .from('users')
    .update({
      email: `deleted_${anonId}@deleted.local`,
      username: `deleted_${anonId}`,
      password_hash: '',
      salt: '',
      dh_public_key: '',
      private_key_encrypted: null,
      is_online: false,
      is_active: false,
    })
    .eq('id', id);

  if (error) return NextResponse.json({ error: 'No se pudo eliminar el usuario' }, { status: 500 });

  await revokeAllSessions(id);
  await Promise.all([
    supabase.from('push_subscriptions').delete().eq('user_id', id),
    supabase.from('password_reset_tokens').delete().eq('user_id', id),
  ]);

  await logSecurityEvent('ADMIN_USER_DELETED', adminId, { targetUserId: id });
  return NextResponse.json({ success: true });
}
