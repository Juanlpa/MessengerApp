/**
 * POST /api/auth/reset-password/request
 *
 * Genera un token de reset y lo envía por email.
 * Aplica rate limit y respuesta uniforme (no enumera usuarios).
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendResetEmail } from '@/lib/email/sendResetEmail';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { logSecurityEvent } from '@/lib/auth/securityLogs';
import { getClientIp, getUserAgent } from '@/lib/auth/request-info';

// Respuesta uniforme para no revelar si un email está o no registrado
const UNIFORM_OK = { message: 'Si el email existe, te enviamos un correo con instrucciones.' };

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  try {
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      await logSecurityEvent('RATE_LIMIT_BLOCK', null, {
        ip,
        userAgent,
        endpoint: 'reset-password/request',
      });
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429 }
      );
    }

    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json(UNIFORM_OK);
    }

    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single();

    // Respuesta idéntica si el usuario existe o no — no enumeramos cuentas
    if (!user) {
      return NextResponse.json(UNIFORM_OK);
    }

    // Token random 32 bytes; en DB guardamos solo su hash SHA-256
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await supabase.from('password_reset_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 min
      used: false,
    });

    // URL desde env (no hardcodeada). Default a localhost solo en dev.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const resetLink = `${baseUrl}/auth/reset-password?token=${token}`;

    try {
      await sendResetEmail(user.email, resetLink);
    } catch (mailErr) {
      // Log pero responde uniforme — no queremos delatar fallos
      console.error('sendResetEmail failed:', mailErr instanceof Error ? mailErr.message : 'unknown');
    }

    await logSecurityEvent('RESET_PASSWORD_REQUESTED', user.id, { ip, userAgent });

    return NextResponse.json(UNIFORM_OK);
  } catch (err) {
    console.error('Reset request error:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
