import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: conversationId } = await context.params;
  const supabase = getSupabaseAdmin();

  const [{ data: participant }, { data: conv }] = await Promise.all([
    supabase
      .from('conversation_participants')
      .select('encrypted_shared_key, shared_key_iv, shared_key_mac, is_archived, archived_at, muted_until')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.sub)
      .single(),
    supabase
      .from('conversations')
      .select('id, is_group, name')
      .eq('id', conversationId)
      .single(),
  ]);

  if (!participant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 });

  const isGroup = conv?.is_group ?? false;
  let otherUser = null;

  if (!isGroup) {
    const { data: others } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user.sub)
      .limit(1);

    if (others && others.length > 0) {
      const { data: userData } = await supabase
        .from('users')
        .select('id, username')
        .eq('id', others[0].user_id)
        .single();
      otherUser = userData;
    }
  }

  return NextResponse.json({
    conversation: {
      id: conversationId,
      isGroup,
      groupName: isGroup ? (conv?.name ?? null) : null,
      otherUser,
      encryptedSharedKey: {
        ciphertext: participant.encrypted_shared_key,
        iv: participant.shared_key_iv,
        mac: participant.shared_key_mac,
      },
      isArchived: participant.is_archived ?? false,
      archivedAt:  participant.archived_at ?? null,
      mutedUntil:  participant.muted_until ?? null,
    },
  });
}
