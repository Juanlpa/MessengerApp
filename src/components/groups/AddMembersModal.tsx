'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useAddMember } from '@/hooks/useGroups';

interface AddMembersModalProps {
  groupId: string;
  existingMemberIds: string[];
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

interface SearchUser {
  id: string;
  username: string;
}

export function AddMembersModal({
  groupId,
  existingMemberIds,
  open,
  onClose,
  onAdded,
}: AddMembersModalProps) {
  const { token } = useAuthStore();
  const { addMember, loading, error } = useAddMember();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setAddedIds(new Set());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Búsqueda de contactos con debounce — solo busca amigos (search devuelve todos, filtramos en contacts)
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      if (!token) return;
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        // Filtrar usuarios que ya son miembros del grupo
        const filtered = (data.users ?? []).filter(
          (u: SearchUser) => !existingMemberIds.includes(u.id)
        );
        setResults(filtered);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, token, existingMemberIds]);

  async function handleAdd(userId: string) {
    const ok = await addMember(groupId, userId);
    if (ok) {
      setAddedIds((prev) => new Set([...prev, userId]));
      onAdded();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[#2c2c2e] rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Agregar miembros</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="px-5 py-4">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar contacto..."
            className="w-full bg-white/10 text-white placeholder-white/40 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="px-5 pb-5 space-y-2 max-h-64 overflow-y-auto">
          {searching && <p className="text-white/40 text-sm text-center py-4">Buscando...</p>}
          {!searching && query.length >= 2 && results.length === 0 && (
            <p className="text-white/40 text-sm text-center py-4">No se encontraron contactos</p>
          )}
          {results.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
              <div className="size-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {u.username[0]?.toUpperCase()}
              </div>
              <span className="flex-1 text-sm text-white">{u.username}</span>
              <button
                onClick={() => handleAdd(u.id)}
                disabled={loading || addedIds.has(u.id)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  addedIds.has(u.id)
                    ? 'bg-green-700 text-white cursor-default'
                    : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50'
                }`}
              >
                {addedIds.has(u.id) ? 'Agregado ✓' : 'Agregar'}
              </button>
            </div>
          ))}
          {error && <p className="text-red-400 text-xs text-center pt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}
