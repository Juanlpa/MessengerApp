/**
 * GET /api/auth/sessions
 *
 * Lista las sesiones activas del usuario autenticado.
 * NO devuelve el JWT — solo metadata (dispositivo, IP, última actividad).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequestStrict, getTokenFromRequest } from '@/lib/auth/get-user';
import { getActiveSessions } from '@/lib/auth/sessionManager';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequestStrict(request);
    const currentToken = getTokenFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await getActiveSessions(user.sub);

    return NextResponse.json({
      sessions,
      // Marcamos cuál es la sesión actual para que el frontend no la deje cerrar
      currentJwtId: currentToken,
    });
  } catch (err) {
    console.error('List sessions error:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
