/**
 * GET /api/groups/[id]/messages/single?messageId=xxx
 * Devuelve un mensaje de grupo individual con Capa 2 (at-rest) descifrada.
 * Usado por el hook Realtime para obtener el mensaje completo al recibir un INSERT.
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { decryptMessageAtRest, getServerMasterKey } from '@/lib/crypto/message-crypto';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: groupId } = await context.params;
  const messageId = request.nextUrl.searchParams.get('messageId');

  if (!messageId) {
    return NextResponse.json({ error: 'messageId es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verificar membresía
  const { data: membership } = await supabase
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', groupId)
    .eq('user_id', user.sub)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No perteneces a este grupo' }, { status: 403 });
  }

  const { data: msg } = await supabase
    .from('messages')
    .select('id, sender_id, server_ciphertext, server_iv, server_mac_tag, created_at')
    .eq('id', messageId)
    .eq('conversation_id', groupId)
    .single();

  if (!msg) {
    return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });
  }

  try {
    const masterKey = getServerMasterKey();
    const e2eJson = decryptMessageAtRest(
      { ciphertext: msg.server_ciphertext, iv: msg.server_iv, mac: msg.server_mac_tag },
      masterKey
    );
    const e2e = JSON.parse(e2eJson);
    return NextResponse.json({
      message: { id: msg.id, senderId: msg.sender_id, e2e, createdAt: msg.created_at },
    });
  } catch {
    return NextResponse.json({ error: 'Error al descifrar mensaje' }, { status: 500 });
  }
}
