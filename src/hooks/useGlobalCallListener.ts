'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useCallStore } from '@/stores/call-store';

function getRealtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export function useGlobalCallListener(userId: string) {
  const supabaseRef = useRef(getRealtimeClient());
  const { setIncomingCall, clearIncomingCall } = useCallStore();

  useEffect(() => {
    if (!userId) return;

    const supabase = supabaseRef.current;
    const channel = supabase.channel(`call_global_${userId}`);

    channel
      .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
        // Si el usuario ya está en esa conversación, el CallModal la maneja directamente
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        if (currentPath.includes(payload.conversationId)) return;

        setIncomingCall({
          conversationId: payload.conversationId,
          callerId: payload.callerId,
          callerName: payload.callerName,
        });
      })
      .on('broadcast', { event: 'call-cancelled' }, () => {
        clearIncomingCall();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, setIncomingCall, clearIncomingCall]);
}
