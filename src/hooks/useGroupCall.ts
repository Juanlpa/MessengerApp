'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { MeshManager, MeshParticipant } from '@/lib/webrtc/mesh-manager';

export type GroupCallState = 'idle' | 'connected';

export function useGroupCall(
  conversationId: string,
  userId: string,
  username: string,
  sharedKey: Uint8Array | null,
  processStream?: (raw: MediaStream) => MediaStream
) {
  const [callState, setCallState] = useState<GroupCallState>('idle');
  const [participants, setParticipants] = useState<Map<string, MeshParticipant>>(new Map());
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const managerRef = useRef<MeshManager | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const isJoiningRef = useRef(false);

  const joinCall = useCallback(async () => {
    if (isJoiningRef.current || managerRef.current) return; // guard double-join
    isJoiningRef.current = true;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      rawStreamRef.current = stream;
      const processedStream = processStream ? processStream(stream) : stream;
      localStreamRef.current = processedStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = processedStream;

      const manager = new MeshManager(conversationId, userId, username, (updated) => {
        setParticipants(new Map(updated));
      });

      managerRef.current = manager;
      await manager.join(processedStream, sharedKey);
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
      } else {
        alert('No se pudo acceder a la cámara/micrófono. Verifica los permisos.');
      }
    } finally {
      isJoiningRef.current = false;
    }
  }, [conversationId, userId, username, sharedKey]);

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
    localVideoRef,
    isAudioMuted,
    isVideoMuted,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
  };
}
