'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Sidebar } from '@/components/layout/Sidebar';
import { useGlobalCallListener } from '@/hooks/useGlobalCallListener';
import { IncomingCallBanner } from '@/components/chat/IncomingCallBanner';
import { usePushNotifications } from '@/hooks/usePushNotifications';

function GlobalCallListenerWrapper({ userId, children }: { userId: string; children: React.ReactNode }) {
  useGlobalCallListener(userId);
  usePushNotifications();
  return <>{children}</>;
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const isLoading = useAuthStore(s => s.isLoading);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (token && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        useAuthStore.getState().setAuth(parsed, token);
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

  return (
    <GlobalCallListenerWrapper userId={user.id}>
      <div className="h-screen overflow-hidden bg-white dark:bg-gray-900 flex text-[#050505] dark:text-white">
        <IncomingCallBanner />
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </div>
      </div>
    </GlobalCallListenerWrapper>
  );
}
