'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';
import { Video, Search, X } from 'lucide-react';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useRealtimeMessages, useMarkAsRead } from '@/hooks/useRealtimeMessages';

// Lazy: modales pesados fuera del bundle inicial
const CallModal = dynamic(
  () => import('@/components/chat/CallModal').then(m => ({ default: m.CallModal })),
  { ssr: false }
);
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { usePresence } from '@/hooks/usePresence';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { OnlineIndicator } from '@/components/chat/OnlineIndicator';
import { ReplyPreview } from '@/components/chat/ReplyPreview';
import { ForwardMessageModal } from '@/components/chat/ForwardMessageModal';
import { MessageTile } from '@/components/chat/MessageTile';

const MESSAGES_PER_PAGE = 30;

interface Message {
  id: string;
  senderId: string;
  text?: string;
  e2e?: { ciphertext: string; iv: string; mac: string } | null;
  createdAt: string;
  error?: string;
  status?: 'sent' | 'delivered' | 'read';
  isDeleted?: boolean;
  replyToId?: string | null;
  editedAt?: string | null;
  reactions?: { emoji: string; userIds: string[] }[];
}

export default function ConversationPage() {
  const params = useParams();
  const conversationId = params.conversationId as string;
  const { user, token } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUsername, setOtherUsername] = useState('');
  const [otherUserId, setOtherUserId] = useState('');
  const [sharedKey, setSharedKey] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Scroll infinito
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Búsqueda
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Responder mensaje
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // Editar mensaje
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  // Reenviar mensaje
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardToast, setForwardToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);

  // WebRTC para llamadas
  const {
    callState,
    localVideoRef,
    remoteVideoRef,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo,
    isAudioMuted,
    isVideoMuted,
  } = useWebRTC(conversationId, user?.id || '');

  // Presencia online/offline
  const { isUserOnline } = usePresence(user?.id || '', user?.username || '');

  // Indicador "escribiendo..."
  const { typingText, sendTyping, stopTyping } = useTypingIndicator(
    conversationId,
    user?.id || '',
    user?.username || ''
  );

  // Handler para nuevos mensajes via Realtime
  const handleNewMessage = useCallback((msg: {
    id: string;
    senderId: string;
    text: string;
    e2e: { ciphertext: string; iv: string; mac: string } | null;
    createdAt: string;
  }) => {
    setMessages(prev => {
      // Evitar duplicados
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, { ...msg, status: 'delivered' as const }];
    });
  }, []);

  // Handler para actualizaciones de estado de mensajes
  const handleStatusUpdate = useCallback((messageId: string, status: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId ? { ...m, status: status as 'sent' | 'delivered' | 'read' } : m
      )
    );
  }, []);

  const handleMessageUpdated = useCallback((
    messageId: string,
    patch: { text?: string; isDeleted?: boolean; editedAt?: string | null }
  ) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, ...patch } : m
    ));
  }, []);

  const handleReactionsUpdated = useCallback(async (messageId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, reactions: data.reactions } : m
        ));
      }
    } catch (err) {
      console.error('Error fetching reactions:', err);
    }
  }, [token]);

  // Suscripción Realtime
  useRealtimeMessages({
    conversationId,
    userId: user?.id || '',
    token: token || '',
    sharedKey,
    onNewMessage: handleNewMessage,
    onMessageStatusUpdate: handleStatusUpdate,
    onMessageUpdated: handleMessageUpdated,
    onReactionsUpdated: handleReactionsUpdated,
  });

  // Marcar mensajes como leídos cuando la conversación está abierta
  const otherMessageIds = messages
    .filter(m => m.senderId !== user?.id)
    .map(m => m.id);
  useMarkAsRead(conversationId, user?.id || '', token || '', otherMessageIds);

  // Cargar shared key y mensajes iniciales
  const initConversation = useCallback(async () => {
    if (!token || !user) return;
    setLoading(true);
    try {
      const convRes = await fetch(`/api/conversations?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!convRes.ok) throw new Error('Failed to load conversations');
      const convData = await convRes.json();
      const conv = convData.conversations.find((c: { id: string }) => c.id === conversationId);
      if (!conv) throw new Error('Conversation not found');

      setOtherUsername(conv.otherUser.username);
      setOtherUserId(conv.otherUser.id);

      // Descifrar shared key
      const { decryptSharedKeyFromStorage } = await import('@/lib/crypto/key-exchange');
      const { pbkdf2 } = await import('@/lib/crypto/pbkdf2');

      const storageKey = pbkdf2(user.id, 'storage-salt', 1000, 32);
      const decryptedSharedKey = decryptSharedKeyFromStorage(conv.encryptedSharedKey, storageKey);
      setSharedKey(decryptedSharedKey);

      // Cargar mensajes iniciales
      await loadMessages(decryptedSharedKey);
    } catch (err) {
      console.error('Init conversation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, user, conversationId]);

  const loadMessages = useCallback(async (key?: Uint8Array, cursor?: string) => {
    const currentKey = key || sharedKey;
    if (!token || !currentKey) return;

    const params = new URLSearchParams({ t: Date.now().toString(), limit: String(MESSAGES_PER_PAGE) });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`/api/conversations/${conversationId}/messages?${params}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return;
    const data = await res.json();

    const { decryptMessageE2E } = await import('@/lib/crypto/message-crypto');

    const decrypted: Message[] = (data.messages as any[]).map((msg) => {
      if (msg.isDeleted) {
        return { ...msg, text: undefined, status: 'delivered' as const };
      }
      if (!msg.e2e) {
        return { ...msg, text: '[Error: datos E2E no disponibles]', status: 'delivered' as const };
      }
      try {
        const text = decryptMessageE2E(msg.e2e, currentKey);
        return { ...msg, text, status: 'delivered' as const };
      } catch {
        return { ...msg, text: '[Error al descifrar]', status: 'delivered' as const };
      }
    });

    setHasMore(data.hasMore ?? false);

    if (cursor) {
      // Preservar posición de scroll al hacer prepend
      const container = scrollContainerRef.current;
      if (container) prevScrollHeightRef.current = container.scrollHeight;
      setMessages(prev => [...decrypted, ...prev]);
    } else {
      setMessages(decrypted);
    }
  }, [conversationId, token, sharedKey]);

  useEffect(() => {
    initConversation();
  }, [initConversation]);

  // Scroll al fondo solo en la carga inicial
  const isInitialLoad = useRef(true);
  useEffect(() => {
    if (isInitialLoad.current && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      isInitialLoad.current = false;
    }
  }, [messages]);

  // Preservar posición de scroll al hacer prepend (load more)
  useEffect(() => {
    if (prevScrollHeightRef.current > 0 && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      container.scrollTop = container.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    }
  }, [messages]);

  // Nuevo mensaje propio → scroll al fondo
  const prevLengthRef = useRef(0);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (messages.length > prevLengthRef.current && last?.senderId === user?.id) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = messages.length;
  }, [messages, user?.id]);

  // Scroll infinito: detectar cuando el usuario sube hasta arriba
  const handleScroll = useCallback(async () => {
    const container = scrollContainerRef.current;
    if (!container || !hasMore || loadingMore) return;
    if (container.scrollTop < 80) {
      const oldest = messages[0];
      if (!oldest) return;
      setLoadingMore(true);
      await loadMessages(undefined, oldest.createdAt);
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, messages, loadMessages]);

  // Búsqueda local sobre mensajes ya descifrados
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.text?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !token || !sharedKey || sending) return;
    setSending(true);
    stopTyping();

    try {
      const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');
      const e2eEncrypted = encryptMessageE2E(newMessage.trim(), sharedKey);

      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: Message = {
        id: optimisticId,
        senderId: user?.id || '',
        text: newMessage.trim(),
        createdAt: new Date().toISOString(),
        status: 'sent',
        replyToId: replyTo?.id ?? null,
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setNewMessage('');
      setReplyTo(null);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ e2eEncrypted, replyToId: replyTo?.id ?? null }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev =>
          prev.map(m => m.id === optimisticId ? { ...m, id: data.message.id, status: 'sent' as const } : m)
        );
      } else {
        setMessages(prev =>
          prev.map(m => m.id === optimisticId ? { ...m, text: `${m.text} (Error al enviar)`, error: 'send_failed' } : m)
        );
      }
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSending(false);
    }
  };

  // ── Reacciones ──────────────────────────────────────────────────────────────
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!token || !user) return;
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = m.reactions ? [...m.reactions] : [];
      const idx = reactions.findIndex(r => r.emoji === emoji);
      if (idx >= 0) {
        const uids = reactions[idx].userIds.filter(id => id !== user.id);
        if (uids.length === 0) reactions.splice(idx, 1);
        else reactions[idx] = { ...reactions[idx], userIds: uids };
      } else {
        const existing = reactions.findIndex(r => r.emoji === emoji);
        if (existing >= 0) reactions[existing].userIds.push(user.id);
        else reactions.push({ emoji, userIds: [user.id] });
      }
      return { ...m, reactions };
    }));

    await fetch(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emoji }),
    });
  }, [token, user]);

  // ── Editar mensaje ──────────────────────────────────────────────────────────
  const startEdit = useCallback((msg: Message) => {
    setEditingId(msg.id);
    setEditText(msg.text || '');
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingId || !editText.trim() || !token || !sharedKey) return;
    const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');
    const e2eEncrypted = encryptMessageE2E(editText.trim(), sharedKey);

    // Optimistic
    setMessages(prev => prev.map(m =>
      m.id === editingId ? { ...m, text: editText.trim(), editedAt: new Date().toISOString() } : m
    ));
    setEditingId(null);
    setEditText('');

    await fetch(`/api/messages/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ e2eEncrypted }),
    });
  }, [editingId, editText, token, sharedKey]);

  // ── Eliminar mensaje ────────────────────────────────────────────────────────
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!token) return;
    // Optimistic
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true, text: undefined } : m));
    await fetch(`/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }, [token]);

  // Manejar input con indicador de typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (e.target.value.trim()) {
      sendTyping();
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[#65676b] text-[15px]">Descifrando conversación...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center text-red-500">
          <p>{error}</p>
          <Link href="/chat" className="text-[#0084ff] text-[15px] mt-2 inline-block hover:underline">← Volver</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <CallModal
        callState={callState}
        otherUsername={otherUsername}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEndCall={endCall}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        isAudioMuted={isAudioMuted}
        isVideoMuted={isVideoMuted}
      />

      {/* Modal de reenviar mensaje */}
      <ForwardMessageModal
        open={forwardingMessage !== null}
        messageText={forwardingMessage?.text || ''}
        currentConversationId={conversationId}
        token={token || ''}
        userId={user?.id || ''}
        onClose={() => setForwardingMessage(null)}
        onForwarded={(targetUsername) => {
          setForwardToast(`Mensaje reenviado a ${targetUsername}`);
          setTimeout(() => setForwardToast(null), 3000);
        }}
      />

      {/* Toast de confirmación de reenvío */}
      {forwardToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-[#050505] text-white px-4 py-2 rounded-full text-[14px] shadow-lg">
          {forwardToast}
        </div>
      )}

      {/* Sidebar mínima con link de vuelta */}
      <div className="w-[360px] bg-white border-r border-[#e4e6eb] flex flex-col">
        <div className="p-4 pt-5 pb-2">
          <Link href="/chat" className="text-[#0084ff] hover:text-[#0073e6] text-[15px] flex items-center gap-1 mb-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Volver a chats
          </Link>
          <h2 className="text-[#050505] text-2xl font-bold">Chats</h2>
        </div>
      </div>

      {/* Área de chat */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Header de conversación */}
        <div className="px-4 py-3 bg-white border-b border-[#e4e6eb] flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white font-medium flex-shrink-0">
              {otherUsername[0]?.toUpperCase() || '?'}
            </div>
            <OnlineIndicator isOnline={isUserOnline(otherUserId)} size="sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#050505] font-semibold text-[15px] truncate">{otherUsername}</p>
            <div className="flex items-center gap-1 text-[13px] truncate">
              {isUserOnline(otherUserId) ? (
                <span className="text-[#31A24C]">En línea</span>
              ) : (
                <span className="text-[#65676b]">Desconectado</span>
              )}
              <span className="text-[#65676b] mx-1">·</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2" className="flex-shrink-0">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="text-[#65676b]">E2E</span>
            </div>
          </div>
          <button
            onClick={initiateCall}
            className="p-2 rounded-full hover:bg-[#f0f2f5] text-[#0084ff] transition-colors"
            title="Iniciar videollamada cifrada"
          >
            <Video className="w-6 h-6" fill="currentColor" />
          </button>
          {/* Botón búsqueda */}
          <button
            onClick={() => { setSearchOpen(o => !o); setSearchQuery(''); }}
            className="p-2 rounded-full hover:bg-[#f0f2f5] text-[#65676b] transition-colors"
            title="Buscar en la conversación"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de búsqueda */}
        {searchOpen && (
          <div className="px-4 py-2 border-b border-[#e4e6eb] flex items-center gap-2 bg-[#f0f2f5]">
            <Search className="w-4 h-4 text-[#65676b] flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar en la conversación..."
              className="flex-1 bg-transparent text-[#050505] placeholder-[#65676b] focus:outline-none text-[14px]"
            />
            {searchQuery && (
              <span className="text-[12px] text-[#65676b]">{filteredMessages.length} resultado{filteredMessages.length !== 1 ? 's' : ''}</span>
            )}
            <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="text-[#65676b] hover:text-[#050505]">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Mensajes */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-1 bg-white"
        >
          {/* Spinner de carga de más mensajes */}
          {loadingMore && (
            <div className="flex justify-center py-2">
              <div className="w-5 h-5 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loadingMore && hasMore && (
            <div className="flex justify-center py-1">
              <span className="text-[12px] text-[#65676b]">↑ Sube para ver más mensajes</span>
            </div>
          )}

          {messages.length === 0 && !loading && (
            <div className="text-center text-[#65676b] py-12">
              <div className="w-20 h-20 bg-[#f0f2f5] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <p className="text-[15px] font-medium text-[#050505]">Mensajes y llamadas cifradas de extremo a extremo</p>
              <p className="text-[13px] mt-1">Nadie fuera de este chat, ni siquiera Messenger, puede leerlos ni escucharlos.</p>
            </div>
          )}

          {(searchQuery ? filteredMessages : messages).map((msg, idx) => {
            const displayList = searchQuery ? filteredMessages : messages;
            const isMe = msg.senderId === user?.id;
            const nextMsg = displayList[idx + 1];
            const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId;
            const replySource = msg.replyToId ? messages.find(m => m.id === msg.replyToId) ?? null : null;

            return (
              <MessageTile
                key={msg.id}
                msg={msg}
                isMe={isMe}
                isLastInGroup={isLastInGroup}
                replySource={replySource}
                otherUsername={otherUsername}
                currentUserId={user?.id || ''}
                isEditing={editingId === msg.id}
                editText={editText}
                onSetReplyTo={setReplyTo}
                onForward={setForwardingMessage}
                onToggleReaction={toggleReaction}
                onStartEdit={startEdit}
                onSubmitEdit={submitEdit}
                onSetEditText={setEditText}
                onCancelEdit={() => setEditingId(null)}
                onDeleteMessage={deleteMessage}
              />
            );
          })}

          {/* Typing indicator */}
          <TypingIndicator typingText={typingText} />

          <div ref={messagesEndRef} />
        </div>

        {/* Input de mensaje */}
        <div className="p-3 bg-white border-t border-[#e4e6eb]">
          {/* Preview de respuesta */}
          {replyTo && (
            <ReplyPreview
              text={replyTo.isDeleted ? 'Mensaje eliminado' : (replyTo.text || '')}
              senderName={replyTo.senderId === user?.id ? 'Tú' : otherUsername}
              onCancel={() => setReplyTo(null)}
            />
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1 bg-[#f0f2f5] rounded-3xl flex items-center pr-2">
              <input
                type="text"
                value={newMessage}
                onChange={handleInputChange}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Aa"
                className="flex-1 px-4 py-2 bg-transparent text-[#050505] placeholder-[#65676b] focus:outline-none text-[15px]"
                disabled={sending}
              />
              <button className="p-2 text-[#0084ff] hover:bg-[#e4e6eb] rounded-full transition-colors flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </button>
            </div>
            {newMessage.trim() ? (
              <button
                onClick={sendMessage}
                disabled={sending}
                className="p-2 text-[#0084ff] hover:bg-[#f0f2f5] rounded-full transition-colors flex-shrink-0"
              >
                {sending ? (
                  <div className="w-6 h-6 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            ) : (
              <button className="p-2 text-[#0084ff] hover:bg-[#f0f2f5] rounded-full transition-colors flex-shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
