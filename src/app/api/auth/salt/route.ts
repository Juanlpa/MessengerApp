/**
 * POST /api/auth/salt
 * 
 * Recibe: { email }
 * Retorna: { salt } — para que el cliente compute PBKDF2 con el mismo salt del registro.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: user } = await supabase
      .from('users')
      .select('salt')
      .eq('email', email.toLowerCase())
      .single();

    if (!user) {
      // No revelar si el email existe o no — retornar salt fake
      // para prevenir enumeración de usuarios
      return NextResponse.json({ salt: 'a'.repeat(32) });
    }

    return NextResponse.json({ salt: user.salt });
  } catch (err) {
    console.error('Salt error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
