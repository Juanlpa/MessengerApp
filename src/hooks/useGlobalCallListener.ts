'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useCallStore } from '@/stores/call-store';

export function useGlobalCallListener(userId: string) {
  const { setIncomingCall, clearIncomingCall, setPendingGroupJoin } = useCallStore();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(`call_global_${userId}`);

    channel
      .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        const alreadyInConv = currentPath.includes(`/chat/${payload.conversationId}`);

        // Si ya está en esa conversación:
        //   - 1-a-1: el useWebRTC del chat maneja la llamada vía canal `call_${conversationId}`
        //   - Grupal: hay que disparar joinGroupCall (page.tsx escucha pendingGroupJoin)
        if (alreadyInConv) {
          if (payload.isGroupCall) {
            setPendingGroupJoin(payload.conversationId);
          }
          return;
        }

        setIncomingCall({
          conversationId: payload.conversationId,
          callerId: payload.callerId,
          callerName: payload.callerName,
          isAudioOnly: payload.isAudioOnly ?? false,
          isGroupCall: payload.isGroupCall ?? false,
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
