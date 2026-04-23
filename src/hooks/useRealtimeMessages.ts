/**
 * useRealtimeMessages — Hook para recibir mensajes en tiempo real via Supabase Realtime
 * 
 * Reemplaza el polling de 3 segundos por una suscripción a cambios en la tabla `messages`.
 * Cuando llega un mensaje nuevo, descifra Capa 2 (at-rest) vía API y Capa 1 (E2E) localmente.
 */

'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

interface RealtimeMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  created_at: string;
}

interface UseRealtimeMessagesOptions {
  conversationId: string;
  userId: string;
  token: string;
  sharedKey: Uint8Array | null;
  onNewMessage: (message: {
    id: string;
    senderId: string;
    text: string;
    e2e: { ciphertext: string; iv: string; mac: string } | null;
    createdAt: string;
  }) => void;
  onMessageStatusUpdate?: (messageId: string, status: string) => void;
}

/**
 * Crea un cliente Supabase dedicado para Realtime (con anon key, no service role)
 */
function getRealtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing Supabase env vars');
  return createClient(url, anonKey);
}

export function useRealtimeMessages({
  conversationId,
  userId,
  token,
  sharedKey,
  onNewMessage,
  onMessageStatusUpdate,
}: UseRealtimeMessagesOptions) {
  const supabaseRef = useRef(getRealtimeClient());

  // Suscribirse a nuevos mensajes en la conversación
  useEffect(() => {
    if (!conversationId || !token || !sharedKey) return;

    const supabase = supabaseRef.current;

    // Canal para recibir mensajes nuevos (Postgres Changes)
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as RealtimeMessage;
          
          // No procesar mensajes propios (ya los mostramos al enviar)
          if (newMsg.sender_id === userId) return;

          try {
            // Obtener el mensaje completo con descifrado at-rest via API
            const res = await fetch(
              `/api/conversations/${conversationId}/messages/single?messageId=${newMsg.id}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );

            if (res.ok) {
              const data = await res.json();
              
              // Descifrar Capa 1 (E2E) localmente
              if (data.message?.e2e && sharedKey) {
                const { decryptMessageE2E } = await import('@/lib/crypto/message-crypto');
                try {
                  const text = decryptMessageE2E(data.message.e2e, sharedKey);
                  onNewMessage({
                    id: data.message.id,
                    senderId: data.message.senderId,
                    text,
                    e2e: data.message.e2e,
                    createdAt: data.message.createdAt,
                  });
                } catch {
                  onNewMessage({
                    id: data.message.id,
                    senderId: data.message.senderId,
                    text: '[Error al descifrar]',
                    e2e: null,
                    createdAt: data.message.createdAt,
                  });
                }
              }
            }

            // Marcar como 'delivered' automáticamente
            await fetch('/api/messages/status', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                messageId: newMsg.id,
                status: 'delivered',
              }),
            });
          } catch (err) {
            console.error('Error processing realtime message:', err);
          }
        }
      )
      .subscribe();

    // Canal para actualizaciones de status (delivered/read)
    const statusChannel = supabase
      .channel(`status:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_status',
        },
        (payload) => {
          const statusData = payload.new as { message_id: string; status: string; user_id: string };
          if (statusData.user_id !== userId && onMessageStatusUpdate) {
            onMessageStatusUpdate(statusData.message_id, statusData.status);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(statusChannel);
    };
  }, [conversationId, userId, token, sharedKey, onNewMessage, onMessageStatusUpdate]);
}

/**
 * Hook para marcar mensajes como leídos cuando la conversación está abierta
 */
export function useMarkAsRead(
  conversationId: string,
  userId: string,
  token: string,
  messageIds: string[]
) {
  useEffect(() => {
    if (!conversationId || !token || messageIds.length === 0) return;

    // Marcar todos los mensajes no propios como leídos
    const markRead = async () => {
      try {
        await fetch('/api/messages/status', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            conversationId,
            status: 'read',
          }),
        });
      } catch (err) {
        console.error('Error marking messages as read:', err);
      }
    };

    // Pequeño delay para evitar marcar antes de que el usuario realmente vea
    const timeout = setTimeout(markRead, 500);
    return () => clearTimeout(timeout);
  }, [conversationId, userId, token, messageIds.length]);
}
