/**
 * require-admin.ts — Verificación de rol admin para operaciones críticas.
 *
 * Comprueba el JWT y luego CONSULTA LA DB para confirmar que el usuario es
 * admin y está activo. No basta con el `role` del JWT: podría estar desfasado
 * (a un usuario se le pudo revocar el rol después de emitir el token). Para
 * operaciones críticas, la fuente de verdad es la DB.
 */

import { getUserFromRequest } from './get-user';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { JWTPayload } from './jwt';

export interface AdminCheckResult {
  ok: boolean;
  status: number;
  error?: string;
  user?: JWTPayload;
}

export async function requireAdmin(request: Request): Promise<AdminCheckResult> {
  const user = getUserFromRequest(request);
  if (!user) {
    return { ok: false, status: 401, error: 'No autorizado' };
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', user.sub)
    .single();

  const row = data as { role: string; is_active: boolean } | null;

  if (!row || row.is_active === false) {
    return { ok: false, status: 403, error: 'Cuenta no válida' };
  }
  if (row.role !== 'admin') {
    return { ok: false, status: 403, error: 'Se requieren permisos de administrador' };
  }

  return { ok: true, status: 200, user };
}
