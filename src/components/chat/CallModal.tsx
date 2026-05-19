import React, { useState, useCallback, useRef, useMemo } from 'react';
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
  activeFilter?: FilterId;
  activeBackground?: BackgroundId;
  onFilterChange?: (f: FilterId) => void;
  onBackgroundChange?: (bg: BackgroundId) => void;
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
  activeFilter = 'none',
  activeBackground = 'none',
  onFilterChange,
  onBackgroundChange,
}: CallModalProps) {
  const [showContacts, setShowContacts] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [search, setSearch] = useState('');
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const contactsAbortRef = useRef<AbortController | null>(null);

  const handleOpenContacts = useCallback(async () => {
    contactsAbortRef.current?.abort();
    const controller = new AbortController();
    contactsAbortRef.current = controller;
    setShowContacts(true);
    setLoadingContacts(true);
    try {
      const res = await fetch('/api/contacts', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const data = await res.json();
      if (!controller.signal.aborted) {
        const list: Contact[] = (data.contacts ?? []).map(
          (c: { friend: Contact }) => c.friend
        );
        setContacts(list);
      }
    } catch {}
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

  if (callState === 'idle') return null;

  const showLocalVideo = !isAudioOnly && (callState === 'connected' || callState === 'calling');
  const isTerminal = callState === 'ended' || callState === 'declined' || callState === 'missed' || callState === 'failed';
  const showControls = callState === 'calling' || callState === 'connected' || callState === 'reconnecting';

  const filteredContacts = useMemo(
    () => contacts.filter(c => c.username.toLowerCase().includes(search.toLowerCase())),
    [contacts, search]
  );

  const statusLabel = (() => {
    if (callState === 'receiving') {
      return isAudioOnly ? 'Llamada de voz entrante...' : 'Videollamada entrante...';
    }
    if (callState === 'connected') return 'Llamada en curso';
    return STATE_LABELS[callState] ?? '';
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-800">

        {/* Audio-only or terminal state: centered avatar */}
        {(isAudioOnly || isTerminal) && (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
            <div className="flex flex-col items-center gap-4">
              <div className={`w-32 h-32 rounded-full flex items-center justify-center text-white text-5xl font-bold shadow-xl ${
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
          className={`w-full h-full object-cover ${(isAudioOnly || isTerminal) ? 'hidden' : ''}`}
        />

        {/* Local video PiP — only during video calls */}
        {showLocalVideo && (
          <div className="absolute bottom-6 right-6 w-48 aspect-video bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
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
          <div className="absolute inset-y-0 right-0 w-72 bg-gray-900/95 backdrop-blur border-l border-gray-700 flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <span className="text-white font-semibold text-sm">Añadir participante</span>
              <button
                onClick={() => { setShowContacts(false); setSearch(''); }}
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
              ) : filteredContacts.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  {search ? 'Sin resultados' : 'Sin contactos'}
                </p>
              ) : (
                filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleInvite(contact)}
                    disabled={!!invitingId}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {contact.username[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-white text-sm flex-1 truncate">{contact.username}</span>
                    {invitingId === contact.id ? (
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    ) : (
                      <UserPlus className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                ))
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

        {/* Overlay: header + controls */}
        <div className="absolute inset-0 flex flex-col justify-between p-6 pointer-events-none">

          {/* Header */}
          <div className="text-center pointer-events-none">
            <h2 className="text-2xl font-bold text-white drop-shadow-md">{otherUsername}</h2>
            <p className="text-gray-300 drop-shadow-md">{statusLabel}</p>

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
          <div className="flex items-center justify-center space-x-4 pointer-events-auto">

            {callState === 'receiving' && (
              <>
                <button
                  onClick={onAccept}
                  className="p-4 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors shadow-lg"
                >
                  <Phone className="w-8 h-8" />
                </button>
                <button
                  onClick={onReject}
                  className="p-4 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-lg"
                >
                  <PhoneOff className="w-8 h-8" />
                </button>
              </>
            )}

            {showControls && (
              <>
                <button
                  onClick={onToggleAudio}
                  className={`p-4 rounded-full transition-colors shadow-lg ${
                    isAudioMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                  } text-white`}
                >
                  {isAudioMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                <button
                  onClick={onEndCall}
                  className="p-4 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-lg"
                >
                  <PhoneOff className="w-8 h-8" />
                </button>

                {!isAudioOnly && (
                  <button
                    onClick={onToggleVideo}
                    className={`p-4 rounded-full transition-colors shadow-lg ${
                      isVideoMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                    } text-white`}
                  >
                    {isVideoMuted ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                  </button>
                )}

                {/* Add participant — only when connected and feature is available */}
                {callState === 'connected' && onAddParticipant && (
                  <button
                    onClick={handleOpenContacts}
                    className={`p-3 rounded-full transition-colors shadow-lg ${
                      showContacts
                        ? 'bg-blue-500 hover:bg-blue-600'
                        : 'bg-gray-700 hover:bg-gray-600'
                    } text-white`}
                    title="Añadir participante a la llamada"
                  >
                    <UserPlus className="w-5 h-5" />
                  </button>
                )}

                {/* Video filters — only on video calls */}
                {!isAudioOnly && onFilterChange && (
                  <button
                    onClick={() => setShowFilterPanel(s => !s)}
                    className={`p-3 rounded-full transition-colors shadow-lg ${
                      showFilterPanel || activeFilter !== 'none'
                        ? 'bg-[#0084ff] hover:bg-[#0070d8]'
                        : 'bg-gray-700 hover:bg-gray-600'
                    } text-white`}
                    title="Filtros de video"
                  >
                    <Sparkles className="w-5 h-5" />
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
