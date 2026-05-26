'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useSendRequest } from '@/hooks/useContacts';

interface SearchUser {
  id: string;
  username: string;
  dh_public_key: string;
}

interface SendRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}

export function SendRequestModal({ open, onClose, onSent }: SendRequestModalProps) {
  const { token } = useAuthStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const { sendRequest, loading, error } = useSendRequest();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSentIds(new Set());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Búsqueda con debounce de 300ms
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
        setResults(data.users ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, token]);

  async function handleSend(userId: string) {
    const ok = await sendRequest(userId);
    if (ok) {
      setSentIds((prev) => new Set([...prev, userId]));
      onSent?.();
    }
  }

  if (!open) return null;

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[#2c2c2e] rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Agregar contacto</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Búsqueda */}
        <div className="px-5 py-4">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre de usuario..."
            className="w-full bg-white/10 text-white placeholder-white/40 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Resultados */}
        <div className="px-5 pb-5 space-y-2 max-h-72 overflow-y-auto">
          {searching && (
            <p className="text-white/40 text-sm text-center py-4">Buscando...</p>
          )}

          {!searching && query.length >= 2 && results.length === 0 && (
            <p className="text-white/40 text-sm text-center py-4">No se encontraron usuarios</p>
          )}

          {results.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className="size-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                {u.username[0].toUpperCase()}
              </div>
              <span className="flex-1 text-sm text-white font-medium">{u.username}</span>
              <button
                onClick={() => handleSend(u.id)}
                disabled={loading || sentIds.has(u.id)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  sentIds.has(u.id)
                    ? 'bg-green-700 text-white cursor-default'
                    : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50'
                }`}
              >
                {sentIds.has(u.id) ? 'Enviado ✓' : 'Agregar'}
              </button>
            </div>
          ))}

          {/* Error */}
          {error && (
            <p className="text-red-400 text-xs text-center pt-1">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
