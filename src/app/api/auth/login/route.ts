/**
 * POST /api/auth/login
 * 
 * Recibe: { email, passwordHash }
 * El hash fue calculado en el cliente con PBKDF2(password, salt).
 * Compara con el hash almacenado y emite JWT propio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { signJWT, createJWTPayload } from '@/lib/auth/jwt';
import { constantTimeEqual, fromHex } from '@/lib/crypto/utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, passwordHash } = body;

    if (!email || !passwordHash) {
      return NextResponse.json(
        { error: 'Email and passwordHash are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Buscar usuario por email
    const { data: user } = await supabase
      .from('users')
      .select('id, email, username, password_hash, dh_public_key')
      .eq('email', email.toLowerCase())
      .single();

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Comparar hashes en tiempo constante
    const storedHash = fromHex(user.password_hash);
    const providedHash = fromHex(passwordHash);

    if (!constantTimeEqual(storedHash, providedHash)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Generar JWT propio
    const payload = createJWTPayload({
      id: user.id,
      email: user.email,
      username: user.username,
    });
    const token = signJWT(payload);

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
