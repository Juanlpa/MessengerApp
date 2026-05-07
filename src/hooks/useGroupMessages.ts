/**
 * useGroupMessages — Hook para mensajería de grupos con cifrado E2E.
 *
 * Flujo de cifrado:
 *   - Capa 1 (cliente): cifra el plaintext con la clave del grupo (AES-256-CBC-HMAC)
 *   - Capa 2 (servidor): el route re-cifra el payload E2E para almacenamiento at-rest
 *
 * La clave de grupo se obtiene de GET /api/groups/[id]/key y se renueva automáticamente
 * cuando key_version cambia (rotación por cambio de membresía).
 *
 * El Realtime channel usa la misma tabla `messages` filtrada por conversation_id;
 * los mensajes propios se agregan por optimistic update al enviar.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuthStore } from '@/stores/auth-store';
import { encryptMessageE2E, decryptMessageE2E } from '@/lib/crypto/message-crypto';
import { fromHex } from '@/lib/crypto/utils';

export interface GroupMessage {
  id: string;
  senderId: string;
  text: string;
  e2e: { ciphertext: string; iv: string; mac: string } | null;
  createdAt: string;
}

function getRealtimeClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Missing Supabase env vars');
  return createClient(url, anon);
}

export function useGroupMessages(groupId: string) {
  const { user, token } = useAuthStore();

  const [messages,    setMessages]    = useState<GroupMessage[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [keyVersion,  setKeyVersion]  = useState<number | null>(null);

  const groupKeyRef  = useRef<Uint8Array | null>(null);
  const supabaseRef  = useRef(getRealtimeClient());

  // ─── Descifrado local (Capa 1) ────────────────────────────────────────────
  function decryptMsg(e2e: GroupMessage['e2e']): string {
    if (!e2e || !groupKeyRef.current) return '[Sin descifrar]';
    try {
      return decryptMessageE2E(e2e, groupKeyRef.current);
    } catch {
      return '[Error al descifrar]';
    }
  }

  // ─── Obtener clave del grupo ──────────────────────────────────────────────
  useEffect(() => {
    if (!groupId || !token) return;

    fetch(`/api/groups/${groupId}/key`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { key?: string; key_version?: number }) => {
        if (data.key) {
          groupKeyRef.current = fromHex(data.key);
          setKeyVersion(data.key_version ?? null);
        }
      })
      .catch(() => setError('No se pudo obtener la clave del grupo'));
  }, [groupId, token]);

  // ─── Cargar mensajes iniciales ────────────────────────────────────────────
  // Se re-ejecuta cuando cambia key_version (nueva clave por rotación)
  useEffect(() => {
    if (!groupId || !token || !groupKeyRef.current) return;

    setLoading(true);
    fetch(`/api/groups/${groupId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { messages?: any[] }) => {
        setMessages(
          (data.messages ?? []).map((m) => ({
            id:        m.id,
            senderId:  m.senderId,
            text:      decryptMsg(m.e2e),
            e2e:       m.e2e,
            createdAt: m.createdAt,
          }))
        );
      })
      .catch(() => setError('Error al cargar mensajes'))
      .finally(() => setLoading(false));
  }, [groupId, token, keyVersion]);

  // ─── Realtime: nuevos mensajes ────────────────────────────────────────────
  useEffect(() => {
    if (!groupId || !token || !user) return;

    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`group-messages:${groupId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'messages',
          filter: `conversation_id=eq.${groupId}`,
        },
        async (payload: any) => {
          const newMsg = payload.new as { id: string; sender_id: string };
          if (newMsg.sender_id === user.id) return; // propio — ya en lista por optimistic update

          try {
            const res = await fetch(
              `/api/groups/${groupId}/messages/single?messageId=${newMsg.id}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) return;

            const { message: msg } = await res.json();
            if (!msg) return;

            setMessages((prev) => [
              ...prev,
              {
                id:        msg.id,
                senderId:  msg.senderId,
                text:      decryptMsg(msg.e2e),
                e2e:       msg.e2e,
                createdAt: msg.createdAt,
              },
            ]);

            // Marcar como entregado
            fetch('/api/messages/status', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ messageId: newMsg.id, status: 'delivered' }),
            }).catch(() => {});
          } catch {}
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId, token, user]);

  // ─── Enviar mensaje ───────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (plaintext: string): Promise<boolean> => {
      if (!token || !groupKeyRef.current || !user || !plaintext.trim()) return false;

      const e2eEncrypted = encryptMessageE2E(plaintext.trim(), groupKeyRef.current);

      const res = await fetch(`/api/groups/${groupId}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ e2eEncrypted }),
      });

      if (!res.ok) return false;

      const { message } = await res.json();
      // Optimistic update: agregar a la lista inmediatamente
      setMessages((prev) => [
        ...prev,
        {
          id:        message.id,
          senderId:  user.id,
          text:      plaintext.trim(),
          e2e:       e2eEncrypted,
          createdAt: message.created_at,
        },
      ]);

      return true;
    },
    [groupId, token, user]
  );

  return { messages, loading, error, sendMessage, keyVersion };
}
