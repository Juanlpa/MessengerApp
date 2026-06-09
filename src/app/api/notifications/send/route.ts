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

  // Reintenta fallos TRANSITORIOS (timeouts, 5xx, 429) con backoff corto.
  // 404/410 = suscripción caducada → permanente, no se reintenta (se elimina).
  const MAX_ATTEMPTS = 3;
  const sendWithRetry = async (sub: PushSubscription) => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await sendPushNotification(sub, payload);
        return; // éxito
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        // Permanente: la suscripción ya no existe → marcar para eliminar y salir
        if (status === 404 || status === 410) {
          expiredEndpoints.push(sub.endpoint);
          return;
        }
        // Transitorio: reintentar salvo que sea el último intento
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 200 * attempt)); // backoff: 200ms, 400ms
        }
      }
    }
  };

  await Promise.allSettled(
    (subscriptions as PushSubscription[]).map((sub) => sendWithRetry(sub))
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
