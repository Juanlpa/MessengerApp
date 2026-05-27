'use client';

import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';

export function isWebPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

async function getOrRegisterSW(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  return navigator.serviceWorker.register('/sw.js');
}

async function subscribeAndSave(token: string): Promise<void> {
  const registration = await getOrRegisterSW();
  if (!registration) return;

  const vapidPublicKeyRes = await fetch('/api/notifications/vapid-public-key');
  if (!vapidPublicKeyRes.ok) return;
  const { vapidPublicKey } = await vapidPublicKeyRes.json();

  const raw = urlBase64ToUint8Array(vapidPublicKey);
  const applicationServerKey = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  const json = subscription.toJSON();
  const keys = json.keys as { p256dh: string; auth: string };

  await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    }),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const token = useAuthStore(s => s.token);

  const requestAndSubscribe = useCallback(async () => {
    if (!isWebPushSupported() || !token) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    await subscribeAndSave(token);
  }, [token]);

  useEffect(() => {
    if (!token || !isWebPushSupported()) return;

    if (Notification.permission === 'granted') {
      subscribeAndSave(token).catch(() => {});
    }
  }, [token]);

  return { requestAndSubscribe, isSupported: isWebPushSupported() };
}
