/**
 * POST /api/auth/register
 *
 * Recibe del cliente: { email, username, passwordHash, salt, dhPublicKey }
 *   - El cliente derivó passwordHash localmente con PBKDF2 + SHA256.
 *   - La contraseña NUNCA viaja al servidor.
 *
 * Aplica: rate limit por IP, validación de formato, chequeo de duplicados.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit, saveAttempt } from '@/lib/auth/rateLimit';
import { logSecurityEvent } from '@/lib/auth/securityLogs';
import { getClientIp, getUserAgent } from '@/lib/auth/request-info';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  try {
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      await logSecurityEvent('RATE_LIMIT_BLOCK', null, {
        ip,
        userAgent,
        endpoint: 'register',
      });
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, username, passwordHash, salt, dhPublicKey } = body;

    if (!email || !username || !passwordHash || !salt || !dhPublicKey) {
      await saveAttempt(email || '', ip, false);
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await saveAttempt(email, ip, false);
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      await saveAttempt(email, ip, false);
      return NextResponse.json({ error: 'Username invalid' }, { status: 400 });
    }

    // Validar formato hex de hashes/salt/clave pública
    if (
      !/^[0-9a-f]{64}$/i.test(passwordHash) ||
      !/^[0-9a-f]{32}$/i.test(salt) ||
      !/^[0-9a-f]+$/i.test(dhPublicKey)
    ) {
      return NextResponse.json({ error: 'Invalid crypto format' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Comprobación de email duplicado
    const { data: emailExists } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .limit(1);

    if (emailExists && emailExists.length > 0) {
      await saveAttempt(email, ip, false);
      return NextResponse.json(
        { error: 'El correo ya está registrado' },
        { status: 409 }
      );
    }

    // Comprobación de username duplicado
    const { data: usernameExists } = await supabase
      .from('users')
      .select('id')
      .eq('username', username.toLowerCase())
      .limit(1);

    if (usernameExists && usernameExists.length > 0) {
      await saveAttempt(email, ip, false);
      return NextResponse.json(
        { error: 'El nombre de usuario ya existe' },
        { status: 409 }
      );
    }

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        password_hash: passwordHash,
        salt,
        dh_public_key: dhPublicKey,
      })
      .select('id, email, username, created_at')
      .single();

    if (error || !user) {
      await saveAttempt(email, ip, false);
      await logSecurityEvent('REGISTER_FAILED', null, { ip, userAgent, error: error?.message });
      return NextResponse.json({ error: 'Failed creating user' }, { status: 500 });
    }

    await saveAttempt(email, ip, true);
    await logSecurityEvent('REGISTER_SUCCESS', user.id, { ip, userAgent });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error('Register error:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
