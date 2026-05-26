'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useCallStore } from '@/stores/call-store';

export function useGlobalCallListener(userId: string) {
  const { setIncomingCall, clearIncomingCall } = useCallStore();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(`call_global_${userId}`);

    channel
      .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
        // If the user is already in that conversation, the CallModal handles it directly
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        if (currentPath.includes(`/chat/${payload.conversationId}`)) return;

        setIncomingCall({
          conversationId: payload.conversationId,
          callerId: payload.callerId,
          callerName: payload.callerName,
          isAudioOnly: payload.isAudioOnly ?? false,
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
