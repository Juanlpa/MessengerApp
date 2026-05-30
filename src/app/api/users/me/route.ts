import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest, getUserFromRequestStrict } from '@/lib/auth/get-user';
import { revokeAllSessions } from '@/lib/auth/sessionManager';
import { logSecurityEvent } from '@/lib/auth/securityLogs';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, created_at')
    .eq('id', user.sub)
    .single();
    
  if (error || !data) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }
  
  return NextResponse.json({ user: data });
}

export async function PATCH(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const body = await request.json();
  const { username } = body;
  
  // Validación
  if (!username || typeof username !== 'string' || username.length < 3 || username.length > 30) {
    return NextResponse.json({ error: 'Username inválido (3-30 caracteres)' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return NextResponse.json({ error: 'Username solo puede contener letras, números y _' }, { status: 400 });
  }
  
  const supabase = getSupabaseAdmin();
  
  // Verificar que el username no esté tomado
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .neq('id', user.sub)
    .single();
    
  if (existing) {
    return NextResponse.json({ error: 'Username ya está en uso' }, { status: 409 });
  }
  
  const { error } = await supabase
    .from('users')
    .update({ username })
    .eq('id', user.sub);
    
  if (error) return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });

  return NextResponse.json({ success: true, username });
}

/**
 * DELETE /api/users/me — Eliminar la cuenta propia.
 *
 * Estrategia: anonimización (soft-delete efectivo). No se hace hard-delete del
 * registro porque está referenciado por mensajes, conversaciones, llamadas, etc.
 * (FKs sin CASCADE). En su lugar:
 *   - Se borran las credenciales (no se puede volver a iniciar sesión)
 *   - Se anonimiza email/username (libera esos valores únicos para reutilizar)
 *   - Se revocan TODAS las sesiones activas
 *   - Se eliminan datos personales asociados (push subscriptions, tokens de reset)
 */
export async function DELETE(request: NextRequest) {
  const user = await getUserFromRequestStrict(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const userId = user.sub;
  const anonId = userId.slice(0, 8);

  try {
    // 1. Anonimizar identidad y borrar credenciales (impide login futuro)
    const { error: updateError } = await supabase
      .from('users')
      .update({
        email: `deleted_${anonId}@deleted.local`,
        username: `deleted_${anonId}`,
        password_hash: '',
        salt: '',
        dh_public_key: '',
        private_key_encrypted: null,
        is_online: false,
      })
      .eq('id', userId);

    if (updateError) {
      return NextResponse.json({ error: 'No se pudo eliminar la cuenta' }, { status: 500 });
    }

    // 2. Revocar todas las sesiones (invalida cualquier JWT existente)
    await revokeAllSessions(userId);

    // 3. Limpiar datos personales asociados (best-effort)
    await Promise.all([
      supabase.from('push_subscriptions').delete().eq('user_id', userId),
      supabase.from('password_reset_tokens').delete().eq('user_id', userId),
    ]);

    await logSecurityEvent('ACCOUNT_DELETED', userId, {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
