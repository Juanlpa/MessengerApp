/**
 * PATCH  /api/messages/[id] — Editar un mensaje propio (re-cifra E2E + at-rest)
 * DELETE /api/messages/[id] — Eliminar un mensaje propio (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { encryptMessageAtRest, getServerMasterKey } from '@/lib/crypto/message-crypto';

type RouteContext = { params: Promise<{ id: string }> };

/** Verifica que el mensaje existe, pertenece al usuario y no está eliminado */
async function getOwnMessage(messageId: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('messages')
    .select('id, sender_id, is_deleted')
    .eq('id', messageId)
    .single();
  if (!data) return null;
  if (data.sender_id !== userId) return null;
  if (data.is_deleted) return null;
  return data;
}

// ── EDITAR ───────────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: messageId } = await context.params;

  const msg = await getOwnMessage(messageId, user.sub);
  if (!msg) return NextResponse.json({ error: 'Message not found or not yours' }, { status: 404 });

  let e2eEncrypted: { ciphertext: string; iv: string; mac: string };
  try {
    const body = await request.json();
    e2eEncrypted = body.e2eEncrypted;
    if (!e2eEncrypted?.ciphertext || !e2eEncrypted?.iv || !e2eEncrypted?.mac) {
      return NextResponse.json({ error: 'Missing E2E encrypted data' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Re-aplicar Capa 2 con el nuevo contenido
  const masterKey = getServerMasterKey();
  const serverEncrypted = encryptMessageAtRest(JSON.stringify(e2eEncrypted), masterKey);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('messages')
    .update({
      ciphertext: e2eEncrypted.ciphertext,
      iv: e2eEncrypted.iv,
      mac_tag: e2eEncrypted.mac,
      server_ciphertext: serverEncrypted.ciphertext,
      server_iv: serverEncrypted.iv,
      server_mac_tag: serverEncrypted.mac,
      edited_at: new Date().toISOString(),
    })
    .eq('id', messageId);

  if (error) {
    console.error('Edit message error:', error);
    return NextResponse.json({ error: 'Failed to edit message' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ── ELIMINAR ─────────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: messageId } = await context.params;

  const msg = await getOwnMessage(messageId, user.sub);
  if (!msg) return NextResponse.json({ error: 'Message not found or not yours' }, { status: 404 });

  const supabase = getSupabaseAdmin();

  // Soft delete: vaciamos los ciphertexts y marcamos is_deleted = true
  const { error } = await supabase
    .from('messages')
    .update({
      is_deleted: true,
      ciphertext: '',
      iv: '',
      mac_tag: '',
      server_ciphertext: '',
      server_iv: '',
      server_mac_tag: '',
    })
    .eq('id', messageId);

  if (error) {
    console.error('Delete message error:', error);
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
