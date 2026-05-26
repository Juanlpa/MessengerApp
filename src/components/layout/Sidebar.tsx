'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';
import { usePresence } from '@/hooks/usePresence';
import { OnlineIndicator } from '@/components/chat/OnlineIndicator';
import { useConversations, isMuted } from '@/hooks/useConversations';
import { ConversationActions } from '@/components/chat/ConversationActions';
import { ArchivedSection } from '@/components/layout/ArchivedSection';
import { Users, Sun, Moon } from 'lucide-react';
import { useContacts, usePendingRequests } from '@/hooks/useContacts';
import { ContactsList } from '@/components/contacts/ContactsList';
import { useThemeStore } from '@/stores/theme-store';

export function Sidebar() {
  const [showNewChat, setShowNewChat] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; username: string; dh_public_key: string }>>([]);
  const [creating, setCreating] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  const theme = useThemeStore(s => s.theme);

  const { contacts } = useContacts();
  const { requests } = usePendingRequests();
  const pendingCount = requests.length;

  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const pathname = usePathname();
  const router = useRouter();
  const activeConversationId = pathname?.startsWith('/chat/')
    ? pathname.split('/chat/')[1]
    : null;

  const { conversations: allConversations, reload, archive, mute } = useConversations(false);
  const conversations = sidebarSearch.trim()
    ? allConversations.filter(c =>
        c.otherUser.username.toLowerCase().includes(sidebarSearch.toLowerCase())
      )
    : allConversations;
  const { isUserOnline } = usePresence(user?.id || '', user?.username || '');

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
      const { generateDHKeyPairAsync } = await import('@/workers/dh-worker-client');
      const { deriveSharedKey, encryptSharedKeyForStorage } = await import('@/lib/crypto/key-exchange');
      const { pbkdf2 } = await import('@/lib/crypto/pbkdf2');

      const myKeyPair = await generateDHKeyPairAsync();
      const sharedKey = deriveSharedKey(myKeyPair.privateKey, otherUser.dh_public_key);

      // Leer storageKey cacheado del store; solo recalcular el del otro usuario
      const myStorageKey = useAuthStore.getState().storageKey || pbkdf2(user.id, 'storage-salt', 1000, 32);
      const otherStorageKey = pbkdf2(otherUser.id, 'storage-salt', 1000, 32);

      const myEncrypted = encryptSharedKeyForStorage(sharedKey, myStorageKey);
      const otherEncrypted = encryptSharedKeyForStorage(sharedKey, otherStorageKey);

      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
        await reload();
        router.push(`/chat/${data.conversationId}`);
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="w-[360px] bg-white dark:bg-gray-900 border-r border-[#e4e6eb] dark:border-gray-800 flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-4 pt-5 pb-2">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-[#050505] dark:text-white">Chats</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNewChat(true)}
                className="p-2 rounded-full bg-[#f0f2f5] dark:bg-gray-800 hover:bg-[#e4e6eb] dark:hover:bg-gray-700 text-[#050505] dark:text-white transition-colors"
                title="Nuevo chat"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                onClick={() => setShowContacts(true)}
                className="p-2 rounded-full bg-[#f0f2f5] dark:bg-gray-800 hover:bg-[#e4e6eb] dark:hover:bg-gray-700 text-[#050505] dark:text-white transition-colors relative"
                title="Contactos"
              >
                <Users size={18} />
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => useThemeStore.getState().toggleTheme()}
                className="p-2 rounded-full bg-[#f0f2f5] dark:bg-gray-800 hover:bg-[#e4e6eb] dark:hover:bg-gray-700 text-[#050505] dark:text-white transition-colors"
                title="Cambiar tema"
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <Link
                href="/profile"
                className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white font-medium hover:opacity-90 transition-opacity flex-shrink-0"
                title="Mi perfil"
              >
                {user?.username[0]?.toUpperCase() || '?'}
              </Link>
              <button
                onClick={() => {
                  useAuthStore.getState().logout();
                  window.location.href = '/auth/login';
                }}
                className="p-2 rounded-full bg-[#f0f2f5] dark:bg-gray-800 hover:bg-[#e4e6eb] dark:hover:bg-gray-700 text-[#050505] dark:text-white transition-colors"
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
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              placeholder="Buscar en Messenger"
              className="w-full bg-[#f0f2f5] dark:bg-gray-800 text-[#050505] dark:text-white placeholder-[#65676b] dark:placeholder-gray-400 rounded-full py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-[#0084ff]/50 text-[15px]"
            />
          </div>
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 overflow-y-auto px-2">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-[#65676b] dark:text-gray-400 text-[15px]">
              {sidebarSearch.trim() ? (
                <>Sin resultados para &ldquo;{sidebarSearch}&rdquo;</>
              ) : (
                <>
                  No tienes conversaciones aún.
                  <br />
                  Presiona el botón para iniciar una.
                </>
              )}
            </div>
          ) : (
            conversations.map(conv => (
              <div key={conv.id} className="group/conv relative flex items-center gap-1 mb-1">
                <Link
                  href={`/chat/${conv.id}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors flex-1 min-w-0 ${
                    activeConversationId === conv.id
                      ? 'bg-[#e7f3ff] dark:bg-gray-800'
                      : 'hover:bg-[#f0f2f5] dark:hover:bg-gray-800/40'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white text-lg font-medium">
                      {conv.otherUser.username[0]?.toUpperCase() || '?'}
                    </div>
                    <OnlineIndicator isOnline={isUserOnline(conv.otherUser.id)} size="md" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[15px] font-medium truncate ${
                      activeConversationId === conv.id ? 'text-[#0084ff]' : 'text-[#050505] dark:text-white'
                    }`}>
                      {conv.otherUser.username}
                    </p>
                    <p className="text-[#65676b] dark:text-gray-400 text-[13px] truncate">
                      {conv.lastMessageAt
                        ? `Último mensaje: ${new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : 'Sin mensajes'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isMuted(conv.mutedUntil) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#65676b] dark:text-gray-400">
                        <title>Silenciado</title>
                        <line x1="2" y1="2" x2="22" y2="22" />
                        <path d="M8.56 2.9A7 7 0 0 1 19 9v4m-2 4H3v-1l2-2V9a7 7 0 0 1 .78-3.22" />
                        <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
                      </svg>
                    )}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
                      <title>Cifrado E2E</title>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                </Link>
                <ConversationActions
                  conversationId={conv.id}
                  isArchived={conv.isArchived}
                  mutedUntil={conv.mutedUntil}
                  onArchive={archive}
                  onMute={mute}
                />
              </div>
            ))
          )}
          <ArchivedSection isUserOnline={isUserOnline} />
        </div>
      </div>

      {/* Modal: Nuevo Chat */}
      {showNewChat && (
        <div className="fixed inset-0 bg-white/70 dark:bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-[#e4e6eb] dark:border-gray-800 w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[20px] font-bold text-[#050505] dark:text-white">Nuevo Chat</h2>
              <button
                onClick={() => { setShowNewChat(false); setSearchResults([]); setSearchQuery(''); }}
                className="p-1 rounded-lg hover:bg-[#f0f2f5] dark:hover:bg-gray-800 text-[#65676b] dark:text-gray-400"
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
                className="flex-1 px-4 py-2 rounded-full bg-[#f0f2f5] dark:bg-gray-800 border border-transparent text-[#050505] dark:text-white placeholder-[#65676b] dark:placeholder-gray-400 focus:outline-none focus:border-[#0084ff] text-[15px]"
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
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#f0f2f5] dark:hover:bg-gray-800 transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white font-medium">
                    {u.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-[#050505] dark:text-white text-[15px] font-medium">{u.username}</p>
                    <p className="text-[#65676b] dark:text-gray-400 text-[13px]">
                      {creating ? 'Generando claves DH...' : 'Click para iniciar chat cifrado'}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#0084ff]">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
              {searchResults.length === 0 && searchQuery.length >= 2 && (
                <p className="text-[#65676b] text-sm text-center py-4">No se encontraron usuarios</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showContacts && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 font-sans" onClick={() => setShowContacts(false)}>
          <div className="bg-[#1c1e21] rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <ContactsList onStartChat={async (userId) => {
              setShowContacts(false);
              const contact = contacts.find(c => c.friend?.id === userId);
              if (contact && contact.friend) {
                await createConversation({
                  id: contact.friend.id,
                  username: contact.friend.username,
                  dh_public_key: contact.friend.dh_public_key,
                });
              }
            }} />
          </div>
        </div>
      )}
    </>
  );
}
