/**
 * POST /api/auth/login
 *
 * Recibe del cliente: { email, passwordHash }
 *   - passwordHash es SHA256(PBKDF2(password, userSalt, 100k)) — precalculado en cliente.
 *   - La contraseña NUNCA viaja al servidor.
 *
 * Aplica: rate limit por IP, security logs, comparación en tiempo constante,
 * registro de sesión activa para soportar "revoke other sessions".
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { signJWT, createJWTPayload } from '@/lib/auth/jwt';
import { constantTimeEqual, fromHex } from '@/lib/crypto/utils';
import { checkRateLimit, saveAttempt } from '@/lib/auth/rateLimit';
import { logSecurityEvent } from '@/lib/auth/securityLogs';
import { createSession } from '@/lib/auth/sessionManager';
import { getClientIp, getUserAgent } from '@/lib/auth/request-info';

interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  salt: string;
  dh_public_key: string;
  role: 'user' | 'admin';
  is_active: boolean;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  try {
    // 1. Rate limit por IP (anti brute-force)
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      await logSecurityEvent('RATE_LIMIT_BLOCK', null, { ip, userAgent, endpoint: 'login' });
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, passwordHash } = body;

    if (!email || !passwordHash) {
      await saveAttempt(email || '', ip, false);
      return NextResponse.json(
        { error: 'Email and passwordHash required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('users')
      .select('id, email, username, password_hash, salt, dh_public_key, role, is_active')
      .eq('email', email.toLowerCase())
      .single();

    const user = data as UserRow | null;

    if (!user) {
      await saveAttempt(email, ip, false);
      await logSecurityEvent('LOGIN_FAILED', null, {
        ip,
        userAgent,
        email,
        reason: 'user_not_found',
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Comparación en tiempo constante (evita timing attacks)
    const storedHash = fromHex(user.password_hash);
    const providedHash = fromHex(passwordHash);
    const valid = constantTimeEqual(storedHash, providedHash);

    if (!valid) {
      await saveAttempt(email, ip, false);
      await logSecurityEvent('LOGIN_FAILED', user.id, {
        ip,
        userAgent,
        reason: 'wrong_password',
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Cuenta desactivada por un admin → bloquear login
    if (user.is_active === false) {
      await logSecurityEvent('LOGIN_FAILED', user.id, { ip, userAgent, reason: 'account_disabled' });
      return NextResponse.json({ error: 'Esta cuenta ha sido desactivada.' }, { status: 403 });
    }

    // Login exitoso — firmar JWT, registrar sesión, log
    const payload = createJWTPayload({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    });
    const token = signJWT(payload);

    await Promise.all([
      saveAttempt(email, ip, true),
      createSession(user.id, token, userAgent, ip),
      logSecurityEvent('LOGIN_SUCCESS', user.id, { ip, userAgent }),
    ]);

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    // No imprimir el error con datos sensibles; solo log genérico
    console.error('Login error:', err instanceof Error ? err.message : 'unknown');
    await logSecurityEvent('LOGIN_ERROR', null, { ip, userAgent });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
