'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';
import { Video } from 'lucide-react';
import { useWebRTC } from '@/hooks/useWebRTC';
import { CallModal } from '@/components/chat/CallModal';

interface Message {
  id: string;
  senderId: string;
  text?: string;
  e2e?: { ciphertext: string; iv: string; mac: string } | null;
  createdAt: string;
  error?: string;
}

export default function ConversationPage() {
  const params = useParams();
  const conversationId = params.conversationId as string;
  const { user, token } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUsername, setOtherUsername] = useState('');
  const [sharedKey, setSharedKey] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Cargar shared key y descifrar mensajes
  const initConversation = useCallback(async () => {
    if (!token || !user) return;
    setLoading(true);
    try {
      // Cargar conversaciones para obtener la shared key cifrada
      const convRes = await fetch(`/api/conversations?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!convRes.ok) throw new Error('Failed to load conversations');
      const convData = await convRes.json();
      console.log('CONVERSATIONS LOADED:', convData, 'LOOKING FOR:', conversationId);
      const conv = convData.conversations.find((c: { id: string }) => c.id === conversationId);
      if (!conv) throw new Error('Conversation not found');

      setOtherUsername(conv.otherUser.username);

      // Descifrar shared key
      const { decryptSharedKeyFromStorage } = await import('@/lib/crypto/key-exchange');
      const { pbkdf2 } = await import('@/lib/crypto/pbkdf2');

      const storageKey = pbkdf2(user.id, 'storage-salt', 1000, 32);
      const decryptedSharedKey = decryptSharedKeyFromStorage(conv.encryptedSharedKey, storageKey);
      setSharedKey(decryptedSharedKey);

      // Cargar mensajes
      await loadMessages(decryptedSharedKey);
    } catch (err) {
      console.error('Init conversation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, user, conversationId]);

  const loadMessages = async (key?: Uint8Array) => {
    const currentKey = key || sharedKey;
    if (!token || !currentKey) return;

    const res = await fetch(`/api/conversations/${conversationId}/messages?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return;
    const data = await res.json();

    // Descifrar Capa 1 (E2E) de cada mensaje
    const { decryptMessageE2E } = await import('@/lib/crypto/message-crypto');

    const decrypted: Message[] = data.messages.map((msg: Message) => {
      if (!msg.e2e) {
        return { ...msg, text: '[Error: datos E2E no disponibles]' };
      }
      try {
        const text = decryptMessageE2E(msg.e2e, currentKey);
        return { ...msg, text };
      } catch (err) {
        return { ...msg, text: '[Error al descifrar]' };
      }
    });

    setMessages(decrypted);
  };

  useEffect(() => {
    initConversation();
  }, [initConversation]);

  // Polling para auto-refrescar mensajes (simulación de realtime)
  useEffect(() => {
    if (!sharedKey) return;
    
    const intervalId = setInterval(() => {
      loadMessages(sharedKey);
    }, 3000); // 3 segundos

    return () => clearInterval(intervalId);
  }, [sharedKey, token, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !token || !sharedKey || sending) return;
    setSending(true);

    try {
      // Cifrar Capa 1 (E2E)
      const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');
      const e2eEncrypted = encryptMessageE2E(newMessage.trim(), sharedKey);

      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ e2eEncrypted }),
      });

      if (res.ok) {
        setNewMessage('');
        await loadMessages();
      }
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Descifrando conversación...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center text-red-400">
          <p>{error}</p>
          <Link href="/chat" className="text-blue-400 text-sm mt-2 inline-block">← Volver</Link>
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
      
      {/* Sidebar mínima con link de vuelta */}
      <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <Link href="/chat" className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Volver a chats
          </Link>
          <h2 className="text-white font-bold">Chats</h2>
        </div>
      </div>

      {/* Área de chat */}
      <div className="flex-1 flex flex-col bg-slate-900">
        {/* Header de conversación */}
        <div className="px-6 py-4 bg-slate-800 border-b border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
            {otherUsername[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">{otherUsername}</p>
            <div className="flex items-center gap-1 text-emerald-400 text-xs">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Cifrado E2E activo (AES-256-CBC + HMAC-SHA256)
            </div>
          </div>
          <button
            onClick={initiateCall}
            className="px-3 py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/30 text-green-400 text-sm transition-colors flex items-center gap-1"
            title="Iniciar videollamada cifrada"
          >
            <Video className="w-4 h-4" />
            Llamar
          </button>
          <button
            onClick={() => loadMessages()}
            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors flex items-center gap-1"
            title="Refrescar mensajes"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
            Refrescar
          </button>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              <p className="text-lg mb-2">🔐</p>
              <p>Conversación cifrada. Envía el primer mensaje.</p>
            </div>
          )}
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                  msg.senderId === user?.id
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-slate-700 text-white rounded-bl-md'
                }`}
              >
                <p className="text-sm break-words">{msg.text || '[Mensaje cifrado]'}</p>
                <p className={`text-xs mt-1 ${
                  msg.senderId === user?.id ? 'text-blue-200' : 'text-slate-400'
                }`}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input de mensaje */}
        <div className="px-6 py-4 bg-slate-800 border-t border-slate-700">
          <div className="flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Escribe un mensaje cifrado..."
              className="flex-1 px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !newMessage.trim()}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {sending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-slate-500 text-xs mt-2 flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Los mensajes se cifran con AES-256 antes de salir de tu navegador
          </p>
        </div>
      </div>
    </>
  );
}
