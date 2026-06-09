/**
 * PATCH /api/auth/change-password
 *
 * Recibe del cliente: { currentPasswordHash, newPasswordHash, newSalt }
 *   - El cliente derivó los hashes localmente con PBKDF2 + SHA256.
 *   - La contraseña NUNCA viaja al servidor.
 *
 * Aplica: verificación de JWT + blacklist, comparación constant-time,
 * revocación de todas las sesiones tras el cambio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { constantTimeEqual, fromHex } from '@/lib/crypto/utils';
import { getUserFromRequestStrict } from '@/lib/auth/get-user';
import { logSecurityEvent } from '@/lib/auth/securityLogs';
import { revokeAllSessions } from '@/lib/auth/sessionManager';
import { getClientIp, getUserAgent } from '@/lib/auth/request-info';

export async function PATCH(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  try {
    const tokenUser = await getUserFromRequestStrict(request);
    if (!tokenUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { currentPasswordHash, newPasswordHash, newSalt } = body;

    if (!currentPasswordHash || !newPasswordHash || !newSalt) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Validar formato hex (32 bytes hash = 64 hex chars; 16 bytes salt = 32 hex chars)
    if (
      !/^[0-9a-f]{64}$/i.test(currentPasswordHash) ||
      !/^[0-9a-f]{64}$/i.test(newPasswordHash) ||
      !/^[0-9a-f]{32}$/i.test(newSalt)
    ) {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from('users')
      .select('id, password_hash, salt')
      .eq('id', tokenUser.sub)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Comparar contraseña actual en tiempo constante
    const storedHash = fromHex(user.password_hash);
    const providedHash = fromHex(currentPasswordHash);
    const valid = constantTimeEqual(storedHash, providedHash);

    if (!valid) {
      await logSecurityEvent('CHANGE_PASSWORD_FAILED', user.id, { ip, userAgent });
      return NextResponse.json(
        { error: 'Contraseña actual incorrecta' },
        { status: 401 }
      );
    }

    // Actualizar password_hash y salt con los valores nuevos
    const { error: updateError } = await supabase
      .from('users')
      .update({ salt: newSalt, password_hash: newPasswordHash })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    // Invalidar TODAS las sesiones del usuario (forzar re-login)
    await revokeAllSessions(user.id);
    await logSecurityEvent('CHANGE_PASSWORD_SUCCESS', user.id, { ip, userAgent });

    return NextResponse.json({
      message: 'Contraseña actualizada correctamente. Por favor, inicia sesión de nuevo.',
    });
  } catch (err) {
    console.error('Change password error:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
