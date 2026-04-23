/**
 * usePresence — Hook para presencia online/offline con Supabase Realtime Presence
 * 
 * Trackea qué usuarios están conectados en tiempo real.
 * Usa un canal de Presence compartido para toda la aplicación.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

interface PresenceState {
  [userId: string]: {
    isOnline: boolean;
    lastSeen: string;
  };
}

function getRealtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing Supabase env vars');
  return createClient(url, anonKey);
}

export function usePresence(userId: string, username: string) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceState>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(getRealtimeClient());

  useEffect(() => {
    if (!userId) return;

    const supabase = supabaseRef.current;
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
    const heartbeat = setInterval(async () => {
      if (channelRef.current) {
        await channelRef.current.track({
          user_id: userId,
          username,
          online_at: new Date().toISOString(),
        });
      }
    }, 30_000);

    return () => {
      clearInterval(heartbeat);
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [userId, username]);

  /**
   * Verifica si un usuario específico está online
   */
  const isUserOnline = (targetUserId: string): boolean => {
    return onlineUsers[targetUserId]?.isOnline ?? false;
  };

  return { onlineUsers, isUserOnline };
}
