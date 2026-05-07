'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase/client';

export interface ContactFriend {
  friendship_id: string;
  friend: {
    id: string;
    username: string;
    dh_public_key: string;
    created_at: string;
  } | null;
  since: string;
}

export interface PendingRequest {
  friendship_id: string;
  requester: { id: string; username: string; dh_public_key: string } | null;
  sent_at: string;
}

export interface SentRequest {
  friendship_id: string;
  addressee: { id: string; username: string } | null;
  sent_at: string;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Lista de amigos aceptados del usuario actual */
export function useContacts() {
  const { token } = useAuthStore();
  const [contacts, setContacts] = useState<ContactFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/contacts', { headers: authHeader(token) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setContacts(data.contacts ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  return { contacts, loading, error, refetch: fetchContacts };
}

/** Solicitudes de amistad recibidas pendientes */
export function usePendingRequests() {
  const { token, user } = useAuthStore();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/contacts/pending', { headers: authHeader(token) });
      const data = await res.json();
      if (res.ok) setRequests(data.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  // Suscripción Realtime: notificar cuando llega nueva solicitud al usuario actual
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`friendships:addressee:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friendships',
          filter: `addressee_id=eq.${user.id}`,
        },
        () => { fetchPending(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchPending]);

  return { requests, loading, refetch: fetchPending };
}

/** Solicitudes enviadas pendientes */
export function useSentRequests() {
  const { token } = useAuthStore();
  const [requests, setRequests] = useState<SentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSent = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/contacts/sent', { headers: authHeader(token) });
      const data = await res.json();
      if (res.ok) setRequests(data.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchSent(); }, [fetchSent]);

  return { requests, loading, refetch: fetchSent };
}

/** Mutation: enviar solicitud de amistad */
export function useSendRequest() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendRequest = useCallback(
    async (addressee_id: string): Promise<boolean> => {
      if (!token) return false;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/contacts/request', {
          method: 'POST',
          headers: { ...authHeader(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ addressee_id }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); return false; }
        return true;
      } catch {
        setError('Error de red');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { sendRequest, loading, error };
}

/** Mutation: aceptar o rechazar solicitud */
export function useRespondRequest() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = useCallback(
    async (friendshipId: string, status: 'accepted' | 'rejected'): Promise<boolean> => {
      if (!token) return false;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/contacts/${friendshipId}/respond`, {
          method: 'PATCH',
          headers: { ...authHeader(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); return false; }
        return true;
      } catch {
        setError('Error de red');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { respond, loading, error };
}

/** Mutation: eliminar contacto */
export function useDeleteContact() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const deleteContact = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      if (!token) return false;
      setLoading(true);
      try {
        const res = await fetch(`/api/contacts/${friendshipId}`, {
          method: 'DELETE',
          headers: authHeader(token),
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { deleteContact, loading };
}
