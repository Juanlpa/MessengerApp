/**
 * Blacklist de JWTs revocados.
 *
 * Tabla revoked_tokens (migración 014):
 *   token       TEXT  — el JWT completo
 *   user_id     UUID
 *   revoked_at  TIMESTAMPTZ
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { logSecurityEvent } from './securityLogs';

export async function revokeJWT(token: string, userId: string) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('revoked_tokens')
      .upsert(
        { token, user_id: userId, revoked_at: new Date() },
        { onConflict: 'token' }
      );

    await logSecurityEvent('JWT_REVOKED', userId, {});
  } catch (error) {
    console.error('JWT revoke error:', error instanceof Error ? error.message : 'unknown');
  }
}

/**
 * @returns true si el token fue revocado y NO debe aceptarse.
 *          false si el token NO está en la blacklist (o si la consulta falló).
 *
 * Nota: ante un error de DB, devolvemos false (fail-open) para no bloquear
 * a usuarios legítimos. La verificación principal sigue siendo la firma JWT.
 */
export async function isRevoked(token: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('revoked_tokens')
      .select('id')
      .eq('token', token)
      .limit(1)
      .maybeSingle();

    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}
