import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

export type CallState = 'idle' | 'calling' | 'receiving' | 'connected';

interface SignalPayload {
  type: 'offer' | 'answer' | 'ice-candidate' | 'hangup';
  senderId: string;
  sdp?: any;
  candidate?: any;
}

export function useWebRTC(conversationId: string, currentUserId: string) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Inicializar servidor de señalización (Supabase Broadcast)
  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    channel.current = supabase.channel(`call_${conversationId}`);
    
    channel.current
      .on('broadcast', { event: 'signal' }, async ({ payload }) => {
        const signal = payload as SignalPayload;
        
        // Ignorar mis propios mensajes
        if (signal.senderId === currentUserId) return;

        if (signal.type === 'offer') {
          setCallState('receiving');
          // Guardar la oferta para cuando el usuario acepte
          peerConnection.current = createPeerConnection();
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'answer') {
          if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            setCallState('connected');
          }
        } else if (signal.type === 'ice-candidate') {
          if (peerConnection.current && signal.candidate) {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } else if (signal.type === 'hangup') {
          cleanup();
        }
      })
      .subscribe();

    return () => {
      channel.current?.unsubscribe();
      cleanup();
    };
  }, [conversationId, currentUserId]);

  const sendSignal = (payload: Omit<SignalPayload, 'senderId'>) => {
    if (channel.current) {
      channel.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: { ...payload, senderId: currentUserId },
      });
    }
  };

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: 'ice-candidate', candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStream.current = event.streams[0];
      } else {
        if (!remoteStream.current) {
          remoteStream.current = new MediaStream();
        }
        remoteStream.current.addTrack(event.track);
      }
      
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream.current) {
        remoteVideoRef.current.srcObject = remoteStream.current;
      }
    };

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current!);
      });
    }

    return pc;
  };

  const setupLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return true;
    } catch (err: any) {
      // Evitamos console.error para que Next.js no muestre el overlay rojo en dev
      console.warn('No se pudo acceder a la cámara/micrófono:', err.message);
      
      if (err.name === 'NotReadableError') {
        alert('Tu cámara está en uso por la otra ventana o aplicación. Para probar en la misma PC con dos ventanas, apaga la cámara de la primera ventana antes de contestar en la segunda.');
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
    peerConnection.current = createPeerConnection();

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

    sendSignal({ type: 'offer', sdp: offer });
  };

  const acceptCall = async () => {
    const ready = await setupLocalMedia();
    if (!ready) {
      rejectCall();
      return;
    }

    if (!peerConnection.current) return;

    // Agregar tracks locales que faltaban
    localStream.current!.getTracks().forEach((track) => {
      peerConnection.current!.addTrack(track, localStream.current!);
    });

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);

    sendSignal({ type: 'answer', sdp: answer });
    setCallState('connected');
  };

  const rejectCall = () => {
    sendSignal({ type: 'hangup' });
    cleanup();
  };

  const endCall = () => {
    sendSignal({ type: 'hangup' });
    cleanup();
  };

  const toggleAudio = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoMuted(!videoTrack.enabled);
      }
    }
  };

  const cleanup = useCallback(() => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }
    setCallState('idle');
    setIsAudioMuted(false);
    setIsVideoMuted(false);
    remoteStream.current = null;
  }, []);

  // Sincronizar el video si el componente se renderiza después del evento ontrack
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
