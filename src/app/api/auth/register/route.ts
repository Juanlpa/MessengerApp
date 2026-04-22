/**
 * POST /api/auth/register
 * 
 * Recibe: { email, username, passwordHash, salt, dhPublicKey }
 * El password NUNCA llega en texto plano — el cliente hace PBKDF2 antes de enviar.
 * Almacena el hash y crea el usuario.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, username, passwordHash, salt, dhPublicKey } = body;

    // Validar campos requeridos
    if (!email || !username || !passwordHash || !salt || !dhPublicKey) {
      return NextResponse.json(
        { error: 'Missing required fields: email, username, passwordHash, salt, dhPublicKey' },
        { status: 400 }
      );
    }

    // Validar formato de email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Validar que username sea alfanumérico
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3-30 alphanumeric characters or underscores' },
        { status: 400 }
      );
    }

    // Validar que passwordHash es hex (no plaintext)
    if (!/^[0-9a-f]{64}$/.test(passwordHash)) {
      return NextResponse.json(
        { error: 'passwordHash must be a 64-character hex string (SHA-256 output)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Verificar si email o username ya existen
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${email},username.eq.${username}`)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'Email or username already exists' },
        { status: 409 }
      );
    }

    // Insertar usuario
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

    if (error) {
      console.error('Register error:', error);
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
