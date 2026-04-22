'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();

  useEffect(() => {
    // Restaurar sesión
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-screen bg-white flex text-[#050505]">
      {children}
    </div>
  );
}
