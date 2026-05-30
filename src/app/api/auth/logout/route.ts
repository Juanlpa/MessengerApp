/**
 * POST /api/auth/logout
 *
 * Cierra la sesión del lado del servidor: añade el JWT actual a la blacklist
 * (revoked_tokens) y elimina su registro de active_sessions. Tras esto, el
 * token deja de ser válido aunque alguien lo haya capturado.
 *
 * El cliente debe llamar a esto ANTES de borrar el token local.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest, getTokenFromRequest } from '@/lib/auth/get-user';
import { revokeJWT } from '@/lib/auth/jwtBlacklist';
import { logSecurityEvent } from '@/lib/auth/securityLogs';
import { getClientIp, getUserAgent } from '@/lib/auth/request-info';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  try {
    const user = getUserFromRequest(request);
    const token = getTokenFromRequest(request);

    // Si no hay token válido, el logout es idempotente (ya está "cerrado")
    if (!user || !token) {
      return NextResponse.json({ success: true });
    }

    // Revocar el token (blacklist) y eliminar la sesión activa
    await revokeJWT(token, user.sub);
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('active_sessions').delete().eq('jwt_id', token);
    } catch {
      // no crítico
    }
    await logSecurityEvent('LOGOUT', user.sub, { ip, userAgent });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err instanceof Error ? err.message : 'unknown');
    // Aun si falla, el cliente borrará el token local → no bloquear
    return NextResponse.json({ success: true });
  }
}
