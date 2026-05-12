import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getVapidPublicKey } from '@/lib/push/web-push';

export async function GET() {
  const vapidPublicKey = getVapidPublicKey();
  if (!vapidPublicKey) {
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 503 });
  }
  return NextResponse.json({ vapidPublicKey });
}
