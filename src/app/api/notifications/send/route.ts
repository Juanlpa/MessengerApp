import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';
import { sendPushNotification, PushSubscription } from '@/lib/push/web-push';

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId, title, body, conversationId, type } = await request.json();
  if (!userId || !conversationId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Check muted_until for this conversation/user
  const { data: participant } = await supabase
    .from('conversation_participants')
    .select('muted_until')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .single();

  if (participant?.muted_until && new Date(participant.muted_until) > new Date()) {
    return NextResponse.json({ ok: true, skipped: 'muted' });
  }

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no_subscriptions' });
  }

  const payload = { title: title || 'Messenger', body: body || 'Nuevo mensaje', conversationId, type };
  const expiredEndpoints: string[] = [];

  await Promise.allSettled(
    (subscriptions as PushSubscription[]).map(async (sub) => {
      try {
        await sendPushNotification(sub, payload);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  if (expiredEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .in('endpoint', expiredEndpoints);
  }

  return NextResponse.json({ ok: true });
}
