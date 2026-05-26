'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { MeshParticipant } from '@/lib/webrtc/mesh-manager';
import { VideoFilterPanel } from '@/components/calls/VideoFilterPanel';
import { type FilterId } from '@/lib/filters/canvas-filters';
import { type BackgroundId } from '@/hooks/useVideoFilter';

interface Props {
  isOpen: boolean;
  groupName: string;
  participants: Map<string, MeshParticipant>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
  activeFilter?: FilterId;
  activeBackground?: BackgroundId;
  onFilterChange?: (f: FilterId) => void;
  onBackgroundChange?: (bg: BackgroundId) => void;
}

const ParticipantTile = memo(function ParticipantTile({
  participant,
  isLocal = false,
}: {
  participant: MeshParticipant;
  isLocal?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-[#1a1a2e] flex items-center justify-center ${
        participant.isSpeaking ? 'ring-2 ring-green-400' : ''
      }`}
    >
      {participant.stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white text-2xl font-semibold">
          {participant.username[0]?.toUpperCase() || '?'}
        </div>
      )}

      {/* Nombre + indicadores */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
        <span className="text-white text-[13px] font-medium bg-black/40 px-2 py-0.5 rounded-full truncate max-w-[120px]">
          {isLocal ? 'Tú' : participant.username}
        </span>
        {participant.isMuted && (
          <div className="bg-red-500/80 rounded-full p-0.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
              <line x1="2" y1="2" x2="22" y2="22" stroke="white" strokeWidth="3" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" />
              <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" />
            </svg>
          </div>
        )}
      </div>

      {/* Indicador de cifrado */}
      {isLocal && (
        <div className="absolute top-2 right-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      )}
    </div>
  );
}, (prev, next) =>
  prev.participant.stream === next.participant.stream &&
  prev.participant.isSpeaking === next.participant.isSpeaking &&
  prev.participant.isMuted === next.participant.isMuted &&
  prev.participant.username === next.participant.username &&
  prev.isLocal === next.isLocal
);

export function GroupCallModal({
  isOpen,
  groupName,
  participants,
  localVideoRef,
  isAudioMuted,
  isVideoMuted,
  onToggleAudio,
  onToggleVideo,
  onLeave,
  activeFilter = 'none',
  activeBackground = 'none',
  onFilterChange,
  onBackgroundChange,
}: Props) {
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  useEffect(() => {
    if (!isOpen) { setCallSeconds(0); return; }
    const t = setInterval(() => setCallSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  if (!isOpen) return null;

  const participantList = Array.from(participants.values());
  const total = participantList.length + 1; // +1 por el usuario local

  // Determinar layout del grid
  const gridClass =
    total === 1 ? 'grid-cols-1' :
    total === 2 ? 'grid-cols-2' :
    total <= 4 ? 'grid-cols-2' :
    'grid-cols-3';

  return (
    <div className="fixed inset-0 z-50 bg-[#0d0d1a] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-black/30">
        <div>
          <p className="text-white font-semibold text-[15px]">{groupName}</p>
          <p className="text-[#b0b3b8] text-[13px]">
            {total} participante{total !== 1 ? 's' : ''} · {String(Math.floor(callSeconds / 60)).padStart(2, '0')}:{String(callSeconds % 60).padStart(2, '0')}
          </p>
        </div>
        <div className="flex items-center gap-1 text-green-400">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-[12px]">E2E</span>
        </div>
      </div>

      {/* Grid de participantes */}
      <div className={`flex-1 grid ${gridClass} gap-2 p-3 overflow-hidden`}>
        {/* Video local (siempre primero) */}
        <div className="relative rounded-xl overflow-hidden bg-[#1a1a2e] flex items-center justify-center">
          {isVideoMuted ? (
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white text-2xl font-semibold">
              {groupName[0]?.toUpperCase() || 'T'}
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
            <span className="text-white text-[13px] font-medium bg-black/40 px-2 py-0.5 rounded-full">
              Tú
            </span>
            {isAudioMuted && (
              <div className="bg-red-500/80 rounded-full p-0.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                  <line x1="2" y1="2" x2="22" y2="22" stroke="white" strokeWidth="3" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Tiles de otros participantes */}
        {participantList.map((p) => (
          <ParticipantTile key={p.userId} participant={p} />
        ))}
      </div>

      {/* Filter panel — positioned absolute inside the fixed root container */}
      {showFilterPanel && onFilterChange && onBackgroundChange && (
        <VideoFilterPanel
          activeFilter={activeFilter}
          activeBackground={activeBackground}
          onFilterChange={onFilterChange}
          onBackgroundChange={onBackgroundChange}
          onClose={() => setShowFilterPanel(false)}
        />
      )}

      {/* Barra de controles */}
      <div className="px-6 py-5 bg-black/40 flex items-center justify-center gap-5">
        {/* Toggle micrófono */}
        <button
          onClick={onToggleAudio}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
            isAudioMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/20 hover:bg-white/30'
          }`}
          title={isAudioMuted ? 'Activar micrófono' : 'Silenciar'}
        >
          {isAudioMuted ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Toggle cámara */}
        <button
          onClick={onToggleVideo}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
            isVideoMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/20 hover:bg-white/30'
          }`}
          title={isVideoMuted ? 'Activar cámara' : 'Apagar cámara'}
        >
          {isVideoMuted ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          )}
        </button>

        {/* Filtros de video */}
        {onFilterChange && (
          <button
            onClick={() => setShowFilterPanel(s => !s)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              showFilterPanel || activeFilter !== 'none' || activeBackground !== 'none'
                ? 'bg-[#0084ff] hover:bg-[#0070d8]'
                : 'bg-white/20 hover:bg-white/30'
            }`}
            title="Efectos de video"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
              <path d="M12 2L9.09 8.26L2 9.27L7 14.14L5.82 21.02L12 17.77L18.18 21.02L17 14.14L22 9.27L14.91 8.26L12 2Z"/>
            </svg>
          </button>
        )}

        {/* Colgar */}
        <button
          onClick={onLeave}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
          title="Salir de la llamada"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
