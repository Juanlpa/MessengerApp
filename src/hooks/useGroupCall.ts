'use client';

import { useState, useRef, useCallback } from 'react';
import { MeshManager, MeshParticipant } from '@/lib/webrtc/mesh-manager';

export type GroupCallState = 'idle' | 'connected';

export function useGroupCall(
  conversationId: string,
  userId: string,
  username: string,
  sharedKey: Uint8Array | null
) {
  const [callState, setCallState] = useState<GroupCallState>('idle');
  const [participants, setParticipants] = useState<Map<string, MeshParticipant>>(new Map());
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const managerRef = useRef<MeshManager | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const joinCall = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const manager = new MeshManager(conversationId, userId, username, (updated) => {
        setParticipants(new Map(updated));
      });

      managerRef.current = manager;
      await manager.join(stream, sharedKey);
      setCallState('connected');
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message?.includes('Máximo')) {
        alert(error.message);
      } else {
        alert('No se pudo acceder a la cámara/micrófono. Verifica los permisos.');
      }
    }
  }, [conversationId, userId, username, sharedKey]);

  const leaveCall = useCallback(() => {
    managerRef.current?.leave();
    managerRef.current = null;
    localStreamRef.current = null;
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
    const stream = localStreamRef.current ?? managerRef.current?.getLocalStream();
    const track = stream?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoMuted(!track.enabled);
    }
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
