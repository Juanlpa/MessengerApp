'use client';

import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';

export interface GroupMember {
  user_id: string;
  username: string;
  role: 'admin' | 'member';
  joined_at: string;
  added_by: string | null;
}

export interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  is_group: boolean;
  members: GroupMember[];
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Obtener detalles de un grupo (miembros + roles) */
export function useGroupDetail(groupId: string | null) {
  const { token } = useAuthStore();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroup = useCallback(async () => {
    if (!token || !groupId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        headers: authHeader(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroup(data.group);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  return { group, loading, error, refetch: fetchGroup };
}

/** Crear un grupo nuevo */
export function useCreateGroup() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createGroup = useCallback(
    async (payload: {
      name: string;
      description?: string;
      member_ids: string[];
    }): Promise<{ id: string } | null> => {
      if (!token) return null;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/groups', {
          method: 'POST',
          headers: { ...authHeader(token), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); return null; }
        return data.group;
      } catch {
        setError('Error de red');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { createGroup, loading, error };
}

/** Actualizar nombre/descripción/avatar del grupo */
export function useUpdateGroup() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateGroup = useCallback(
    async (
      groupId: string,
      payload: { name?: string; description?: string; avatar_url?: string | null }
    ): Promise<boolean> => {
      if (!token) return false;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/groups/${groupId}`, {
          method: 'PATCH',
          headers: { ...authHeader(token), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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

  return { updateGroup, loading, error };
}

/** Agregar miembro al grupo */
export function useAddMember() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addMember = useCallback(
    async (groupId: string, userId: string): Promise<boolean> => {
      if (!token) return false;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/groups/${groupId}/members`, {
          method: 'POST',
          headers: { ...authHeader(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
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

  return { addMember, loading, error };
}

/** Quitar miembro del grupo (o salirse uno mismo) */
export function useRemoveMember() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeMember = useCallback(
    async (groupId: string, userId: string): Promise<boolean> => {
      if (!token) return false;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/groups/${groupId}/members/${userId}`, {
          method: 'DELETE',
          headers: authHeader(token),
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

  return { removeMember, loading, error };
}

/** Cambiar rol de un miembro */
export function useChangeRole() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeRole = useCallback(
    async (groupId: string, userId: string, role: 'admin' | 'member'): Promise<boolean> => {
      if (!token) return false;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/groups/${groupId}/members/${userId}/role`, {
          method: 'PATCH',
          headers: { ...authHeader(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
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

  return { changeRole, loading, error };
}
