/**
 * GET /api/auth/me
 * 
 * Retorna la info del usuario autenticado basado en el JWT del header Authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/auth/jwt';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    try {
      const payload = verifyJWT(token);
      return NextResponse.json({
        user: {
          id: payload.sub,
          email: payload.email,
          username: payload.username,
        },
      });
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }
  } catch (err) {
    console.error('Auth/me error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
