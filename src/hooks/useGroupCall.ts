'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { MeshManager, MeshParticipant } from '@/lib/webrtc/mesh-manager';

export type GroupCallState = 'idle' | 'connected';

export function useGroupCall(
  conversationId: string,
  userId: string,
  username: string,
  processStream?: (raw: MediaStream) => MediaStream
) {
  const [callState, setCallState] = useState<GroupCallState>('idle');
  const [participants, setParticipants] = useState<Map<string, MeshParticipant>>(new Map());
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const managerRef = useRef<MeshManager | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const isJoiningRef = useRef(false);

  // Callback ref — sobrevive al lazy-load del GroupCallModal (sin esto el
  // <video> local queda con srcObject=null si el modal monta después de joinCall).
  const setLocalVideoEl = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
      el.srcObject = localStreamRef.current;
    }
  }, []);

  // Si se pasa providedStream, se reutiliza (evita el bug de Chrome de stop+getUserMedia
  // inmediato que devuelve un track congelado al convertir 1-a-1 → grupal).
  const joinCall = useCallback(async (providedStream?: MediaStream) => {
    if (isJoiningRef.current || managerRef.current) return; // guard double-join
    isJoiningRef.current = true;
    let stream: MediaStream | null = null;
    try {
      stream = providedStream ?? await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      rawStreamRef.current = stream;
      const processedStream = processStream ? processStream(stream) : stream;
      localStreamRef.current = processedStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = processedStream;

      const manager = new MeshManager(conversationId, userId, username, (updated) => {
        setParticipants(new Map(updated));
      });

      managerRef.current = manager;
      // La clave de grupo se deriva del conversationId dentro del MeshManager.
      await manager.join(processedStream);
      setCallState('connected');
    } catch (err: unknown) {
      // Stop raw tracks so camera/mic LED turns off on any error
      stream?.getTracks().forEach((t) => t.stop());
      rawStreamRef.current = null;
      localStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      managerRef.current = null;
      const error = err as Error;
      if (error.message?.includes('Máximo')) {
        alert(error.message);
      } else if (error.message?.includes('subscription') || error.message?.includes('timed out')) {
        alert('Error de conexión con el canal de llamada. Por favor, inténtalo de nuevo.');
      } else {
        alert('No se pudo acceder a la cámara/micrófono. Verifica los permisos.');
      }
    } finally {
      isJoiningRef.current = false;
    }
  }, [conversationId, userId, username, processStream]);

  const leaveCall = useCallback(() => {
    managerRef.current?.leave();
    managerRef.current = null;
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setCallState('idle');
    setParticipants(new Map());
    setIsAudioMuted(false);
    setIsVideoMuted(false);
  }, []);

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current ?? managerRef.current?.getLocalStream();
    const track = stream?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsAudioMuted(!track.enabled);
    }
  }, []);

  const toggleVideo = useCallback(() => {
    // Toggle raw camera track (canvas capture track enabled flag has no effect on camera)
    const stream = rawStreamRef.current ?? localStreamRef.current ?? managerRef.current?.getLocalStream();
    const track = stream?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoMuted(!track.enabled);
    }
  }, []);

  /**
   * Re-procesa el video local con el filtro/fondo actual y lo reemplaza en
   * todos los peers del mesh. Llamar después de cambiar filtro/fondo.
   */
  const refreshVideoProcessing = useCallback(() => {
    const raw = rawStreamRef.current;
    if (!raw || !managerRef.current) return;

    const processed = processStream ? processStream(raw) : raw;
    const newVideoTrack = processed.getVideoTracks()[0];
    if (!newVideoTrack) return;

    // Preservar estado de mute
    const prev = localStreamRef.current?.getVideoTracks()[0];
    if (prev && newVideoTrack !== prev) newVideoTrack.enabled = prev.enabled;

    const audioTracks = localStreamRef.current?.getAudioTracks() ?? raw.getAudioTracks();
    const merged = new MediaStream([newVideoTrack, ...audioTracks]);
    localStreamRef.current = merged;

    managerRef.current.replaceLocalVideoTrack(newVideoTrack);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = merged;
      localVideoRef.current.play().catch(() => {});
    }
  }, [processStream]);

  // Cleanup al desmontar el componente para liberar cámara/mic y canal Supabase
  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.leave();
        managerRef.current = null;
      }
      if (rawStreamRef.current) {
        rawStreamRef.current.getTracks().forEach((t) => t.stop());
        rawStreamRef.current = null;
      }
      localStreamRef.current = null;
    };
  }, []);

  return {
    callState,
    participants,
    localVideoRef: setLocalVideoEl,
    isAudioMuted,
    isVideoMuted,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    refreshVideoProcessing,
  };
}
