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
      <div className="w-[360px] bg-white border-r border-[#e4e6eb] flex flex-col">
        {/* Header */}
        <div className="p-4 pt-5 pb-2">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-[#050505]">Chats</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNewChat(true)}
                className="p-2 rounded-full bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#050505] transition-colors"
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
                className="p-2 rounded-full bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#050505] transition-colors"
                title="Cerrar sesión"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
            </div>
          </div>
          <div className="relative mb-2">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2">
                 <circle cx="11" cy="11" r="8"></circle>
                 <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
               </svg>
            </div>
            <input 
              type="text" 
              placeholder="Buscar en Messenger" 
              className="w-full bg-[#f0f2f5] text-[#050505] placeholder-[#65676b] rounded-full py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-[#0084ff]/50 text-[15px]"
            />
          </div>
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 overflow-y-auto px-2">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-[#65676b] text-[15px]">
              No tienes conversaciones aún.
              <br />
              Presiona el botón para iniciar una.
            </div>
          ) : (
            conversations.map(conv => (
              <Link
                key={conv.id}
                href={`/chat/${conv.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#f0f2f5] transition-colors mb-1"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white text-lg font-medium flex-shrink-0">
                  {conv.otherUser.username[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#050505] text-[15px] font-medium truncate">
                    {conv.otherUser.username}
                  </p>
                  <p className="text-[#65676b] text-[13px] truncate">
                    {conv.lastMessageAt
                      ? `Último mensaje: ${new Date(conv.lastMessageAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
                      : 'Sin mensajes'}
                  </p>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
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
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center text-[#65676b]">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 text-[#f0f2f5]">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p className="text-lg font-medium">Selecciona una conversación</p>
          <p className="text-[15px] mt-1">o inicia una nueva con el botón de nuevo chat</p>
        </div>
      </div>

      {/* Modal: Nuevo Chat */}
      {showNewChat && (
        <div className="fixed inset-0 bg-white/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl border border-[#e4e6eb] w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[20px] font-bold text-[#050505]">Nuevo Chat</h2>
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
                className="flex-1 px-4 py-2 rounded-full bg-[#f0f2f5] border border-transparent text-[#050505] placeholder-[#65676b] focus:outline-none focus:border-[#0084ff] text-[15px]"
              />
              <button
                onClick={searchUsers}
                className="px-4 py-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] text-white text-[15px] font-medium transition-colors"
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
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#f0f2f5] transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white font-medium">
                    {u.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-[#050505] text-[15px] font-medium">{u.username}</p>
                    <p className="text-[#65676b] text-[13px]">
                      {creating ? 'Generando claves DH...' : 'Click para iniciar chat cifrado'}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#0084ff]">
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
