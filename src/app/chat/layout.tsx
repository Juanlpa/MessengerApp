'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Sidebar } from '@/components/layout/Sidebar';
import { useGlobalCallListener } from '@/hooks/useGlobalCallListener';
import { IncomingCallBanner } from '@/components/chat/IncomingCallBanner';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { NotificationPrompt } from '@/components/chat/NotificationPrompt';

function GlobalCallListenerWrapper({ userId, children }: { userId: string; children: React.ReactNode }) {
  useGlobalCallListener(userId);
  usePushNotifications();

  // Cargar credenciales TURN dinámicas (Metered) una vez al entrar a la app,
  // para que estén listas antes de cualquier llamada. Si no hay config, usa
  // el fallback (STUN + openrelay) sin romper nada.
  useEffect(() => {
    import('@/lib/webrtc/ice-servers').then(({ loadTurnCredentials }) => {
      loadTurnCredentials();
    }).catch(() => {});
  }, []);

  // Al conectarse a la app, marcar como "entregados" todos los mensajes
  // recibidos mientras estaba offline (aunque no abra cada chat) — así el
  // remitente ve ✓✓ en tiempo real, como WhatsApp.
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    fetch('/api/messages/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deliverAllPending: true }),
    }).catch(() => {});
  }, [userId]);

  return <>{children}</>;
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore(s => s.user);
  const isLoading = useAuthStore(s => s.isLoading);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (token && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        // Calcular storageKey junto con setAuth — evita estado intermedio
        // donde storageKey=null causaba que page.tsx recalculara PBKDF2 en
        // cada apertura de chat (al entrar directo a /chat/[id] sin pasar por login)
        import('@/lib/crypto/pbkdf2').then(({ pbkdf2 }) => {
          const storageKey = pbkdf2(parsed.id, 'storage-salt', 1000, 32);
          useAuthStore.getState().setAuth(parsed, token);
          useAuthStore.getState().setKeys(new Uint8Array(0), new Uint8Array(0), storageKey);
        }).catch(() => {
          // Si falla la importación, al menos restaurar la sesión
          useAuthStore.getState().setAuth(parsed, token);
        });
      } catch {
        useAuthStore.getState().logout();
        router.push('/auth/login');
      }
    } else {
      useAuthStore.getState().setLoading(false);
      router.push('/auth/login');
    }
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const isLanding = pathname === '/chat';

  return (
    <GlobalCallListenerWrapper userId={user.id}>
      <div className="h-screen overflow-hidden bg-white dark:bg-gray-900 flex text-[#050505] dark:text-white">
        <IncomingCallBanner />
        <NotificationPrompt />
        <div className={`${isLanding ? 'block w-full md:w-[360px]' : 'hidden md:block w-[360px]'} h-full flex-shrink-0`}>
          <Sidebar />
        </div>
        <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isLanding ? 'hidden md:flex' : 'flex'}`}>
          {children}
        </div>
      </div>
    </GlobalCallListenerWrapper>
  );
}
