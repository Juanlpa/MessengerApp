'use client';

import { useEffect, useRef, useCallback } from 'react';
import { decryptMessageE2E } from '@/lib/crypto/message-crypto';
import { supabase } from '@/lib/supabase/client';

export interface BroadcastPayload {
  id: string;
  senderId: string;
  e2e: { ciphertext: string; iv: string; mac: string };
  createdAt: string;
  messageType?: string;
  attachment?: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    attachmentType: 'image' | 'voice' | 'file';
    durationMs?: number | null;
    waveformData?: number[];
  } | null;
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
    replyToId?: string | null;
    messageType?: string;
    attachment?: {
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      attachmentType: 'image' | 'voice' | 'file';
      durationMs?: number | null;
      waveformData?: number[];
    } | null;
  }) => void;
  onMessageStatusUpdate?: (messageId: string, status: string) => void;
  onMessageUpdated?: (messageId: string, patch: { text?: string; isDeleted?: boolean; editedAt?: string | null }) => void;
  onReactionsUpdated?: (messageId: string) => void;
}

export function useRealtimeMessages({
  conversationId,
  userId,
  token,
  sharedKey,
  onNewMessage,
  onMessageStatusUpdate,
  onMessageUpdated,
  onReactionsUpdated,
}: UseRealtimeMessagesOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const deliveryQueueRef = useRef<string[]>([]);
  const deliveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs para callbacks — evita recrear el canal cuando cambian las funciones
  const sharedKeyRef = useRef(sharedKey);
  sharedKeyRef.current = sharedKey;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;
  const onMessageStatusUpdateRef = useRef(onMessageStatusUpdate);
  onMessageStatusUpdateRef.current = onMessageStatusUpdate;
  const onMessageUpdatedRef = useRef(onMessageUpdated);
  onMessageUpdatedRef.current = onMessageUpdated;
  const onReactionsUpdatedRef = useRef(onReactionsUpdated);
  onReactionsUpdatedRef.current = onReactionsUpdated;

  useEffect(() => {
    if (!conversationId || !token) return;

    // Limpiar canales previos con el mismo nombre
    const topic = `realtime:conv:${conversationId}`;
    supabase.getChannels()
      .filter(ch => ch.topic === topic || ch.topic.includes(conversationId))
      .forEach(ch => supabase.removeChannel(ch));

    // Canal único consolidador 'conv:${conversationId}'
    const channel = supabase
      .channel(`conv:${conversationId}`)
      // 1. Escuchar Broadcast para nuevos mensajes (E2E)
      .on('broadcast', { event: 'new_message' }, ({ payload }: { payload: BroadcastPayload }) => {
        if (payload.senderId === userId) return;

        const key = sharedKeyRef.current;
        if (!key || !payload.e2e) return;

        try {
          const text = decryptMessageE2E(payload.e2e, key);
          onNewMessageRef.current({
            id: payload.id,
            senderId: payload.senderId,
            text,
            e2e: payload.e2e,
            createdAt: payload.createdAt,
            messageType: payload.messageType,
            attachment: payload.attachment ?? null,
          });
        } catch {
          onNewMessageRef.current({
            id: payload.id,
            senderId: payload.senderId,
            text: '[Error al descifrar]',
            e2e: null,
            createdAt: payload.createdAt,
          });
        }

        // Batch delivery marks — coalesce within 200ms window
        deliveryQueueRef.current.push(payload.id);
        if (!deliveryTimerRef.current) {
          deliveryTimerRef.current = setTimeout(() => {
            const ids = deliveryQueueRef.current.splice(0);
            deliveryTimerRef.current = null;
            if (ids.length === 0) return;
            fetch('/api/messages/status', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
              body: JSON.stringify({ messageIds: ids, status: 'delivered' }),
            }).catch(() => {});
          }, 200);
        }
      })
      // 2. Escuchar UPDATEs de mensajes (ediciones y eliminaciones soft-delete)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const updated = payload.new as {
            id: string;
            is_deleted: boolean;
            edited_at: string | null;
            server_ciphertext: string;
            server_iv: string;
            server_mac_tag: string;
          };

          if (!onMessageUpdatedRef.current) return;

          if (updated.is_deleted) {
            onMessageUpdatedRef.current(updated.id, { isDeleted: true });
            return;
          }

          // Edición: re-descifrar via API
          try {
            const res = await fetch(
              `/api/conversations/${conversationId}/messages/single?messageId=${updated.id}`,
              { headers: { Authorization: `Bearer ${tokenRef.current}` } }
            );
            if (res.ok && sharedKeyRef.current) {
              const data = await res.json();
              if (data.message?.e2e) {
                try {
                  const text = decryptMessageE2E(data.message.e2e, sharedKeyRef.current);
                  onMessageUpdatedRef.current(updated.id, { text, editedAt: updated.edited_at });
                } catch {
                  onMessageUpdatedRef.current(updated.id, { text: '[Error al descifrar]', editedAt: updated.edited_at });
                }
              }
            }
          } catch (err) {
            console.error('Error processing message update:', err);
          }
        }
      )
      // 3. Escuchar actualizaciones de status (delivered/read)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_status' },
        (payload) => {
          const statusData = payload.new as { message_id: string; status: string; user_id: string };
          if (statusData.user_id !== userId && onMessageStatusUpdateRef.current) {
            onMessageStatusUpdateRef.current(statusData.message_id, statusData.status);
          }
        }
      )
      // 4. Escuchar reacciones
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const row = (payload.new || payload.old) as { message_id: string };
          if (row?.message_id && onReactionsUpdatedRef.current) {
            onReactionsUpdatedRef.current(row.message_id);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (deliveryTimerRef.current) {
        clearTimeout(deliveryTimerRef.current);
        deliveryTimerRef.current = null;
      }
      deliveryQueueRef.current = [];
    };
  }, [conversationId, userId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const broadcastMessage = useCallback((payload: BroadcastPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload });
  }, []);

  return { broadcastMessage };
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

    const markRead = async () => {
      try {
        await fetch('/api/messages/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ conversationId, status: 'read' }),
        });
      } catch (err) {
        console.error('Error marking messages as read:', err);
      }
    };

    const timeout = setTimeout(markRead, 500);
    return () => clearTimeout(timeout);
  }, [conversationId, userId, token, messageIds.length]);
}
