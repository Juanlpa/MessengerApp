import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpoint, p256dh, auth } = await request.json();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Missing subscription fields' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user.sub, endpoint, p256dh, auth },
    { onConflict: 'user_id,endpoint' }
  );

  if (error) return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpoint } = await request.json().catch(() => ({}));
  const supabase = getSupabaseAdmin();

  if (endpoint) {
    await supabase.from('push_subscriptions').delete().eq('user_id', user.sub).eq('endpoint', endpoint);
  } else {
    await supabase.from('push_subscriptions').delete().eq('user_id', user.sub);
  }

  return NextResponse.json({ ok: true });
}
