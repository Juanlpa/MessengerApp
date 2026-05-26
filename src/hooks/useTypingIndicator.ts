/**
 * useTypingIndicator — Hook para indicador "escribiendo..." con Supabase Realtime Broadcast
 * 
 * Envía eventos de typing por un canal Broadcast específico de la conversación.
 * No persiste en BD — es efímero, solo para participantes conectados.
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

interface TypingUser {
  userId: string;
  username: string;
  timestamp: number;
}

/** Tiempo en ms después del cual se considera que dejó de escribir */
const TYPING_TIMEOUT = 3000;

export function useTypingIndicator(
  conversationId: string,
  userId: string,
  username: string
) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    if (!conversationId || !userId) return;

    // Limpiar canal previo con el mismo nombre (evita error "after subscribe" con cliente compartido)
    supabase.getChannels()
      .filter(ch => ch.topic === `realtime:typing:${conversationId}`)
      .forEach(ch => supabase.removeChannel(ch));

    subscribedRef.current = false;
    lastSentRef.current = 0;
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId: typerId, username: typerName } = payload.payload as {
          userId: string;
          username: string;
        };
        
        // No mostrar nuestro propio indicador
        if (typerId === userId) return;

        setTypingUsers(prev => {
          const filtered = prev.filter(u => u.userId !== typerId);
          return [...filtered, { userId: typerId, username: typerName, timestamp: Date.now() }];
        });
      })
      .on('broadcast', { event: 'stop_typing' }, (payload) => {
        const { userId: typerId } = payload.payload as { userId: string };
        setTypingUsers(prev => prev.filter(u => u.userId !== typerId));
      })
      .subscribe((status) => {
        subscribedRef.current = status === 'SUBSCRIBED';
      });

    channelRef.current = channel;

    // Limpiar indicadores caducados cada segundo
    const cleanup = setInterval(() => {
      setTypingUsers(prev => {
        const filtered = prev.filter(u => Date.now() - u.timestamp < TYPING_TIMEOUT);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 1000);

    return () => {
      clearInterval(cleanup);
      subscribedRef.current = false;
      channelRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  /**
   * Llamar cuando el usuario está escribiendo (ej: en el onChange del input)
   * Throttled a 1 evento cada 2 segundos para no saturar
   */
  const sendTyping = useCallback(() => {
    if (!userId || !username || !subscribedRef.current) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'stop_typing',
        payload: { userId },
      });
    }, TYPING_TIMEOUT);

    const now = Date.now();
    if (now - lastSentRef.current < 2000) return; // Throttle 2s
    lastSentRef.current = now;

    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, username },
    });

  }, [userId, username]);

  /**
   * Llamar cuando el usuario envía el mensaje (para quitar el indicador inmediatamente)
   */
  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    if (!userId || !subscribedRef.current) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'stop_typing',
      payload: { userId },
    });
  }, [userId]);

  /**
   * Texto formateado para mostrar en la UI
   * Ej: "Juan está escribiendo...", "Juan y María están escribiendo..."
   */
  const typingText = useMemo(() => {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1) return `${typingUsers[0].username} está escribiendo...`;
    return `${typingUsers.map(u => u.username).join(' y ')} están escribiendo...`;
  }, [typingUsers]);

  return { typingUsers, typingText, sendTyping, stopTyping };
}
