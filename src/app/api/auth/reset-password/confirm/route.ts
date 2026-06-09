/**
 * POST /api/auth/reset-password/confirm
 *
 * Recibe del cliente: { token, newPasswordHash, newSalt }
 *   - token es el código enviado por email (validado contra password_reset_tokens)
 *   - El cliente derivó newPasswordHash localmente con PBKDF2 sobre newSalt.
 *   - La contraseña NUNCA viaja al servidor.
 *
 * Aplica: rate limit por IP, validación de formato, marca el token como usado,
 * revoca TODAS las sesiones del usuario, security log.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit, saveAttempt } from '@/lib/auth/rateLimit';
import { logSecurityEvent } from '@/lib/auth/securityLogs';
import { revokeAllSessions } from '@/lib/auth/sessionManager';
import { getClientIp, getUserAgent } from '@/lib/auth/request-info';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  try {
    // Rate limit por IP (anti brute-force de tokens)
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      await logSecurityEvent('RATE_LIMIT_BLOCK', null, {
        ip,
        userAgent,
        endpoint: 'reset-password/confirm',
      });
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { token, newPasswordHash, newSalt } = body;

    if (!token || !newPasswordHash || !newSalt) {
      await saveAttempt('', ip, false);
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (
      !/^[0-9a-f]{64}$/i.test(newPasswordHash) ||
      !/^[0-9a-f]{32}$/i.test(newSalt)
    ) {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Hashear el token recibido para buscarlo (en DB se guarda el hash, no el token raw)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { data } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('used', false)
      .limit(1);

    const resetToken = data?.[0];
    if (!resetToken) {
      await saveAttempt('', ip, false);
      await logSecurityEvent('RESET_PASSWORD_FAILED', null, {
        ip,
        userAgent,
        reason: 'invalid_token',
      });
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    if (new Date(resetToken.expires_at) < new Date()) {
      await logSecurityEvent('RESET_PASSWORD_FAILED', resetToken.user_id, {
        ip,
        userAgent,
        reason: 'token_expired',
      });
      return NextResponse.json({ error: 'Token expirado' }, { status: 401 });
    }

    // Actualizar password y salt
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newPasswordHash, salt: newSalt })
      .eq('id', resetToken.user_id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    // Marcar TODOS los tokens de reset de este usuario como usados (invalidar otros)
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('user_id', resetToken.user_id);

    // Invalidar TODAS las sesiones del usuario (atacante con JWT robado queda fuera)
    await revokeAllSessions(resetToken.user_id);

    await saveAttempt('', ip, true);
    await logSecurityEvent('RESET_PASSWORD_SUCCESS', resetToken.user_id, {
      ip,
      userAgent,
    });

    return NextResponse.json({
      message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.',
    });
  } catch (err) {
    console.error('Reset password error:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
