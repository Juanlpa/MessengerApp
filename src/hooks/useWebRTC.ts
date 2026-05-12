import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';
import {
  isInsertableStreamsSupported,
  setupSenderTransform,
  setupReceiverTransform,
} from '@/lib/webrtc/insertable-streams';

export type CallState = 'idle' | 'calling' | 'receiving' | 'connected';

interface SignalPayload {
  type: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'reject';
  senderId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

function getRealtimeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function useWebRTC(
  conversationId: string,
  currentUserId: string,
  otherUserId?: string,
  currentUsername?: string,
  token?: string,
  sharedKey?: Uint8Array | null
) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const rtcClientRef = useRef(getRealtimeClient());
  const sharedKeyRef = useRef<Uint8Array | null | undefined>(sharedKey);
  sharedKeyRef.current = sharedKey;

  const stopRingtone = useCallback(() => {
    ringtoneRef.current?.pause();
    ringtoneRef.current = null;
  }, []);

  const playRingtone = useCallback(() => {
    try {
      const audio = new Audio('/ringtone.mp3');
      audio.loop = true;
      audio.volume = 0.5;
      audio.play().catch(() => {});
      ringtoneRef.current = audio;
    } catch {}
  }, []);

  const saveCallRecord = useCallback(async (status: string, durationSecs?: number) => {
    if (!token) return null;
    try {
      if (callIdRef.current) {
        await fetch('/api/calls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ callId: callIdRef.current, status, durationSeconds: durationSecs }),
        });
      } else {
        const res = await fetch('/api/calls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ conversationId, status }),
        });
        if (res.ok) {
          const data = await res.json();
          callIdRef.current = data.callId;
        }
      }
    } catch {}
  }, [token, conversationId]);

  // Canal de señalización de la conversación
  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    const rtcClient = rtcClientRef.current;
    channel.current = rtcClient.channel(`call_${conversationId}`);

    channel.current
      .on('broadcast', { event: 'signal' }, async ({ payload }) => {
        const signal = payload as SignalPayload;
        if (signal.senderId === currentUserId) return;

        if (signal.type === 'offer') {
          stopRingtone();
          setCallState('receiving');
          peerConnection.current = createPeerConnection();
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
        } else if (signal.type === 'answer') {
          if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
            stopRingtone();
            setCallState('connected');
            callStartTimeRef.current = Date.now();
            await saveCallRecord('connected');
          }
        } else if (signal.type === 'ice-candidate') {
          if (peerConnection.current && signal.candidate) {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } else if (signal.type === 'hangup') {
          stopRingtone();
          cleanup('ended');
        } else if (signal.type === 'reject') {
          stopRingtone();
          cleanup('rejected');
        }
      })
      .subscribe();

    return () => {
      rtcClient.removeChannel(channel.current!);
      cleanup('ended');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, currentUserId]);

  const sendSignal = useCallback((payload: Omit<SignalPayload, 'senderId'>) => {
    channel.current?.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...payload, senderId: currentUserId },
    });
  }, [currentUserId]);

  const notifyGlobalChannel = useCallback(async (targetUserId: string, event: string, data: object) => {
    const rtcClient = rtcClientRef.current;
    const globalCh = rtcClient.channel(`call_global_${targetUserId}`);
    await new Promise<void>((resolve) => {
      globalCh.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          globalCh.send({ type: 'broadcast', event, payload: data });
          setTimeout(() => {
            rtcClient.removeChannel(globalCh);
            resolve();
          }, 500);
        }
      });
    });
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: 'ice-candidate', candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      // Aplicar transform de descifrado si está soportado
      if (sharedKeyRef.current && isInsertableStreamsSupported()) {
        setupReceiverTransform(event.receiver, sharedKeyRef.current).catch(() => {});
      }

      if (event.streams?.[0]) {
        remoteStream.current = event.streams[0];
      } else {
        if (!remoteStream.current) remoteStream.current = new MediaStream();
        remoteStream.current.addTrack(event.track);
      }
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream.current) {
        remoteVideoRef.current.srcObject = remoteStream.current;
      }
    };

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, localStream.current!);
        // Aplicar transform de cifrado si está soportado
        if (sharedKeyRef.current && isInsertableStreamsSupported()) {
          setupSenderTransform(sender, sharedKeyRef.current).catch(() => {});
        }
      });
    }

    if (isInsertableStreamsSupported()) {
      console.info('[WebRTC] Insertable Streams activo — cifrado E2E de media habilitado');
    } else {
      console.info('[WebRTC] Insertable Streams no soportado — usando SRTP estándar');
    }

    return pc;
  }, [sendSignal]);

  const setupLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return true;
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      console.warn('No se pudo acceder a la cámara/micrófono:', error.message);
      if (error.name === 'NotReadableError') {
        alert('Tu cámara está en uso por otra ventana o aplicación.');
      } else {
        alert('No se pudo acceder a la cámara/micrófono. Verifica los permisos.');
      }
      return false;
    }
  };

  const initiateCall = async () => {
    const ready = await setupLocalMedia();
    if (!ready) return;

    setCallState('calling');
    playRingtone();
    peerConnection.current = createPeerConnection();

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    sendSignal({ type: 'offer', sdp: offer });

    // Crear registro de llamada y notificar al receptor globalmente
    await saveCallRecord('initiated');
    if (otherUserId && currentUsername) {
      await notifyGlobalChannel(otherUserId, 'incoming-call', {
        conversationId,
        callerId: currentUserId,
        callerName: currentUsername,
      });
    }
  };

  const acceptCall = async () => {
    const ready = await setupLocalMedia();
    if (!ready) {
      rejectCall();
      return;
    }
    if (!peerConnection.current) return;

    localStream.current!.getTracks().forEach((track) => {
      peerConnection.current!.addTrack(track, localStream.current!);
    });

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);
    sendSignal({ type: 'answer', sdp: answer });
    setCallState('connected');
    callStartTimeRef.current = Date.now();
  };

  const rejectCall = useCallback(() => {
    sendSignal({ type: 'reject' });
    cleanup('rejected');
  }, [sendSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const endCall = useCallback(() => {
    sendSignal({ type: 'hangup' });
    const duration = callStartTimeRef.current
      ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
      : undefined;
    cleanup('ended', duration);
  }, [sendSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const cleanup = useCallback(async (status?: string, durationSecs?: number) => {
    stopRingtone();
    if (status && (status === 'ended' || status === 'rejected' || status === 'missed')) {
      await saveCallRecord(status, durationSecs);
    }
    peerConnection.current?.close();
    peerConnection.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    remoteStream.current = null;
    callIdRef.current = null;
    callStartTimeRef.current = null;
    setCallState('idle');
    setIsAudioMuted(false);
    setIsVideoMuted(false);
  }, [stopRingtone, saveCallRecord]);

  const toggleAudio = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsAudioMuted(!track.enabled);
    }
  };

  const toggleVideo = () => {
    const track = localStream.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoMuted(!track.enabled);
    }
  };

  useEffect(() => {
    if (callState === 'connected' || callState === 'calling') {
      if (remoteVideoRef.current && remoteStream.current && remoteVideoRef.current.srcObject !== remoteStream.current) {
        remoteVideoRef.current.srcObject = remoteStream.current;
      }
      if (localVideoRef.current && localStream.current && localVideoRef.current.srcObject !== localStream.current) {
        localVideoRef.current.srcObject = localStream.current;
      }
    }
  }, [callState]);

  return {
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
  };
}
