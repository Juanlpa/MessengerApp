/**
 * POST /api/auth/revoke-other-sessions
 *
 * Cierra todas las sesiones activas del usuario excepto la del token actual.
 * El userId se extrae del JWT verificado — NUNCA de headers controlables por el cliente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revokeOtherSessions } from '@/lib/auth/sessionManager';
import { logSecurityEvent } from '@/lib/auth/securityLogs';
import { getUserFromRequestStrict, getTokenFromRequest } from '@/lib/auth/get-user';
import { getClientIp, getUserAgent } from '@/lib/auth/request-info';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  try {
    const user = await getUserFromRequestStrict(request);
    const token = getTokenFromRequest(request);

    if (!user || !token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // userId viene del JWT verificado, NO de un header arbitrario (evita IDOR)
    await revokeOtherSessions(user.sub, token);
    await logSecurityEvent('OTHER_SESSIONS_REVOKED', user.sub, { ip, userAgent });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Revoke sessions error:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
