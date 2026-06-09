'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useCallStore } from '@/stores/call-store';
import Link from 'next/link';
import { Video, Phone, Users, Search, X } from 'lucide-react';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useRealtimeMessages, useMarkAsRead, type BroadcastPayload, type ReactionBroadcastPayload } from '@/hooks/useRealtimeMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { usePresence } from '@/hooks/usePresence';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { OnlineIndicator } from '@/components/chat/OnlineIndicator';
import { ReplyPreview } from '@/components/chat/ReplyPreview';
import { ForwardMessageModal } from '@/components/chat/ForwardMessageModal';
import { MessageTile } from '@/components/chat/MessageTile';

// Hooks de llamadas y adjuntos (develop)
import { useAttachments } from '@/hooks/useAttachments';
import { useGroupCall } from '@/hooks/useGroupCall';
import { useVideoFilter, type FilterId, type BackgroundId } from '@/hooks/useVideoFilter';
import { useChatCustomization } from '@/hooks/useChatCustomization';
import { ChatCustomizationMenu } from '@/components/chat/ChatCustomizationMenu';
import { useThemeStore } from '@/stores/theme-store';
import { useGroupDetail } from '@/hooks/useGroups';
import { GroupSettings } from '@/components/groups/GroupSettings';
import { refreshConversations } from '@/hooks/useConversations';
import { displayUsername, isDeletedUser } from '@/lib/utils/user-display';
import { useUnreadStore } from '@/stores/unread-store';
import { useContacts } from '@/hooks/useContacts';

// Componentes de adjuntos y voz (develop)
import { AttachmentButton } from '@/components/chat/AttachmentButton';
import { VoiceRecordButton } from '@/components/chat/VoiceRecordButton';
import { ImageViewer } from '@/components/chat/ImageViewer';

// Lazy: modales pesados fuera del bundle inicial
const CallModal = dynamic(
  () => import('@/components/chat/CallModal').then(m => ({ default: m.CallModal })),
  { ssr: false }
);

// GroupCallModal para videollamadas grupales
const GroupCallModal = dynamic(
  () => import('@/components/calls/GroupCallModal').then(m => ({ default: m.GroupCallModal })),
  { ssr: false }
);

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
  replyToSnapshot?: {
    id: string;
    senderId: string;
    createdAt: string;
    text?: string;
    e2e?: { ciphertext: string; iv: string; mac: string } | null;
    isDeleted?: boolean;
  } | null;
  editedAt?: string | null;
  reactions?: { emoji: string; userIds: string[] }[];
  messageType?: 'text' | 'voice' | 'image' | 'file';
  attachment?: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    attachmentType: 'image' | 'voice' | 'file';
    durationMs?: number | null;
    waveformData?: number[];
  } | null;
}

