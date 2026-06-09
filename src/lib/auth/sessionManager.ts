/**
 * Gestión de sesiones activas.
 *
 * Tabla active_sessions (migración 003):
 *   jwt_id     TEXT   — el JWT completo (sirve para identificar la sesión)
 *   device     TEXT   — user-agent
 *   ip         TEXT
 *   last_seen  TIMESTAMPTZ
 *   revoked    BOOLEAN
 *
 * Cuando una sesión se "revoca" la borramos del active_sessions e insertamos
 * el token en revoked_tokens para que isRevoked() lo rechace en futuras requests.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function createSession(
  userId: string,
  token: string,
  userAgent: string,
  ip: string
) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('active_sessions').insert({
      user_id: userId,
      jwt_id: token,
      device: userAgent,
      ip,
      last_seen: new Date(),
      revoked: false,
    });
  } catch (error) {
    console.error('Create session error:', error instanceof Error ? error.message : 'unknown');
  }
}

/**
 * Revoca TODAS las sesiones activas del usuario.
 * Úsalo tras cambio/reset de contraseña — todos los JWTs viejos quedan invalidados.
 */
export async function revokeAllSessions(userId: string) {
  try {
    const supabase = getSupabaseAdmin();

    const { data: sessions } = await supabase
      .from('active_sessions')
      .select('jwt_id')
      .eq('user_id', userId);

    if (sessions && sessions.length > 0) {
      const rows = sessions.map((s: { jwt_id: string }) => ({
        token: s.jwt_id,
        user_id: userId,
        revoked_at: new Date(),
      }));
      // upsert para evitar conflictos si el token ya fue revocado antes
      await supabase.from('revoked_tokens').upsert(rows, { onConflict: 'token' });
    }

    await supabase.from('active_sessions').delete().eq('user_id', userId);
  } catch (error) {
    console.error('Revoke all sessions error:', error instanceof Error ? error.message : 'unknown');
  }
}

export async function revokeOtherSessions(userId: string, currentToken: string) {
  try {
    const supabase = getSupabaseAdmin();

    const { data: others } = await supabase
      .from('active_sessions')
      .select('jwt_id')
      .eq('user_id', userId)
      .neq('jwt_id', currentToken);

    if (others && others.length > 0) {
      const rows = others.map((s: { jwt_id: string }) => ({
        token: s.jwt_id,
        user_id: userId,
        revoked_at: new Date(),
      }));
      await supabase.from('revoked_tokens').upsert(rows, { onConflict: 'token' });
    }

    await supabase
      .from('active_sessions')
      .delete()
      .eq('user_id', userId)
      .neq('jwt_id', currentToken);
  } catch (error) {
    console.error('Revoke session error:', error instanceof Error ? error.message : 'unknown');
  }
}

export async function getActiveSessions(userId: string) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('active_sessions')
      .select('id, device, ip, last_seen')
      .eq('user_id', userId)
      .order('last_seen', { ascending: false });

    if (error) {
      console.error('Get sessions error:', error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Get sessions error:', error instanceof Error ? error.message : 'unknown');
    return [];
  }
}
