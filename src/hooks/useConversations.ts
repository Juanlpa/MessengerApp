/**
 * useConversations — Hook para gestionar la lista de conversaciones.
 *
 * Expone:
 *   - conversations: lista de conversaciones activas (o archivadas con showArchived=true)
 *   - loading / error
 *   - reload(): refetch manual
 *   - archive(id, archived): archivar o desarchivar
 *   - mute(id, mutedUntil): silenciar hasta una fecha (null = desactivar)
 *
 * muted_until se incluye en cada conversación para que el sistema de push
 * (dominio: Jade) pueda suprimirlas cuando muted_until > now().
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase/client';

export interface Conversation {
  id: string;
  otherUser: { id: string; username: string };
  encryptedSharedKey: { ciphertext: string; iv: string; mac: string };
  lastMessageAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  /** Expuesto para el sistema de push: suprimir notificaciones si muted_until > now() */
  mutedUntil: string | null;
  /** true si es una conversación de grupo */
  isGroup?: boolean;
  /** nombre del grupo (solo si isGroup) */
  groupName?: string | null;
}

export function useConversations(showArchived = false) {
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/conversations${showArchived ? '?archived=true' : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Error al cargar conversaciones');
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch {
      setError('No se pudieron cargar las conversaciones');
    } finally {
      setLoading(false);
    }
  }, [token, showArchived]);

  useEffect(() => { load(); }, [load]);

  // Realtime: mantener la lista al día cuando llegan/salen mensajes.
  // Solo en la instancia principal (no en la de archivadas) para una sola
  // suscripción. Al detectar un mensaje nuevo:
  //   - recarga la lista (actualiza "último mensaje" y reordena)
  //   - si el mensaje es de OTRO, lo marca "entregado" aunque no tengas el chat
  //     abierto → el remitente ve ✓✓ gris en vivo (como WhatsApp)
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Recarga manual disparada por otras partes de la app (crear/salir/eliminar
  // grupo, etc.) mediante un evento global. Mantiene la lista sincronizada sin
  // acoplar componentes.
  useEffect(() => {
    const onRefresh = () => loadRef.current();
    window.addEventListener('conversations:refresh', onRefresh);
    return () => window.removeEventListener('conversations:refresh', onRefresh);
  }, []);

  // Polling de respaldo: el realtime solo escucha INSERT de mensajes. Ser añadido
  // a un grupo o a un chat nuevo es un cambio en conversation_participants (no un
  // mensaje), que el realtime con auth propia no entrega. Recargar cada 10s hace
  // que un grupo/chat nuevo aparezca solo. Solo en la lista principal.
  useEffect(() => {
    if (showArchived) return;
    const interval = setInterval(() => loadRef.current(), 10000);
    return () => clearInterval(interval);
  }, [showArchived]);

  // Set de ids de mis conversaciones (para filtrar eventos ajenos)
  const myConvIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    myConvIdsRef.current = new Set(conversations.map((c) => c.id));
  }, [conversations]);

  useEffect(() => {
    if (showArchived || !user?.id || !token) return;

    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => loadRef.current(), 400);
    };

    const channelName = `conv-list:${user.id}`;
    const existing = supabase.getChannels().find(
      (ch) => ch.topic === `realtime:${channelName}` || ch.topic === channelName
    );
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as { id: string; sender_id: string; conversation_id: string };
          const isMine = myConvIdsRef.current.has(msg.conversation_id);

          // Recargar siempre que sea una conv mía conocida, O una posible conv
          // nueva (no conocida) para detectarla. Evita recargar por mensajes de
          // conversaciones de terceros.
          if (isMine || msg.sender_id !== user.id) scheduleReload();

          // Marcar entregado SOLO mensajes recibidos de MIS conversaciones
          if (isMine && msg.sender_id !== user.id) {
            fetch('/api/messages/status', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ messageIds: [msg.id], status: 'delivered' }),
            }).catch(() => {});
          }
        })
      .subscribe();

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [showArchived, user?.id, token]);

  const archive = useCallback(
    async (conversationId: string, archived: boolean): Promise<boolean> => {
      if (!token) return false;
      const res = await fetch(`/api/conversations/${conversationId}/archive`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ archived }),
      });
      if (res.ok) await load();
      return res.ok;
    },
    [token, load]
  );

  const mute = useCallback(
    async (conversationId: string, mutedUntil: string | null): Promise<boolean> => {
      if (!token) return false;
      const res = await fetch(`/api/conversations/${conversationId}/mute`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ muted_until: mutedUntil }),
      });
      if (res.ok) await load();
      return res.ok;
    },
    [token, load]
  );

  return { conversations, loading, error, reload: load, archive, mute };
}

/**
 * Dispara una recarga de la lista de conversaciones en toda la app.
 * Úsalo tras crear/salir/eliminar un grupo o cualquier cambio de membresía.
 */
export function refreshConversations() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('conversations:refresh'));
  }
}

/** Devuelve true si una conversación está actualmente silenciada */
export function isMuted(mutedUntil: string | null): boolean {
  if (!mutedUntil) return false;
  return new Date(mutedUntil) > new Date();
}
