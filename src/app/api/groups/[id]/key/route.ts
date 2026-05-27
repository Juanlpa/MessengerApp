/**
 * GET /api/groups/[id]/key
 * Entrega la clave simétrica activa del grupo al cliente autenticado.
 *
 * La clave se almacena cifrada en el servidor (Capa 2: at-rest).
 * Este endpoint la descifra con ENCRYPTION_MASTER_KEY y la devuelve en hex
 * para que el cliente la use en el cifrado/descifrado de mensajes (Capa 1).
 *
 * Seguridad:
 *   - Solo miembros del grupo pueden obtener la clave.
 *   - La clave se rota automáticamente al agregar/quitar miembros.
 *   - El transporte está protegido por TLS (HTTPS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { getActiveGroupKey } from '@/lib/groups/key-rotation';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: groupId } = await context.params;
  const supabase = getSupabaseAdmin();

  // Verificar que el solicitante es miembro activo del grupo
  const { data: membership } = await supabase
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', groupId)
    .eq('user_id', user.sub)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const keyData = await getActiveGroupKey(groupId);
  if (!keyData) {
    return NextResponse.json({ error: 'Clave de grupo no disponible' }, { status: 404 });
  }

  return NextResponse.json({
    key: keyData.keyHex,
    key_version: keyData.keyVersion,
  });
}
