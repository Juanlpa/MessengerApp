/**
 * GET  /api/groups/[id]/messages — Lista los mensajes del grupo (últimos 100)
 * POST /api/groups/[id]/messages — Envía un mensaje cifrado al grupo
 *
 * Misma arquitectura que /api/conversations/[id]/messages pero para grupos:
 *   - Capa 1 (E2E): el cliente cifra el plaintext con la clave de grupo (keyHex de /api/groups/[id]/key)
 *   - Capa 2 (at-rest): el servidor re-cifra el payload E2E con ENCRYPTION_MASTER_KEY antes de guardar
 *
 * Solo miembros del grupo pueden leer o enviar mensajes.
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { encryptMessageAtRest, decryptMessageAtRest, getServerMasterKey } from '@/lib/crypto/message-crypto';
import { GroupMessageSchema } from '@/lib/validation/groups-schemas';

type RouteContext = { params: Promise<{ id: string }> };

async function getMembership(supabase: ReturnType<typeof getSupabaseAdmin>, groupId: string, userId: string) {
  const { data } = await supabase
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', groupId)
    .eq('user_id', userId)
    .single();
  return data;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: groupId } = await context.params;
  const supabase = getSupabaseAdmin();

  if (!(await getMembership(supabase, groupId, user.sub))) {
    return NextResponse.json({ error: 'No perteneces a este grupo' }, { status: 403 });
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, sender_id, server_ciphertext, server_iv, server_mac_tag, created_at')
    .eq('conversation_id', groupId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'Error al obtener mensajes' }, { status: 500 });
  }

  const masterKey = getServerMasterKey();
  const decrypted = (messages ?? []).map((msg: any) => {
    try {
      const e2eJson = decryptMessageAtRest(
        { ciphertext: msg.server_ciphertext, iv: msg.server_iv, mac: msg.server_mac_tag },
        masterKey
      );
      const e2e = JSON.parse(e2eJson);
      return { id: msg.id, senderId: msg.sender_id, e2e, createdAt: msg.created_at };
    } catch {
      return { id: msg.id, senderId: msg.sender_id, e2e: null, createdAt: msg.created_at, error: 'Decryption failed' };
    }
  });

  return NextResponse.json({ messages: decrypted });
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: groupId } = await context.params;
  const supabase = getSupabaseAdmin();

  if (!(await getMembership(supabase, groupId, user.sub))) {
    return NextResponse.json({ error: 'No perteneces a este grupo' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = GroupMessageSchema.safeParse(body);
  if (!parsed.success) {
    const issues = (parsed.error as any).issues ?? (parsed.error as any).errors ?? [];
    return NextResponse.json({ error: issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  const { e2eEncrypted, message_type } = parsed.data;

  // Aplicar Capa 2 — cifrado at-rest
  const masterKey = getServerMasterKey();
  const serverEncrypted = encryptMessageAtRest(JSON.stringify(e2eEncrypted), masterKey);

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: groupId,
      sender_id:       user.sub,
      message_type:    message_type ?? 'text',
      // Capa 1 (referencia sin cifrar al nivel de fila)
      ciphertext: e2eEncrypted.ciphertext,
      iv:         e2eEncrypted.iv,
      mac_tag:    e2eEncrypted.mac,
      // Capa 2 (at-rest)
      server_ciphertext: serverEncrypted.ciphertext,
      server_iv:         serverEncrypted.iv,
      server_mac_tag:    serverEncrypted.mac,
    })
    .select('id, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error al enviar mensaje' }, { status: 500 });
  }

  return NextResponse.json({ message }, { status: 201 });
}
