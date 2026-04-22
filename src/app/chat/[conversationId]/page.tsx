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
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white font-medium flex-shrink-0">
            {otherUsername[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#050505] font-semibold text-[15px] truncate">{otherUsername}</p>
            <div className="flex items-center gap-1 text-[#65676b] text-[13px] truncate">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Cifrado E2E activo
            </div>
          </div>
          <button
            onClick={initiateCall}
            className="p-2 rounded-full hover:bg-[#f0f2f5] text-[#0084ff] transition-colors"
            title="Iniciar videollamada cifrada"
          >
            <Video className="w-6 h-6" fill="currentColor" />
          </button>
          <button
            onClick={() => loadMessages()}
            className="p-2 rounded-full hover:bg-[#f0f2f5] text-[#0084ff] transition-colors"
            title="Refrescar mensajes"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
          </button>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-white">
          {messages.length === 0 && (
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
          {messages.map((msg, idx) => {
            const isMe = msg.senderId === user?.id;
            const nextMsg = messages[idx + 1];
            const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId;

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isLastInGroup ? 'mb-3' : 'mb-0.5'}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-2 ${
                    isMe
                      ? 'bg-[#0084ff] text-white rounded-[20px] ' + (isLastInGroup ? 'rounded-br-[4px]' : '')
                      : 'bg-[#e4e6eb] text-[#050505] rounded-[20px] ' + (isLastInGroup ? 'rounded-bl-[4px]' : '')
                  }`}
                  style={{ wordBreak: 'break-word' }}
                >
                  <p className="text-[15px] leading-tight">{msg.text || '[Mensaje cifrado]'}</p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input de mensaje */}
        <div className="p-3 bg-white">
          <div className="flex items-end gap-2">
            <button className="p-2 text-[#0084ff] hover:bg-[#f0f2f5] rounded-full transition-colors flex-shrink-0">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                 <line x1="12" y1="5" x2="12" y2="19"></line>
                 <line x1="5" y1="12" x2="19" y2="12"></line>
               </svg>
            </button>
            <div className="flex-1 bg-[#f0f2f5] rounded-3xl flex items-center pr-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Aa"
                className="flex-1 px-4 py-2 bg-transparent text-[#050505] placeholder-[#65676b] focus:outline-none text-[15px]"
                disabled={sending}
              />
              <button className="p-2 text-[#0084ff] hover:bg-[#e4e6eb] rounded-full transition-colors flex-shrink-0">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                   <circle cx="12" cy="12" r="10"></circle>
                   <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                   <line x1="9" y1="9" x2="9.01" y2="9"></line>
                   <line x1="15" y1="9" x2="15.01" y2="9"></line>
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
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.6 14.08L12 11.2V6h1.5v4.5l3.8 3.5-1.1 2.08z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
