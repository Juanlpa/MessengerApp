import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Shield, ShieldAlert, UserPlus, X, Search, Sparkles } from 'lucide-react';
import { CallState } from '@/hooks/useWebRTC';
import { VideoFilterPanel } from '@/components/calls/VideoFilterPanel';
import { type FilterId } from '@/lib/filters/canvas-filters';
import { type BackgroundId } from '@/hooks/useVideoFilter';

interface Contact {
  id: string;
  username: string;
}

interface CallModalProps {
  callState: CallState;
  otherUsername: string;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  onAccept: () => void;
  onReject: () => void;
  onEndCall: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isAudioOnly?: boolean;
  isE2EMedia?: boolean;
  token?: string;
  onAddParticipant?: (contactId: string, contactName: string) => Promise<void>;
  onDismiss?: () => void;
  isUserOnline?: (id: string) => boolean;
  activeFilter?: FilterId;
  activeBackground?: BackgroundId;
  onFilterChange?: (f: FilterId) => void;
  onBackgroundChange?: (bg: BackgroundId) => void;
}

function ContactRow({
  contact,
  isOnline,
  invitingId,
  onInvite,
}: {
  contact: Contact;
  isOnline: boolean;
  invitingId: string | null;
  onInvite: (c: Contact) => void;
}) {
  return (
    <button
      onClick={() => onInvite(contact)}
      disabled={!!invitingId}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors text-left disabled:opacity-50"
    >
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white text-sm font-semibold">
          {contact.username[0]?.toUpperCase() || '?'}
        </div>
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
          isOnline ? 'bg-green-400' : 'bg-gray-500'
        }`} />
      </div>
      <span className={`text-sm flex-1 truncate ${isOnline ? 'text-white' : 'text-gray-400'}`}>
        {contact.username}
      </span>
      {invitingId === contact.id ? (
        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      ) : (
        <UserPlus className="w-4 h-4 text-gray-400 flex-shrink-0" />
      )}
    </button>
  );
}

const STATE_LABELS: Partial<Record<CallState, string>> = {
  calling: 'Llamando...',
  reconnecting: 'Reconectando...',
  ended: 'Llamada terminada',
  declined: 'Llamada rechazada',
  missed: 'Sin respuesta',
  failed: 'Error de conexión',
};

export function CallModal({
  callState,
  otherUsername,
  localVideoRef,
  remoteVideoRef,
  onAccept,
  onReject,
  onEndCall,
  onToggleAudio,
  onToggleVideo,
  isAudioMuted,
  isVideoMuted,
  isAudioOnly = false,
  isE2EMedia = false,
  token,
  onAddParticipant,
  onDismiss,
  isUserOnline,
  activeFilter = 'none',
  activeBackground = 'none',
  onFilterChange,
  onBackgroundChange,
}: CallModalProps) {
  const [showContacts, setShowContacts] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactsError, setContactsError] = useState(false);
  const [search, setSearch] = useState('');
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const contactsAbortRef = useRef<AbortController | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);

  useEffect(() => {
    if (callState !== 'connected') {
      setCallSeconds(0);
      return;
    }
    const t = setInterval(() => setCallSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  // Cerrar paneles flotantes cuando la llamada termina (no persistir entre llamadas)
  useEffect(() => {
    if (callState === 'idle') {
      setShowContacts(false);
      setShowFilterPanel(false);
      setSearch('');
      setContacts([]);
    }
  }, [callState]);

  const handleOpenContacts = useCallback(async () => {
    // Only abort if there's a pending in-flight request (panel re-opened quickly)
    contactsAbortRef.current?.abort();
    const controller = new AbortController();
    contactsAbortRef.current = controller;
    setShowContacts(true);
    setContactsError(false);
    setLoadingContacts(true);
    try {
      const res = await fetch('/api/contacts', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        if (!res.ok) {
          setContactsError(true);
        } else {
          const data = await res.json();
          const list: Contact[] = (data.contacts ?? [])
            .map((c: { friend: Contact | null }) => c.friend)
            .filter(Boolean) as Contact[];
          setContacts(list);
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) setContactsError(true);
    }
    if (!controller.signal.aborted) setLoadingContacts(false);
  }, [token]);

  const handleInvite = useCallback(async (contact: Contact) => {
    if (!onAddParticipant || invitingId) return;
    setInvitingId(contact.id);
    await onAddParticipant(contact.id, contact.username);
    setInvitingId(null);
    setShowContacts(false);
    setSearch('');
    setContacts([]); // force refresh next open so the list stays current
  }, [onAddParticipant, invitingId]);

  // Must be before any conditional return (Rules of Hooks)
  const { onlineContacts, offlineContacts } = useMemo(() => {
    const filtered = contacts.filter(c =>
      c.username.toLowerCase().includes(search.toLowerCase())
    );
    if (!isUserOnline) return { onlineContacts: filtered, offlineContacts: [] };
    return {
      onlineContacts: filtered.filter(c => isUserOnline(c.id)),
      offlineContacts: filtered.filter(c => !isUserOnline(c.id)),
    };
  }, [contacts, search, isUserOnline]);

  if (callState === 'idle') return null;

  const showLocalVideo = !isAudioOnly && (callState === 'connected' || callState === 'calling');
  const isTerminal = callState === 'ended' || callState === 'declined' || callState === 'missed' || callState === 'failed';
  const showControls = callState === 'calling' || callState === 'connected' || callState === 'reconnecting';

  const statusLabel = (() => {
    if (callState === 'receiving') {
      return isAudioOnly ? 'Llamada de voz entrante...' : 'Videollamada entrante...';
    }
    if (callState === 'connected') {
      const m = Math.floor(callSeconds / 60).toString().padStart(2, '0');
      const s = (callSeconds % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    }
    return STATE_LABELS[callState] ?? '';
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4">
      <div className="relative w-full h-full max-h-screen md:max-w-4xl md:max-h-[90vh] md:aspect-video md:rounded-2xl overflow-hidden shadow-2xl md:border md:border-gray-800 bg-gray-900 flex flex-col">

        {/* Audio-only or terminal state: centered avatar */}
        {(isAudioOnly || isTerminal) && (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900 flex-1">
            <div className="flex flex-col items-center gap-4">
              <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full flex items-center justify-center text-white text-4xl sm:text-5xl font-bold shadow-xl ${
                isTerminal
                  ? 'bg-gradient-to-tr from-gray-600 to-gray-700'
                  : 'bg-gradient-to-tr from-[#0084ff] to-[#00c6ff]'
              }`}>
                {otherUsername[0]?.toUpperCase() || '?'}
              </div>
              {callState === 'connected' && isAudioOnly && (
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-[#0084ff] rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Remote media — always in DOM so audio plays even in audio-only mode */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover flex-1 ${(isAudioOnly || isTerminal) ? 'hidden' : ''}`}
        />

        {/* Local video PiP — se mueve a la esquina inferior izquierda cuando se abre el panel
            de contactos (para no superponerse ni con el header ni con la barra de controles). */}
        {showLocalVideo && (
          <div className={`absolute aspect-video bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700 transition-all duration-200 z-10 ${
            showContacts
              ? 'bottom-6 left-6 w-24 sm:w-36'
              : 'bottom-6 right-6 w-28 sm:w-48'
          }`}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Terminal state dismiss button */}
        {isTerminal && onDismiss && (
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Reconnecting spinner overlay */}
        {callState === 'reconnecting' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-white text-sm font-medium">Reconectando...</span>
            </div>
          </div>
        )}

        {/* Contact picker panel */}
        {showContacts && (
          <div className="absolute inset-0 w-full md:inset-y-0 md:right-0 md:w-72 bg-gray-900/95 backdrop-blur md:border-l md:border-gray-700 flex flex-col z-20">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <span className="text-white font-semibold text-sm">Añadir participante</span>
              <button
                onClick={() => { setShowContacts(false); setSearch(''); setContactsError(false); }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-3 py-2 border-b border-gray-700">
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
                <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar contacto..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-transparent text-white text-sm placeholder-gray-500 outline-none w-full"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingContacts ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : contactsError ? (
                <div className="flex flex-col items-center gap-3 py-8 px-4">
                  <p className="text-gray-400 text-sm text-center">No se pudieron cargar los contactos</p>
                  <button
                    onClick={handleOpenContacts}
                    className="text-blue-400 text-sm hover:text-blue-300 transition-colors"
                  >
                    Reintentar
                  </button>
                </div>
              ) : onlineContacts.length === 0 && offlineContacts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 px-4">
                  <p className="text-gray-400 text-sm text-center">
                    {search ? 'Sin resultados' : 'Aún no tienes amigos'}
                  </p>
                  {!search && (
                    <p className="text-gray-500 text-xs text-center">
                      Agrega contactos desde la lista de chats para poder invitarlos a llamadas
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {onlineContacts.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                        En línea — {onlineContacts.length}
                      </div>
                      {onlineContacts.map((contact) => (
                        <ContactRow
                          key={contact.id}
                          contact={contact}
                          isOnline={true}
                          invitingId={invitingId}
                          onInvite={handleInvite}
                        />
                      ))}
                    </>
                  )}
                  {offlineContacts.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                        Desconectados — {offlineContacts.length}
                      </div>
                      {offlineContacts.map((contact) => (
                        <ContactRow
                          key={contact.id}
                          contact={contact}
                          isOnline={false}
                          invitingId={invitingId}
                          onInvite={handleInvite}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Filter panel — floats above controls bar */}
        {showFilterPanel && onFilterChange && onBackgroundChange && (
          <VideoFilterPanel
            activeFilter={activeFilter}
            activeBackground={activeBackground}
            onFilterChange={onFilterChange}
            onBackgroundChange={onBackgroundChange}
            onClose={() => setShowFilterPanel(false)}
          />
        )}

        {/* Overlay: header + controls — se reduce al abrir el panel de contactos */}
        <div className={`absolute inset-y-0 left-0 flex flex-col justify-between p-4 sm:p-6 pointer-events-none transition-all duration-200 ${
          showContacts ? 'right-0 md:right-72' : 'right-0'
        }`}>

          {/* Header */}
          <div className="text-center pointer-events-none">
            <h2 className="text-xl sm:text-2xl font-bold text-white drop-shadow-md">{otherUsername}</h2>
            <p className="text-xs sm:text-sm text-gray-300 drop-shadow-md">{statusLabel}</p>

            {/* E2E / SRTP security badge */}
            {(callState === 'connected' || callState === 'reconnecting') && (
              <div className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                isE2EMedia
                  ? 'bg-green-900/60 text-green-300'
                  : 'bg-yellow-900/60 text-yellow-300'
              }`}>
                {isE2EMedia
                  ? <><Shield className="w-3 h-3" /> E2E Completo</>
                  : <><ShieldAlert className="w-3 h-3" /> SRTP Estándar</>
                }
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center space-x-3 sm:space-x-4 pointer-events-auto">

            {callState === 'receiving' && (
              <>
                <button
                  onClick={onAccept}
                  className="p-3 sm:p-4 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors shadow-lg"
                >
                  <Phone className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>
                <button
                  onClick={onReject}
                  className="p-3 sm:p-4 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-lg"
                >
                  <PhoneOff className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>
              </>
            )}

            {showControls && (
              <>
                <button
                  onClick={onToggleAudio}
                  className={`p-3 sm:p-4 rounded-full transition-colors shadow-lg ${
                    isAudioMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                  } text-white`}
                >
                  {isAudioMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
                </button>

                <button
                  onClick={onEndCall}
                  className="p-3.5 sm:p-4 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-lg"
                >
                  <PhoneOff className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>

                {!isAudioOnly && (
                  <button
                    onClick={onToggleVideo}
                    className={`p-3 sm:p-4 rounded-full transition-colors shadow-lg ${
                      isVideoMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                    } text-white`}
                  >
                    {isVideoMuted ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Video className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </button>
                )}

                {/* Add participant — only when connected and feature is available */}
                {callState === 'connected' && onAddParticipant && (
                  <button
                    onClick={handleOpenContacts}
                    className={`p-2.5 sm:p-3 rounded-full transition-colors shadow-lg ${
                      showContacts
                        ? 'bg-blue-500 hover:bg-blue-600'
                        : 'bg-gray-700 hover:bg-gray-600'
                    } text-white`}
                    title="Añadir participante a la llamada"
                  >
                    <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                )}

                {/* Video filters — only on video calls */}
                {!isAudioOnly && onFilterChange && (
                  <button
                    onClick={() => setShowFilterPanel(s => !s)}
                    className={`p-2.5 sm:p-3 rounded-full transition-colors shadow-lg ${
                      showFilterPanel || activeFilter !== 'none' || activeBackground !== 'none'
                        ? 'bg-[#0084ff] hover:bg-[#0070d8]'
                        : 'bg-gray-700 hover:bg-gray-600'
                    } text-white`}
                    title="Efectos de video"
                  >
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
