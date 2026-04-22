'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';

interface Conversation {
  id: string;
  otherUser: { id: string; username: string };
  encryptedSharedKey: { ciphertext: string; iv: string; mac: string };
  lastMessageAt: string | null;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; username: string; dh_public_key: string }>>([]);
  const [creating, setCreating] = useState(false);
  const { user, token } = useAuthStore();

  const loadConversations = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/conversations?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations);
    }
  }, [token]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const searchUsers = async () => {
    if (!token || searchQuery.length < 2) return;
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setSearchResults(data.users);
    }
  };

  const createConversation = async (otherUser: { id: string; username: string; dh_public_key: string }) => {
    if (!token || !user) return;
    setCreating(true);
    try {
      // Importar cripto dinámicamente (solo en cliente)
      const { generateDHKeyPair } = await import('@/lib/crypto/dh');
      const { deriveSharedKey, encryptSharedKeyForStorage } = await import('@/lib/crypto/key-exchange');
      const { pbkdf2 } = await import('@/lib/crypto/pbkdf2');

      // Generar par DH temporal para esta conversación (o usar el del registro)
      const myKeyPair = generateDHKeyPair();

      // Derivar shared key
      const sharedKey = deriveSharedKey(myKeyPair.privateKey, otherUser.dh_public_key);

      // Cifrar shared key para almacenamiento (ambos participantes)
      // Para el prototipo, usamos una clave derivada simple
      const myStorageKey = pbkdf2(user.id, 'storage-salt', 1000, 32);
      const otherStorageKey = pbkdf2(otherUser.id, 'storage-salt', 1000, 32);

      const myEncrypted = encryptSharedKeyForStorage(sharedKey, myStorageKey);
      const otherEncrypted = encryptSharedKeyForStorage(sharedKey, otherStorageKey);

      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          otherUserId: otherUser.id,
          myEncryptedSharedKey: myEncrypted,
          otherEncryptedSharedKey: otherEncrypted,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setShowNewChat(false);
        setSearchQuery('');
        setSearchResults([]);
        await loadConversations();
        // Navegar a la conversación
        window.location.href = `/chat/${data.conversationId}`;
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex w-full">
      {/* Sidebar */}
      <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-white">Chats</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNewChat(true)}
                className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                title="Nuevo chat"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                onClick={() => {
                  useAuthStore.getState().logout();
                  window.location.href = '/auth/login';
                }}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                title="Cerrar sesión"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-slate-400 text-xs">Sesión: {user?.username}</p>
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No tienes conversaciones aún.
              <br />
              Presiona + para iniciar una.
            </div>
          ) : (
            conversations.map(conv => (
              <Link
                key={conv.id}
                href={`/chat/${conv.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-700/50 transition-colors border-b border-slate-700/50"
              >
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                  {conv.otherUser.username[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {conv.otherUser.username}
                  </p>
                  <p className="text-slate-400 text-xs truncate">
                    {conv.lastMessageAt
                      ? `Último mensaje: ${new Date(conv.lastMessageAt).toLocaleTimeString()}`
                      : 'Sin mensajes'}
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
                  <title>Cifrado E2E</title>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Área principal */}
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center text-slate-500">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 text-slate-600">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p className="text-lg font-medium">Selecciona una conversación</p>
          <p className="text-sm mt-1">o inicia una nueva con el botón +</p>
        </div>
      </div>

      {/* Modal: Nuevo Chat */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Nuevo Chat</h2>
              <button
                onClick={() => { setShowNewChat(false); setSearchResults([]); setSearchQuery(''); }}
                className="p-1 rounded-lg hover:bg-slate-700 text-slate-400"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                placeholder="Buscar por username..."
                className="flex-1 px-4 py-2 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
              />
              <button
                onClick={searchUsers}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm transition-colors"
              >
                Buscar
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {searchResults.map(u => (
                <button
                  key={u.id}
                  onClick={() => createConversation(u)}
                  disabled={creating}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-700/50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-medium">
                    {u.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{u.username}</p>
                    <p className="text-slate-400 text-xs">
                      {creating ? 'Generando claves DH...' : 'Click para iniciar chat cifrado'}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
              {searchResults.length === 0 && searchQuery.length >= 2 && (
                <p className="text-slate-500 text-sm text-center py-4">No se encontraron usuarios</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
