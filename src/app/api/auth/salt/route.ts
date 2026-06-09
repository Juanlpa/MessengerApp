/**
 * POST /api/auth/salt
 *
 * Devuelve la salt de un usuario para que el cliente derive PBKDF2 del password
 * y lo envíe ya hasheado al login. Sin esto, el cliente no puede hacer hash
 * con la misma salt que el servidor tiene almacenada.
 *
 * Respuesta uniforme cuando el email no existe: salt aleatoria pseudo-estable.
 * Esto evita enumeración de usuarios (el atacante no puede distinguir entre
 * "email registrado" y "email no registrado" mirando solo esta respuesta).
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Genera una salt determinística a partir del email para que el mismo email
 * inexistente devuelva siempre la misma salt (no levanta sospechas).
 * Mezclada con un secreto del servidor.
 */
function fakeSaltFor(email: string): string {
  const seed = process.env.JWT_SECRET || 'fallback-server-secret-for-fake-salt';
  return crypto
    .createHmac('sha256', seed)
    .update(`salt:${email.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from('users')
      .select('salt')
      .eq('email', email.toLowerCase())
      .single();

    // Si no existe, devolvemos una salt falsa estable para evitar enumeración
    const salt = user?.salt ?? fakeSaltFor(email);
    return NextResponse.json({ salt });
  } catch (err) {
    console.error('Salt error:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
