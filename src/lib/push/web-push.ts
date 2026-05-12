import webpush from 'web-push';

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:jp155441@gmail.com';

  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys not configured');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
}

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  conversationId: string;
  type?: 'message' | 'call';
}

export async function sendPushNotification(subscription: PushSubscription, payload: PushPayload): Promise<void> {
  ensureInitialized();
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload)
  );
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || '';
}
