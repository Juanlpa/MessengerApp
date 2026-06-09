/**
 * usePresence — Hook para presencia online/offline con Supabase Realtime Presence
 * 
 * Trackea qué usuarios están conectados en tiempo real.
 * Usa un canal de Presence compartido para toda la aplicación.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

interface PresenceState {
  [userId: string]: {
    isOnline: boolean;
    lastSeen: string;
  };
}

export function usePresence(userId: string, username: string) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceState>({});
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Con cliente compartido, el canal puede ya existir suscrito (React Strict Mode / re-renders).
    // Eliminarlo antes de crear uno nuevo evita el error "cannot add callbacks after subscribe()".
    supabase.getChannels()
      .filter(ch => ch.topic === 'realtime:presence:global')
      .forEach(ch => supabase.removeChannel(ch));

    const channel = supabase.channel('presence:global', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: PresenceState = {};
        
        Object.entries(state).forEach(([key, presences]) => {
          if (Array.isArray(presences) && presences.length > 0) {
            const presence = presences[0] as unknown as { user_id: string; username: string; online_at: string };
            users[key] = {
              isOnline: true,
              lastSeen: presence.online_at || new Date().toISOString(),
            };
          }
        });
        
        setOnlineUsers(users);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setOnlineUsers(prev => ({
          ...prev,
          [key]: {
            isOnline: true,
            lastSeen: new Date().toISOString(),
          },
        }));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineUsers(prev => ({
          ...prev,
          [key]: {
            isOnline: false,
            lastSeen: new Date().toISOString(),
          },
        }));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            username,
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    // Actualizar last_seen periódicamente (heartbeat cada 30s)
    let isTracking = false;
    const heartbeat = setInterval(async () => {
      if (channelRef.current && !isTracking) {
        isTracking = true;
        try {
          await channelRef.current.track({
            user_id: userId,
            username,
            online_at: new Date().toISOString(),
          });
        } finally {
          isTracking = false;
        }
      }
    }, 30_000);

    return () => {
      clearInterval(heartbeat);
      supabase.removeChannel(channel);
    };
  }, [userId, username]);

  /**
   * Verifica si un usuario específico está online
   */
  const isUserOnline = useCallback((targetUserId: string): boolean => {
    return onlineUsers[targetUserId]?.isOnline ?? false;
  }, [onlineUsers]);

  return { onlineUsers, isUserOnline };
}
