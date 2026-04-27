'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';
import { Video } from 'lucide-react';
import { useWebRTC } from '@/hooks/useWebRTC';
import { CallModal } from '@/components/chat/CallModal';
import { useRealtimeMessages, useMarkAsRead } from '@/hooks/useRealtimeMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { usePresence } from '@/hooks/usePresence';
import { MessageStatus } from '@/components/chat/MessageStatus';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { OnlineIndicator } from '@/components/chat/OnlineIndicator';
import { useAttachments } from '@/hooks/useAttachments';
import { AttachmentButton } from '@/components/chat/AttachmentButton';
import { AttachmentPreview } from '@/components/chat/AttachmentPreview';
import { ImageViewer } from '@/components/chat/ImageViewer';
import { VoiceRecordButton } from '@/components/chat/VoiceRecordButton';
import { VoicePlayer } from '@/components/chat/VoicePlayer';

interface Message {
  id: string;
  senderId: string;
  text?: string;
  e2e?: { ciphertext: string; iv: string; mac: string } | null;
  createdAt: string;
  error?: string;
  status?: 'sent' | 'delivered' | 'read';
  messageType?: 'text' | 'image' | 'file' | 'voice';
  attachment?: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    attachmentType: 'image' | 'voice' | 'file';
  };
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [viewerImage, setViewerImage] = useState<{ id: string; filename: string } | null>(null);

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

  // Hook de adjuntos cifrados
  const {
    uploadAttachment,
    downloadAttachment,
    triggerDownload,
    uploadProgress,
    error: attachError,
    clearError: clearAttachError,
  } = useAttachments(conversationId, token || '', sharedKey);

  // Handler para subir archivo y enviar mensaje con referencia
  const handleFileSelected = useCallback(async (file: File) => {
    if (!token || !sharedKey) return null;

    const result = await uploadAttachment(file);
    if (!result) return null;

    // Enviar mensaje de tipo image/file con referencia al attachment
    try {
      const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');
      const content = `[${result.attachmentType}:${result.id}] ${result.filename}`;
      const e2eEncrypted = encryptMessageE2E(content, sharedKey);

      const optimisticId = `optimistic-att-${Date.now()}`;
      const optimisticMsg: Message = {
        id: optimisticId,
        senderId: user?.id || '',
        text: result.filename,
        createdAt: new Date().toISOString(),
        status: 'sent',
        messageType: result.attachmentType,
        attachment: {
          id: result.id,
          filename: result.filename,
          mimeType: result.mimeType,
          sizeBytes: result.sizeBytes,
          attachmentType: result.attachmentType,
        },
      };
      setMessages(prev => [...prev, optimisticMsg]);

      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          e2eEncrypted,
          messageType: result.attachmentType,
          attachmentId: result.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev =>
          prev.map(m =>
            m.id === optimisticId
              ? { ...m, id: data.message.id, status: 'sent' as const }
              : m
          )
        );
      }
    } catch (err) {
      console.error('Failed to send attachment message:', err);
    }

    return result;
  }, [token, sharedKey, user?.id, conversationId, uploadAttachment]);

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

  // Suscripción Realtime (reemplaza polling)
  useRealtimeMessages({
    conversationId,
    userId: user?.id || '',
    token: token || '',
    sharedKey,
    onNewMessage: handleNewMessage,
    onMessageStatusUpdate: handleStatusUpdate,
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

  const loadMessages = async (key?: Uint8Array) => {
    const currentKey = key || sharedKey;
    if (!token || !currentKey) return;

    const res = await fetch(`/api/conversations/${conversationId}/messages?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return;
    const data = await res.json();

    const { decryptMessageE2E } = await import('@/lib/crypto/message-crypto');

    const decrypted: Message[] = data.messages.map((msg: Message) => {
      if (!msg.e2e) {
        return { ...msg, text: '[Error: datos E2E no disponibles]', status: 'sent' as const };
      }
      try {
        const text = decryptMessageE2E(msg.e2e, currentKey);
        return { ...msg, text, status: 'delivered' as const };
      } catch {
        return { ...msg, text: '[Error al descifrar]', status: 'sent' as const };
      }
    });

    setMessages(decrypted);
  };

  useEffect(() => {
    initConversation();
  }, [initConversation]);

  // NO más polling — ahora es Realtime

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !token || !sharedKey || sending) return;
    setSending(true);
    stopTyping(); // Quitar indicador de typing al enviar

    try {
      const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');
      const e2eEncrypted = encryptMessageE2E(newMessage.trim(), sharedKey);

      // Agregar mensaje optimistamente
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: Message = {
        id: optimisticId,
        senderId: user?.id || '',
        text: newMessage.trim(),
        createdAt: new Date().toISOString(),
        status: 'sent',
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setNewMessage('');

      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ e2eEncrypted }),
      });

      if (res.ok) {
        const data = await res.json();
        // Reemplazar mensaje optimista con el real
        setMessages(prev =>
          prev.map(m =>
            m.id === optimisticId
              ? { ...m, id: data.message.id, status: 'sent' as const }
              : m
          )
        );
      } else {
        // Marcar como error
        setMessages(prev =>
          prev.map(m =>
            m.id === optimisticId
              ? { ...m, text: `${m.text} (Error al enviar)`, error: 'send_failed' }
              : m
          )
        );
      }
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSending(false);
    }
  };

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
            const hasAttachment = msg.attachment && msg.messageType !== 'text';

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isLastInGroup ? 'mb-3' : 'mb-0.5'}`}
              >
                <div className="flex flex-col">
                  <div
                    className={`max-w-[75%] ${
                      hasAttachment ? 'px-1.5 py-1.5' : 'px-4 py-2'
                    } ${
                      isMe
                        ? 'bg-[#0084ff] text-white rounded-[20px] ' + (isLastInGroup ? 'rounded-br-[4px]' : '')
                        : 'bg-[#e4e6eb] text-[#050505] rounded-[20px] ' + (isLastInGroup ? 'rounded-bl-[4px]' : '')
                    }`}
                    style={{ wordBreak: 'break-word' }}
                  >
                    {/* Attachment preview (image or file) */}
                    {hasAttachment && msg.attachment && msg.attachment.attachmentType !== 'voice' && (
                      <AttachmentPreview
                        attachmentId={msg.attachment.id}
                        filename={msg.attachment.filename}
                        mimeType={msg.attachment.mimeType}
                        sizeBytes={msg.attachment.sizeBytes}
                        attachmentType={msg.attachment.attachmentType}
                        isOwnMessage={isMe}
                        onDownload={triggerDownload}
                        onViewImage={(id) => setViewerImage({ id, filename: msg.attachment!.filename })}
                        onLoadThumbnail={(id) => downloadAttachment(id, true)}
                      />
                    )}
                    {/* Voice message player */}
                    {hasAttachment && msg.attachment && msg.attachment.attachmentType === 'voice' && (
                      <VoicePlayer
                        attachmentId={msg.attachment.id}
                        durationMs={msg.attachment.sizeBytes} 
                        waveformData={[]}
                        isOwnMessage={isMe}
                        onLoadAudio={(id) => downloadAttachment(id, false)}
                      />
                    )}
                    {/* Text content (only if text or no attachment) */}
                    {(!hasAttachment) && (
                      <p className="text-[15px] leading-tight">{msg.text || '[Mensaje cifrado]'}</p>
                    )}
                  </div>
                  {/* Status + timestamp en mensajes propios (último del grupo) */}
                  {isMe && isLastInGroup && (
                    <div className="flex items-center justify-end gap-1 mt-0.5 mr-1">
                      <span className="text-[11px] text-[#65676b]">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <MessageStatus
                        status={msg.status || 'sent'}
                        isOwnMessage={true}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          <TypingIndicator typingText={typingText} />

          <div ref={messagesEndRef} />
        </div>

        {/* Input de mensaje */}
        <div className="p-3 bg-white">
          <div className="flex items-end gap-2">
            <AttachmentButton
              onFileSelected={handleFileSelected}
              uploadProgress={uploadProgress}
              error={attachError}
              onClearError={clearAttachError}
              disabled={!sharedKey}
            />
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
              <VoiceRecordButton
                sharedKey={sharedKey}
                disabled={!sharedKey}
                onVoiceReady={async (result) => {
                  if (!token || !sharedKey) return;
                  // Crear blob cifrado y subir como attachment de voz
                  const hexToBytes = (hex: string) => {
                    const bytes = new Uint8Array(hex.length / 2);
                    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
                    return bytes;
                  };
                  const encBlob = new Blob([hexToBytes(result.encryptedData.ciphertext)], { type: 'application/octet-stream' });

                  const formData = new FormData();
                  formData.append('encryptedFile', encBlob, 'voice.enc');
                  formData.append('conversationId', conversationId);
                  formData.append('iv', result.encryptedData.iv);
                  formData.append('macTag', result.encryptedData.mac);
                  formData.append('mimeType', 'audio/webm');
                  formData.append('originalFilename', `voice_${Date.now()}.webm`);
                  formData.append('sizeBytes', String(result.sizeBytes));
                  formData.append('attachmentType', 'voice');
                  formData.append('durationMs', String(result.durationMs));
                  formData.append('waveformData', JSON.stringify(result.waveformData));

                  try {
                    const uploadRes = await fetch('/api/attachments/upload', {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${token}` },
                      body: formData,
                    });
                    if (!uploadRes.ok) throw new Error('Voice upload failed');
                    const uploadData = await uploadRes.json();

                    // Enviar mensaje tipo voice
                    const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');
                    const content = `[voice:${uploadData.attachmentId}] Mensaje de voz`;
                    const e2eEncrypted = encryptMessageE2E(content, sharedKey);

                    const optimisticId = `optimistic-voice-${Date.now()}`;
                    setMessages(prev => [...prev, {
                      id: optimisticId,
                      senderId: user?.id || '',
                      text: 'Mensaje de voz',
                      createdAt: new Date().toISOString(),
                      status: 'sent' as const,
                      messageType: 'voice' as const,
                      attachment: {
                        id: uploadData.attachmentId,
                        filename: 'voice.webm',
                        mimeType: 'audio/webm',
                        sizeBytes: result.sizeBytes,
                        attachmentType: 'voice' as const,
                      },
                    }]);

                    const msgRes = await fetch(`/api/conversations/${conversationId}/messages`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ e2eEncrypted, messageType: 'voice', attachmentId: uploadData.attachmentId }),
                    });
                    if (msgRes.ok) {
                      const data = await msgRes.json();
                      setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.message.id } : m));
                    }
                  } catch (err) {
                    console.error('Voice send error:', err);
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Image Viewer Modal */}
      {viewerImage && (
        <ImageViewer
          isOpen={true}
          attachmentId={viewerImage.id}
          filename={viewerImage.filename}
          onClose={() => setViewerImage(null)}
          onDownload={triggerDownload}
          onLoadFullImage={(id) => downloadAttachment(id, false)}
        />
      )}
    </>
  );
}
