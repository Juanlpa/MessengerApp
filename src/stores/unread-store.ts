'use client';

/**
 * unread-store — Contador de mensajes no leídos por conversación (en memoria).
 *
 * Se incrementa cuando llega un mensaje de OTRO usuario en una conversación que
 * NO estás viendo, y se limpia al abrir esa conversación. Alimenta el badge de
 * la lista de chats (notificación in-app mientras la app está abierta).
 */

import { create } from 'zustand';

interface UnreadStore {
  counts: Record<string, number>;
  increment: (conversationId: string) => void;
  clear: (conversationId: string) => void;
}

export const useUnreadStore = create<UnreadStore>((set) => ({
  counts: {},
  increment: (id) =>
    set((s) => ({ counts: { ...s.counts, [id]: (s.counts[id] ?? 0) + 1 } })),
  clear: (id) =>
    set((s) => {
      if (!s.counts[id]) return s;
      const next = { ...s.counts };
      delete next[id];
      return { counts: next };
    }),
}));
