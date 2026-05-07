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

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';

export interface Conversation {
  id: string;
  otherUser: { id: string; username: string };
  encryptedSharedKey: { ciphertext: string; iv: string; mac: string };
  lastMessageAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  /** Expuesto para el sistema de push: suprimir notificaciones si muted_until > now() */
  mutedUntil: string | null;
}

export function useConversations(showArchived = false) {
  const { token } = useAuthStore();
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

/** Devuelve true si una conversación está actualmente silenciada */
export function isMuted(mutedUntil: string | null): boolean {
  if (!mutedUntil) return false;
  return new Date(mutedUntil) > new Date();
}