export default function ConversationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationId = params.conversationId as string;
  const shouldAutoJoinGroup = searchParams?.get('joinGroupCall') === '1';

  // Al abrir/cambiar de chat, limpiar su contador de no leídos (badge in-app)
  useEffect(() => {
    if (conversationId) useUnreadStore.getState().clear(conversationId);
  }, [conversationId]);
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const cachedStorageKey = useAuthStore(s => s.storageKey);
  // Lista de amigos — para avisar si quien llama NO es un contacto registrado
  const { contacts: myContacts, loading: contactsLoading } = useContacts();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUsername, setOtherUsername] = useState('');
  const [otherUserId, setOtherUserId] = useState('');
  // El otro participante es una cuenta eliminada → bloquear interacción (1-a-1)
  const [isOtherDeleted, setIsOtherDeleted] = useState(false);
  const [isGroup, setIsGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [sharedKey, setSharedKey] = useState<Uint8Array | null>(null);
  const sharedKeyRef = useRef<Uint8Array | null>(null);
  useEffect(() => {
    sharedKeyRef.current = sharedKey;
  }, [sharedKey]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Modo "invitado a llamada": el usuario fue invitado a una llamada grupal de
  // una conversación de la que NO es miembro. Se le permite unirse solo a la
  // llamada (sin acceso al chat/mensajes).
  const [callOnlyMode, setCallOnlyMode] = useState(false);

  // Scroll infinito
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Búsqueda
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Responder mensaje
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // Grabación de voz activa: oculta el input de texto para dar ancho a la barra de voz
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

  // Editar mensaje
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Reenviar mensaje
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardToast, setForwardToast] = useState<string | null>(null);

  // Image Viewer
  const [viewerState, setViewerState] = useState<{
    images: Array<{ id: string; filename: string }>;
    index: number;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isInitialLoad = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scroll = () => {
      container.scrollTo({ top: container.scrollHeight, behavior });
    };

    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
  }, []);

  // Ref estable para broadcastMessage (desacoplamiento de realtime)
  const broadcastMessageRef = useRef<((payload: BroadcastPayload) => void)>(() => {});
  const broadcastReactionRef = useRef<((payload: ReactionBroadcastPayload) => void)>(() => {});

  // Filtros de video
  const {
    activeFilter,
    activeBackground,
    setFilter,
    setBackground,
    processStream,
    stopPipeline,
  } = useVideoFilter();

  // Llamadas grupales
  const {
    callState: groupCallState,
    participants: groupParticipants,
    localVideoRef: groupLocalVideoRef,
    isAudioMuted: groupAudioMuted,
    isVideoMuted: groupVideoMuted,
    joinCall: joinGroupCall,
    leaveCall: leaveGroupCall,
    toggleAudio: toggleGroupAudio,
    toggleVideo: toggleGroupVideo,
    refreshVideoProcessing: refreshGroupVideoProcessing,
  } = useGroupCall(conversationId, user?.id || '', user?.username || '', processStream);

  // WebRTC para llamadas 1-a-1
  const {
    callState,
    localVideoRef,
    remoteVideoRef,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    inviteToCall,
    endOneToOneCall,
    forceIdle,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    isRemoteScreenSharing,
    isAudioOnly,
    isE2EMedia,
    refreshVideoProcessing,
  } = useWebRTC(
    conversationId,
    user?.id || '',
    otherUserId || undefined,
    user?.username || undefined,
    token || undefined,
    sharedKey,
    !isGroup,
    joinGroupCall,
    processStream
  );

  // Personalización visual por chat (color de burbuja + fondo)
  const {
    bubbleColor,
    background: chatBackground,
    setBubbleColor,
    setBackground: setChatBackground,
  } = useChatCustomization(conversationId);
  const currentTheme = useThemeStore(s => s.theme);
  const chatBgColor = currentTheme === 'dark' ? chatBackground.dark : chatBackground.light;

  // Ajustes del grupo (editar nombre/avatar, miembros, roles) — solo si es grupo
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const { group: groupDetail, refetch: refetchGroup } = useGroupDetail(isGroup ? conversationId : null);

  // Mapa userId → username de los miembros del grupo (para mostrar el remitente
  // de cada mensaje en chats grupales)
  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    groupDetail?.members?.forEach((m) => map.set(m.user_id, m.username));
    return map;
  }, [groupDetail]);

  // Presencia online/offline
  const { isUserOnline } = usePresence(user?.id || '', user?.username || '');

  // Indicador "escribiendo..."
  const { typingText, sendTyping, stopTyping } = useTypingIndicator(
    conversationId,
    user?.id || '',
    user?.username || ''
  );

  // Hook de adjuntos
  const {
    uploadAttachment,
    downloadAttachment,
    triggerDownload,
    uploadProgress,
    error: attachError,
    clearError: clearAttachError,
  } = useAttachments(conversationId, token || '', sharedKey);

  // Limpiar filtros de video al colgar o al desmontar el componente
  useEffect(() => {
    const isCallActive = callState === 'connected' || callState === 'calling' || callState === 'receiving' || groupCallState === 'connected';
    if (!isCallActive) {
      stopPipeline();
    }
    return () => {
      stopPipeline();
    };
  }, [callState, groupCallState, stopPipeline]);

  // Invitar a tercer participante (convierte 1-a-1 en grupal)
  // Orden: 1) avisar upgrade y notificar a Charlie  2) cerrar PC 1-a-1 (libera cámara)
  //        3) unirse al canal mesh con cámara recién liberada
  // Esto minimiza el gap visual entre que se cierra CallModal y se abre GroupCallModal.
  const handleAddParticipant = useCallback(async (contactId: string, contactName: string) => {
    try {
      // 1. Enviar upgrade-to-group a Bob y notificar a Charlie (con flag isGroupCall)
      await inviteToCall(contactId, contactName);
      // 2. Cerrar PC 1-a-1 — devuelve un CLON de la cámara para reutilizarlo
      const reusableStream = await endOneToOneCall();
      // 3. Unirse al canal mesh reutilizando la cámara (evita stop+getUserMedia
      //    inmediato que congela el track en Chrome)
      await joinGroupCall(reusableStream ?? undefined);
    } catch (err) {
      console.error('Failed to add participant:', err);
      alert('No se pudo agregar el participante. Inténtalo de nuevo.');
    }
  }, [inviteToCall, endOneToOneCall, joinGroupCall]);

  // Cambio de filtro/fondo: actualiza el estado Y re-procesa el video de la
  // llamada activa (replaceTrack). setFilter/setBackground actualizan el ref
  // síncronamente, así que el refresh ya ve el valor nuevo.
  const handleFilterChange = useCallback((f: FilterId) => {
    setFilter(f);
    if (callState === 'connected' || callState === 'calling') refreshVideoProcessing();
    if (groupCallState === 'connected') refreshGroupVideoProcessing();
  }, [setFilter, callState, groupCallState, refreshVideoProcessing, refreshGroupVideoProcessing]);

  const handleBackgroundChange = useCallback((bg: BackgroundId) => {
    setBackground(bg);
    if (callState === 'connected' || callState === 'calling') refreshVideoProcessing();
    if (groupCallState === 'connected') refreshGroupVideoProcessing();
  }, [setBackground, callState, groupCallState, refreshVideoProcessing, refreshGroupVideoProcessing]);

  // Handlers para visor de imágenes y adjuntos
  const handleViewImage = useCallback((id: string) => {
    const list = messages
      .filter(m => m.attachment?.attachmentType === 'image')
      .map(m => ({ id: m.attachment!.id, filename: m.attachment!.filename }));
    const idx = list.findIndex(img => img.id === id);
    if (idx >= 0) {
      setViewerState({ images: list, index: idx });
    }
  }, [messages]);

  const handleLoadThumbnail = useCallback(async (id: string) => {
    return downloadAttachment(id, true);
  }, [downloadAttachment]);

  const handleLoadAudio = useCallback(async (id: string) => {
    return downloadAttachment(id, false);
  }, [downloadAttachment]);

  // Handler para nuevos mensajes via Realtime
  const handleNewMessage = useCallback((msg: {
    id: string;
    senderId: string;
    text: string;
    e2e: { ciphertext: string; iv: string; mac: string } | null;
    createdAt: string;
    replyToId?: string | null;
    replyToSnapshot?: {
      id: string;
      senderId: string;
      createdAt: string;
      text?: string;
      isDeleted?: boolean;
    } | null;
    messageType?: string;
    attachment?: {
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      attachmentType: 'image' | 'voice' | 'file';
      durationMs?: number | null;
      waveformData?: number[];
    } | null;
  }) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      const validType = (['text', 'voice', 'image', 'file'] as const).includes(msg.messageType as any)
        ? (msg.messageType as 'text' | 'voice' | 'image' | 'file')
        : 'text';
      return [...prev, { ...msg, messageType: validType, isDeleted: false, status: 'delivered' as const }];
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

  // Suscripción Realtime consolidada
  const { broadcastMessage, broadcastReaction } = useRealtimeMessages({
    conversationId,
    userId: user?.id || '',
    token: token || '',
    sharedKey,
    onNewMessage: handleNewMessage,
    onMessageStatusUpdate: handleStatusUpdate,
    onMessageUpdated: handleMessageUpdated,
    onReactionsUpdated: handleReactionsUpdated,
  });

  // Mantener broadcastMessageRef al día
  useEffect(() => {
    broadcastMessageRef.current = broadcastMessage;
    broadcastReactionRef.current = broadcastReaction;
  }, [broadcastMessage, broadcastReaction]);

  // Marcar mensajes como leídos cuando la conversación está abierta
  const otherMessageIds = messages
    .filter(m => m.senderId !== user?.id)
    .map(m => m.id);
  useMarkAsRead(conversationId, user?.id || '', token || '', otherMessageIds);

  const loadMessages = useCallback(async (key?: Uint8Array, cursor?: string) => {
    const currentKey = key || sharedKeyRef.current;
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

    const decryptReplySnapshot = (msg: any) => {
      const snapshot = msg.replyToSnapshot;
      if (!snapshot) return null;
      if (snapshot.isDeleted) {
        return { ...snapshot, text: undefined };
      }
      if (typeof snapshot.text === 'string') {
        return snapshot;
      }
      if (!snapshot.e2e) {
        return { ...snapshot, text: '[Error: datos E2E no disponibles]' };
      }
      try {
        return { ...snapshot, text: decryptMessageE2E(snapshot.e2e, currentKey) };
      } catch {
        return { ...snapshot, text: '[Error al descifrar]' };
      }
    };

    const decrypted: Message[] = (data.messages as any[]).map((msg) => {
      const replyToSnapshot = decryptReplySnapshot(msg);
      if (msg.isDeleted) {
        return { ...msg, text: undefined, replyToSnapshot, status: 'delivered' as const };
      }
      if (!msg.e2e) {
        return { ...msg, text: '[Error: datos E2E no disponibles]', replyToSnapshot, status: 'delivered' as const };
      }
      try {
        const text = decryptMessageE2E(msg.e2e, currentKey);
        return { ...msg, text, replyToSnapshot, status: 'delivered' as const };
      } catch {
        return { ...msg, text: '[Error al descifrar]', replyToSnapshot, status: 'delivered' as const };
      }
    });

    setHasMore(data.hasMore ?? false);

    if (cursor) {
      const container = scrollContainerRef.current;
      if (container) prevScrollHeightRef.current = container.scrollHeight;
      setMessages(prev => [...decrypted, ...prev]);
    } else {
      setMessages(decrypted);
    }
  }, [conversationId, token]);

  // Cargar shared key y mensajes iniciales
  const initConversation = useCallback(async () => {
    if (!token || !user) return;
    setLoading(true);
    try {
      // Usar endpoint individual en vez de descargar la lista completa
      const convRes = await fetch(`/api/conversations/${conversationId}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!convRes.ok) throw new Error('Failed to load conversation');
      const convData = await convRes.json();
      const conv = convData.conversation;
      if (!conv) throw new Error('Conversation not found');

      const isGroupConv = conv.isGroup || false;
      setIsGroup(isGroupConv);
      setGroupName(conv.groupName || '');
      setOtherUsername(displayUsername(conv.otherUser?.username));
      setOtherUserId(conv.otherUser?.id || '');
      setIsOtherDeleted(!conv.isGroup && isDeletedUser(conv.otherUser?.username));

      let resolvedSharedKey: Uint8Array;

      if (isGroupConv) {
        // GRUPOS: la clave vive en group_keys (no en conversation_participants).
        // Se obtiene del endpoint, que la descifra con la master key del servidor
        // y la entrega en hex. Todos los miembros usan la misma clave de grupo.
        const { fromHex } = await import('@/lib/crypto/utils');
        const keyRes = await fetch(`/api/groups/${conversationId}/key`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!keyRes.ok) throw new Error('No se pudo obtener la clave del grupo');
        const keyData = await keyRes.json();
        const keyHex = keyData.keyHex ?? keyData.key ?? keyData.groupKey;
        if (!keyHex) throw new Error('Clave de grupo no disponible');
        resolvedSharedKey = fromHex(keyHex);
      } else {
        // 1-a-1: shared key DH cifrada con la storageKey del usuario
        const { decryptSharedKeyFromStorage } = await import('@/lib/crypto/key-exchange');
        const { pbkdf2 } = await import('@/lib/crypto/pbkdf2');
        const storageKey = cachedStorageKey ?? pbkdf2(user.id, 'storage-salt', 1000, 32);
        resolvedSharedKey = decryptSharedKeyFromStorage(conv.encryptedSharedKey, storageKey);
      }

      setSharedKey(resolvedSharedKey);

      // Cargar mensajes iniciales
      await loadMessages(resolvedSharedKey);
    } catch (err) {
      // Si el usuario fue invitado a una llamada grupal de una conversación de
      // la que NO es miembro, no bloquear con error: entrar en modo solo-llamada.
      const invitedToGroupCall =
        shouldAutoJoinGroup ||
        useCallStore.getState().pendingGroupJoin === conversationId;
      if (invitedToGroupCall) {
        // Esperado: el invitado no es miembro, solo se une a la llamada.
        setCallOnlyMode(true);
      } else {
        console.error('Init conversation error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, [token, user, conversationId, cachedStorageKey, loadMessages, shouldAutoJoinGroup]);

  useEffect(() => {
    initConversation();
  }, [initConversation]);

  // Auto-unirse al canal de llamada grupal cuando:
  //   - Charlie aceptó banner con flag isGroupCall (query param ?joinGroupCall=1)
  //   - Charlie ya estaba en el chat y le llegó un incoming-call grupal (pendingGroupJoin)
  const hasAutoJoinedRef = useRef(false);
  const pendingGroupJoin = useCallStore(s => s.pendingGroupJoin);
  const setPendingGroupJoin = useCallStore(s => s.setPendingGroupJoin);
  useEffect(() => {
    const shouldJoin = shouldAutoJoinGroup || pendingGroupJoin === conversationId;
    if (!shouldJoin || hasAutoJoinedRef.current) return;
    // La llamada grupal deriva su clave del conversationId, NO necesita la
    // sharedKey de la conversación. Solo esperamos a tener el usuario y a no
    // estar bloqueados por el loading inicial.
    if (!user?.id || loading) return;
    if (groupCallState !== 'idle') return;

    hasAutoJoinedRef.current = true;
    joinGroupCall().catch(err => {
      console.error('Auto-join group call failed:', err);
      hasAutoJoinedRef.current = false; // permitir reintento manual
    });
    if (pendingGroupJoin === conversationId) setPendingGroupJoin(null);
    if (shouldAutoJoinGroup && !callOnlyMode) router.replace(`/chat/${conversationId}`);
  }, [shouldAutoJoinGroup, pendingGroupJoin, user?.id, loading, groupCallState, joinGroupCall, router, conversationId, setPendingGroupJoin, callOnlyMode]);

  // Scroll al fondo solo en la carga inicial
  useEffect(() => {
    if (isInitialLoad.current && messages.length > 0) {
      scrollToBottom('auto');
      isInitialLoad.current = false;
    }
  }, [messages, scrollToBottom]);

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
    const hasNewMessage = messages.length > prevLengthRef.current;

    if (hasNewMessage) {
      const container = scrollContainerRef.current;
      const distanceFromBottom = container
        ? container.scrollHeight - container.scrollTop - container.clientHeight
        : 0;

      if (last?.senderId === user?.id || distanceFromBottom < 260) {
        scrollToBottom('auto');
      }
    }

    prevLengthRef.current = messages.length;
  }, [messages, user?.id, scrollToBottom]);

  useEffect(() => {
    if (!typingText) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 240) {
      scrollToBottom('smooth');
    }
  }, [typingText, scrollToBottom]);

  // Scroll infinito
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

  // Búsqueda local
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.text?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  // Enviar mensaje de texto
  const sendMessage = async () => {
    if (!newMessage.trim() || !token || !sharedKey || sending) return;
    setSending(true);
    stopTyping();

    try {
      const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');
      const e2eEncrypted = encryptMessageE2E(newMessage.trim(), sharedKey);
      const replySnapshot = replyTo ? {
        id: replyTo.id,
        senderId: replyTo.senderId,
        createdAt: replyTo.createdAt,
        text: replyTo.isDeleted ? undefined : replyTo.text,
        isDeleted: replyTo.isDeleted,
      } : null;

      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: Message = {
        id: optimisticId,
        senderId: user?.id || '',
        text: newMessage.trim(),
        createdAt: new Date().toISOString(),
        status: 'sent',
        replyToId: replyTo?.id ?? null,
        replyToSnapshot: replySnapshot,
        messageType: 'text',
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setNewMessage('');
      setReplyTo(null);
      scrollToBottom('auto');

      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ e2eEncrypted, replyToId: replyTo?.id ?? null }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev =>
          prev.map(m => {
            if (m.id === optimisticId) {
              return { ...m, id: data.message.id, status: 'sent' as const };
            }
            if (m.replyToId === optimisticId) {
              return { ...m, replyToId: data.message.id };
            }
            return m;
          })
        );

        // Transmitir vía Broadcast Realtime
        broadcastMessageRef.current({
          id: data.message.id,
          senderId: user?.id || '',
          e2e: e2eEncrypted,
          createdAt: data.message.created_at ?? new Date().toISOString(),
          replyToId: replyTo?.id ?? null,
          replyToSnapshot: replySnapshot,
          messageType: 'text',
        });
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

  // Adjuntar archivo (desencadena subida y envío)
  const handleFileSelected = useCallback(async (file: File) => {
    if (!token || !sharedKey) return null;

    const result = await uploadAttachment(file);
    if (!result) return null;

    const type = result.attachmentType;
    const content = `[${type}:${result.id}] ${result.filename}`;
    
    try {
      const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');
      const e2eEncrypted = encryptMessageE2E(content, sharedKey);

      const optimisticId = `optimistic-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: optimisticId,
        senderId: user?.id || '',
        text: result.filename,
        createdAt: new Date().toISOString(),
        status: 'sent' as const,
        messageType: type,
        attachment: {
          id: result.id,
          filename: result.filename,
          mimeType: result.mimeType,
          sizeBytes: result.sizeBytes,
          attachmentType: type,
        },
      }]);

      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ e2eEncrypted, messageType: type, attachmentId: result.id }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.message.id } : m));

        // Transmitir vía Broadcast
        broadcastMessageRef.current({
          id: data.message.id,
          senderId: user?.id || '',
          e2e: e2eEncrypted,
          createdAt: data.message.created_at ?? new Date().toISOString(),
          replyToId: null,
          messageType: type,
          attachment: {
            id: result.id,
            filename: result.filename,
            mimeType: result.mimeType,
            sizeBytes: result.sizeBytes,
            attachmentType: type,
          },
        });
      }
    } catch (err) {
      console.error('File send error:', err);
    }
    return null;
  }, [conversationId, token, sharedKey, uploadAttachment, user]);

  // ── Reacciones ──────────────────────────────────────────────────────────────
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!token || !user) return;
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

    const res = await fetch(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emoji }),
    });

    if (res.ok) {
      await handleReactionsUpdated(messageId);
      broadcastReactionRef.current({ messageId, senderId: user.id });
    } else {
      await handleReactionsUpdated(messageId);
    }
  }, [token, user, handleReactionsUpdated]);

  // ── Editar mensaje ──────────────────────────────────────────────────────────
  const startEdit = useCallback((msg: Message) => {
    setEditingId(msg.id);
    setEditText(msg.text || '');
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingId || !editText.trim() || !token || !sharedKey) return;
    const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');
    const e2eEncrypted = encryptMessageE2E(editText.trim(), sharedKey);

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
    } else {
      stopTyping();
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

  // Modo invitado a llamada: el usuario no es miembro de la conversación, solo
  // puede unirse a la llamada grupal. Mostramos únicamente el GroupCallModal.
  if (callOnlyMode) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950 text-white">
        {groupCallState === 'idle' ? (
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[15px]">Uniéndote a la llamada…</p>
            <Link href="/chat" className="text-[#0084ff] text-[15px] mt-3 inline-block hover:underline">Cancelar</Link>
          </div>
        ) : null}
        <GroupCallModal
          isOpen={groupCallState !== 'idle'}
          groupName="Llamada grupal"
          participants={groupParticipants}
          localVideoRef={groupLocalVideoRef}
          isAudioMuted={groupAudioMuted}
          isVideoMuted={groupVideoMuted}
          onLeave={() => { leaveGroupCall(); router.push('/chat'); }}
          onToggleAudio={toggleGroupAudio}
          onToggleVideo={toggleGroupVideo}
          activeFilter={activeFilter}
          activeBackground={activeBackground}
          onFilterChange={handleFilterChange}
          onBackgroundChange={handleBackgroundChange}
        />
      </div>
    );
  }

  return (
    <>
      {/* Modales de llamada */}
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
        onToggleScreenShare={toggleScreenShare}
        isAudioMuted={isAudioMuted}
        isVideoMuted={isVideoMuted}
        isScreenSharing={isScreenSharing}
        isRemoteScreenSharing={isRemoteScreenSharing}
        callerIsContact={(!otherUserId || contactsLoading) ? undefined : myContacts.some(c => c.friend?.id === otherUserId)}
        isAudioOnly={isAudioOnly}
        isE2EMedia={isE2EMedia}
        token={token || undefined}
        onAddParticipant={handleAddParticipant}
        onDismiss={forceIdle}
        isUserOnline={isUserOnline}
        activeFilter={activeFilter}
        activeBackground={activeBackground}
        onFilterChange={handleFilterChange}
        onBackgroundChange={handleBackgroundChange}
      />

      <GroupCallModal
        isOpen={groupCallState !== 'idle'}
        groupName={groupName}
        participants={groupParticipants}
        localVideoRef={groupLocalVideoRef}
        isAudioMuted={groupAudioMuted}
        isVideoMuted={groupVideoMuted}
        onLeave={leaveGroupCall}
        onToggleAudio={toggleGroupAudio}
        onToggleVideo={toggleGroupVideo}
        activeFilter={activeFilter}
        activeBackground={activeBackground}
        onFilterChange={handleFilterChange}
        onBackgroundChange={handleBackgroundChange}
      />

      {/* Modal de reenviar mensaje */}
      <ForwardMessageModal
        open={forwardingMessage !== null}
        messageText={forwardingMessage?.text || ''}
        currentConversationId={conversationId}
        currentUserId={user?.id || ''}
        token={token || ''}
        storageKey={cachedStorageKey}
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

      {/* Área de chat */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-white dark:bg-gray-900">
        {/* Header de conversación */}
        <div className="px-4 py-3 bg-white dark:bg-gray-900 border-b border-[#e4e6eb] dark:border-gray-800 flex items-center gap-3">
          <Link
            href="/chat"
            className="md:hidden p-1 mr-1 rounded-full hover:bg-[#f0f2f5] dark:hover:bg-gray-800 text-[#0084ff] transition-colors flex-shrink-0"
            title="Volver a la lista de chats"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <div
            className={`flex items-center gap-2 flex-1 min-w-0 ${isGroup ? 'cursor-pointer rounded-lg -mx-1 px-1 py-0.5 hover:bg-[#f0f2f5] dark:hover:bg-gray-800 transition-colors' : ''}`}
            onClick={isGroup ? () => setShowGroupSettings(true) : undefined}
            title={isGroup ? 'Ver información del grupo' : undefined}
          >
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white font-medium flex-shrink-0">
              {isGroup ? (groupName[0]?.toUpperCase() || 'G') : (otherUsername[0]?.toUpperCase() || '?')}
            </div>
            {!isGroup && <OnlineIndicator isOnline={isUserOnline(otherUserId)} size="sm" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#050505] dark:text-white font-semibold text-[15px] truncate">{isGroup ? groupName : otherUsername}</p>
            <div className="flex items-center gap-1 text-[13px] truncate">
              {isGroup ? (
                <span className="text-[#65676b]">{groupDetail?.members?.length ?? 0} miembros</span>
              ) : isUserOnline(otherUserId) ? (
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
          </div>
          {!isGroup && !isOtherDeleted && (
            <>
              <button
                onClick={() => initiateCall(true)}
                className="p-2 rounded-full hover:bg-[#f0f2f5] dark:hover:bg-gray-800 text-[#0084ff] transition-colors"
                title="Iniciar llamada de audio cifrada"
              >
                <Phone className="w-6 h-6" fill="currentColor" />
              </button>
              <button
                onClick={() => initiateCall(false)}
                className="p-2 rounded-full hover:bg-[#f0f2f5] dark:hover:bg-gray-800 text-[#0084ff] transition-colors"
                title="Iniciar videollamada cifrada"
              >
                <Video className="w-6 h-6" fill="currentColor" />
              </button>
            </>
          )}
          {isGroup && callState === 'connected' && (
            <button
              onClick={() => {/* Agregar miembro a la llamada */}}
              className="p-2 rounded-full hover:bg-[#f0f2f5] dark:hover:bg-gray-800 text-[#0084ff] transition-colors"
              title="Agregar miembro"
            >
              <Users className="w-6 h-6" />
            </button>
          )}
          {/* Botón búsqueda */}
          <button
            onClick={() => { setSearchOpen(o => !o); setSearchQuery(''); }}
            className="p-2 rounded-full hover:bg-[#f0f2f5] dark:hover:bg-gray-800 text-[#65676b] dark:text-gray-400 transition-colors"
            title="Buscar en la conversación"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Menú de personalización del chat (3 puntos) */}
          <ChatCustomizationMenu
            bubbleColor={bubbleColor}
            background={chatBackground}
            onBubbleColorChange={setBubbleColor}
            onBackgroundChange={setChatBackground}
            isDark={currentTheme === 'dark'}
          />
        </div>

        {/* Barra de búsqueda */}
        {searchOpen && (
          <div className="px-4 py-2 border-b border-[#e4e6eb] dark:border-gray-800 flex items-center gap-2 bg-[#f0f2f5] dark:bg-gray-800">
            <Search className="w-4 h-4 text-[#65676b] dark:text-gray-400 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar en la conversación..."
              className="flex-1 bg-transparent text-[#050505] dark:text-white placeholder-[#65676b] dark:placeholder-gray-400 focus:outline-none text-[14px]"
            />
            {searchQuery && (
              <span className="text-[12px] text-[#65676b] dark:text-gray-400">{filteredMessages.length} resultado{filteredMessages.length !== 1 ? 's' : ''}</span>
            )}
            <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="text-[#65676b] dark:text-gray-400 hover:text-[#050505] dark:hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Mensajes */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-1 transition-colors"
          style={{ backgroundColor: chatBgColor }}
        >
          {/* Spinner de carga de más mensajes */}
          {loadingMore && (
            <div className="flex justify-center py-2">
              <div className="w-5 h-5 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loadingMore && hasMore && (
            <div className="flex justify-center py-1">
              <span className="text-[12px] text-[#65676b] dark:text-gray-400">↑ Sube para ver más mensajes</span>
            </div>
          )}

          {messages.length === 0 && !loading && (
            <div className="text-center text-[#65676b] dark:text-gray-400 py-12">
              <div className="w-20 h-20 bg-[#f0f2f5] dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <p className="text-[15px] font-medium text-[#050505] dark:text-white">Mensajes y llamadas cifradas de extremo a extremo</p>
              <p className="text-[13px] mt-1 text-[#65676b] dark:text-gray-400">Nadie fuera de este chat, ni siquiera Messenger, puede leerlos ni escucharlos.</p>
            </div>
          )}

          {(searchQuery ? filteredMessages : messages).map((msg, idx) => {
            const displayList = searchQuery ? filteredMessages : messages;
            const isMe = msg.senderId === user?.id;
            const nextMsg = displayList[idx + 1];
            const prevMsg = displayList[idx - 1];
            const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId;
            const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId;
            const replySource = msg.replyToId
              ? messages.find(m => m.id === msg.replyToId) ?? msg.replyToSnapshot ?? null
              : null;

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
                // Callbacks para adjuntos (develop)
                onViewImage={handleViewImage}
                onLoadThumbnail={handleLoadThumbnail}
                onDownload={triggerDownload}
                onLoadAudio={handleLoadAudio}
                bubbleColor={bubbleColor.hex}
                senderName={isGroup && !isMe ? (memberNames.get(msg.senderId) || 'Miembro') : undefined}
                showSenderName={isGroup && !isMe && isFirstInGroup}
              />
            );
          })}

          {/* Typing indicator */}
          <TypingIndicator typingText={typingText} />

          <div ref={messagesEndRef} />
        </div>

        {/* Input de mensaje */}
        <div className="p-3 bg-white dark:bg-gray-900 border-t border-[#e4e6eb] dark:border-gray-800">
          {isOtherDeleted ? (
            <div className="flex items-center justify-center gap-2 py-2.5 text-[#65676b] dark:text-gray-400 text-[13px]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Esta cuenta fue eliminada. No puedes enviar mensajes ni llamar.
            </div>
          ) : (
          <>
          {/* Preview de respuesta */}
          {replyTo && (
            <ReplyPreview
              text={replyTo.isDeleted ? 'Mensaje eliminado' : (replyTo.text || '')}
              senderName={replyTo.senderId === user?.id ? 'Tú' : otherUsername}
              onCancel={() => setReplyTo(null)}
            />
          )}
          <div className="flex items-end gap-2">
            {/* Attachment Button */}
            <AttachmentButton
              onFileSelected={handleFileSelected}
              uploadProgress={uploadProgress}
              error={attachError}
              onClearError={clearAttachError}
              disabled={!sharedKey}
            />

            <div className={`flex-1 bg-[#f0f2f5] dark:bg-gray-800 rounded-3xl items-center pr-2 ${isRecordingVoice ? 'hidden' : 'flex'}`}>
              <input
                type="text"
                value={newMessage}
                onChange={handleInputChange}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Aa"
                className="flex-1 px-4 py-2 bg-transparent text-[#050505] dark:text-white placeholder-[#65676b] dark:placeholder-gray-400 focus:outline-none text-[15px]"
                disabled={sending}
              />
              <button className="p-2 text-[#0084ff] hover:bg-[#e4e6eb] dark:hover:bg-gray-700 rounded-full transition-colors flex-shrink-0">
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
                className="p-2 text-[#0084ff] hover:bg-[#f0f2f5] dark:hover:bg-gray-800 rounded-full transition-colors flex-shrink-0"
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
              // Voice Record Button
              <VoiceRecordButton
                sharedKey={sharedKey}
                disabled={!sharedKey}
                onRecordingChange={setIsRecordingVoice}
                onVoiceReady={async (result) => {
                  if (!token || !sharedKey) return;
                  
                  // Crear blob cifrado y subir como attachment de voz
                  const hexToBytes = (hex: string) => {
                    const bytes = new Uint8Array(hex.length / 2);
                    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
                    return bytes;
                  };
                  const encBlob = new Blob([hexToBytes(result.encryptedData.ciphertext)], { type: 'application/octet-stream' });

                  // MIME real con el que grabó este navegador (webm/ogg/mp4).
                  // NO hardcodear 'audio/webm': si los bytes son ogg el reproductor
                  // lanza NotSupportedError ("no supported source").
                  // Se quita el sufijo ";codecs=opus" porque el validador del servidor
                  // hace match EXACTO contra la whitelist (audio/webm, audio/ogg).
                  const rawVoiceMime = result.mimeType || 'audio/webm';
                  const voiceMime = rawVoiceMime.split(';')[0].trim() || 'audio/webm';
                  const voiceExt = voiceMime.includes('ogg') ? 'ogg'
                    : voiceMime.includes('mp4') || voiceMime.includes('mpeg') ? 'm4a'
                    : 'webm';
                  const voiceFilename = `voice.${voiceExt}`;

                  const formData = new FormData();
                  formData.append('encryptedFile', encBlob, 'voice.enc');
                  formData.append('conversationId', conversationId);
                  formData.append('iv', result.encryptedData.iv);
                  formData.append('macTag', result.encryptedData.mac);
                  formData.append('mimeType', voiceMime);
                  formData.append('originalFilename', `voice_${Date.now()}.${voiceExt}`);
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
                    const content = `[voice:${uploadData.attachmentId}] Mensaje de voz`;
                    const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');
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
                        filename: voiceFilename,
                        mimeType: voiceMime,
                        sizeBytes: result.sizeBytes,
                        attachmentType: 'voice' as const,
                        durationMs: result.durationMs,
                        waveformData: result.waveformData,
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

                      // Transmitir vía Broadcast
                      broadcastMessageRef.current({
                        id: data.message.id,
                        senderId: user?.id || '',
                        e2e: e2eEncrypted,
                        createdAt: data.message.created_at ?? new Date().toISOString(),
                        replyToId: null,
                        messageType: 'voice',
                        attachment: {
                          id: uploadData.attachmentId,
                          filename: voiceFilename,
                          mimeType: voiceMime,
                          sizeBytes: result.sizeBytes,
                          attachmentType: 'voice' as const,
                          durationMs: result.durationMs,
                          waveformData: result.waveformData,
                        },
                      });
                    }
                  } catch (err) {
                    console.error('Voice send error:', err);
                  }
                }}
              />
            )}
          </div>
          </>
          )}
        </div>
      </div>

      {/* Visor de imágenes */}
      {viewerState && (
        <ImageViewer
          isOpen={true}
          images={viewerState.images}
          initialIndex={viewerState.index}
          onClose={() => setViewerState(null)}
          onDownload={triggerDownload}
          onLoadFullImage={(id) => downloadAttachment(id, false)}
        />
      )}

      {/* Ajustes del grupo (editar nombre/avatar, miembros, roles) */}
      {showGroupSettings && groupDetail && (
        <GroupSettings
          group={groupDetail}
          onClose={() => setShowGroupSettings(false)}
          onUpdated={() => { refetchGroup(); refreshConversations(); }}
          onLeftGroup={() => { refreshConversations(); router.push('/chat'); }}
        />
      )}
    </>
  );
}
