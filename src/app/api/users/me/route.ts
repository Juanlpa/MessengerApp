import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

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
