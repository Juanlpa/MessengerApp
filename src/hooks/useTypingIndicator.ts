/**
 * useTypingIndicator — Hook para indicador "escribiendo..." con Supabase Realtime Broadcast
 * 
 * Envía eventos de typing por un canal Broadcast específico de la conversación.
 * No persiste en BD — es efímero, solo para participantes conectados.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

interface TypingUser {
  userId: string;
  username: string;
  timestamp: number;
}

function getRealtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing Supabase env vars');
  return createClient(url, anonKey);
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
  const supabaseRef = useRef(getRealtimeClient());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    if (!conversationId || !userId) return;

    const supabase = supabaseRef.current;
    const channel = supabase.channel(`typing:${conversationId}`);

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
      .subscribe();

    channelRef.current = channel;

    // Limpiar indicadores caducados cada segundo
    const cleanup = setInterval(() => {
      setTypingUsers(prev =>
        prev.filter(u => Date.now() - u.timestamp < TYPING_TIMEOUT)
      );
    }, 1000);

    return () => {
      clearInterval(cleanup);
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  /**
   * Llamar cuando el usuario está escribiendo (ej: en el onChange del input)
   * Throttled a 1 evento cada 2 segundos para no saturar
   */
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < 2000) return; // Throttle 2s
    lastSentRef.current = now;

    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, username },
    });

    // Auto-enviar stop_typing después del timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'stop_typing',
        payload: { userId },
      });
    }, TYPING_TIMEOUT);
  }, [userId, username]);

  /**
   * Llamar cuando el usuario envía el mensaje (para quitar el indicador inmediatamente)
   */
  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
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
  const typingText = typingUsers.length === 0
    ? null
    : typingUsers.length === 1
      ? `${typingUsers[0].username} está escribiendo...`
      : `${typingUsers.map(u => u.username).join(' y ')} están escribiendo...`;

  return { typingUsers, typingText, sendTyping, stopTyping };
}
