import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  isInsertableStreamsSupported,
  setupSenderTransform,
  setupReceiverTransform,
  KeyContainer,
} from '@/lib/webrtc/insertable-streams';
import { deriveHourlyKey } from '@/lib/webrtc/frame-crypto';
import { startRingtone, stopRingtone as stopRingtoneFn } from '@/lib/audio/ringtone';

export type CallState =
  | 'idle'
  | 'calling'
  | 'receiving'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'declined'
  | 'missed'
  | 'failed';

interface SignalPayload {
  type: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'reject' | 'upgrade-to-group';
  senderId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  audioOnly?: boolean;
  callId?: string;
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

/** States that show briefly in the UI before the modal auto-closes */
const TRANSITIONAL_STATES = new Set<CallState>(['ended', 'declined', 'missed', 'failed']);
const TRANSITION_DELAY_MS = 2000;
const MISSED_CALL_TIMEOUT_MS = 30_000;
const MAX_PENDING_CANDIDATES = 100;
const KEY_ROTATION_INTERVAL_MS = 3_600_000;

/** Maps UI call states to DB status values */
const DB_STATUS_MAP: Partial<Record<CallState, string>> = {
  ended: 'ended',
  declined: 'rejected',
  missed: 'missed',
  failed: 'ended',
};

export function useWebRTC(
  conversationId: string,
  currentUserId: string,
  otherUserId?: string,
  currentUsername?: string,
  token?: string,
  sharedKey?: Uint8Array | null,
  enabled = true,
  onUpgradeToGroup?: () => void | Promise<void>,
  processStream?: (raw: MediaStream) => MediaStream
) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const isAudioOnlyRef = useRef(false);
  const callStateRef = useRef<CallState>('idle');

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const sharedKeyRef = useRef<Uint8Array | null | undefined>(sharedKey);
  sharedKeyRef.current = sharedKey;

  const keyContainersRef = useRef<KeyContainer[]>([]);
  const keyRotationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hourlyKeyCacheRef = useRef<{ hourIndex: number; key: CryptoKey } | null>(null);
  // Queue for ICE candidates that arrive before setRemoteDescription completes
  // Capped at MAX_PENDING_CANDIDATES to avoid unbounded growth on bad networks
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  // Raw getUserMedia stream — separate from localStream (which may be the processed/canvas stream)
  const rawStreamRef = useRef<MediaStream | null>(null);
  const onUpgradeToGroupRef = useRef(onUpgradeToGroup);
  onUpgradeToGroupRef.current = onUpgradeToGroup;
  const missedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Use a ref so ICE handlers and effects can always call the latest cleanup
  const cleanupRef = useRef<((status?: string, durationSecs?: number) => Promise<void>) | null>(null);

  const isE2EMedia = isInsertableStreamsSupported();

  const stopRingtone = useCallback(() => stopRingtoneFn(), []);
  const playRingtone = useCallback(() => startRingtone(), []);

  const setCallStateSafe = useCallback((state: CallState) => {
    callStateRef.current = state;
    setCallState(state);
  }, []);

  const saveCallRecord = useCallback(async (status: string, durationSecs?: number) => {
    if (!token) return;
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

  const joinCallRecord = useCallback(async () => {
    if (!token || !callIdRef.current) return;
    try {
      await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ callId: callIdRef.current, action: 'join' }),
      });
    } catch {}
  }, [token]);

  const getHourlyKey = useCallback(async (rawKey: Uint8Array): Promise<CryptoKey> => {
    const hourIndex = Math.floor(Date.now() / 3_600_000);
    if (hourlyKeyCacheRef.current?.hourIndex === hourIndex) {
      return hourlyKeyCacheRef.current.key;
    }
    const key = await deriveHourlyKey(rawKey);
    hourlyKeyCacheRef.current = { hourIndex, key };
    return key;
  }, []);

  const startKeyRotation = useCallback(() => {
    if (keyRotationIntervalRef.current) clearInterval(keyRotationIntervalRef.current);
    keyRotationIntervalRef.current = setInterval(async () => {
      if (!sharedKeyRef.current || keyContainersRef.current.length === 0) return;
      try {
        hourlyKeyCacheRef.current = null; // invalidate cache so next call derives a fresh key
        const newKey = await deriveHourlyKey(sharedKeyRef.current);
        hourlyKeyCacheRef.current = { hourIndex: Math.floor(Date.now() / 3_600_000), key: newKey };
        for (const container of keyContainersRef.current) {
          container.current = newKey;
        }
      } catch {}
    }, KEY_ROTATION_INTERVAL_MS);
  }, []);

  // Signal channel — one per conversation
  useEffect(() => {
    if (!conversationId || !currentUserId || !enabled) return;

    channel.current = supabase.channel(`call_${conversationId}`);

    channel.current
      .on('broadcast', { event: 'signal' }, async ({ payload }) => {
        const signal = payload as SignalPayload;
        if (signal.senderId === currentUserId) return;

        if (signal.type === 'offer') {
          stopRingtone();
          isAudioOnlyRef.current = signal.audioOnly ?? false;
          setIsAudioOnly(signal.audioOnly ?? false);
          if (signal.callId) callIdRef.current = signal.callId;
          setCallStateSafe('receiving');
          pendingCandidatesRef.current = [];
          peerConnection.current = createPeerConnection();
          await peerConnection.current.setRemoteDescription(
            new RTCSessionDescription(signal.sdp!)
          );
          // Flush any ICE candidates that arrived before remote description was ready
          for (const c of pendingCandidatesRef.current) {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingCandidatesRef.current = [];
        } else if (signal.type === 'answer') {
          if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(
              new RTCSessionDescription(signal.sdp!)
            );
            // Flush queued ICE candidates (offerer side)
            for (const c of pendingCandidatesRef.current) {
              await peerConnection.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            pendingCandidatesRef.current = [];
            stopRingtone();
            if (missedTimeoutRef.current) clearTimeout(missedTimeoutRef.current);
            setCallStateSafe('connected');
            callStartTimeRef.current = Date.now();
            await saveCallRecord('connected');
          }
        } else if (signal.type === 'ice-candidate') {
          if (peerConnection.current && signal.candidate) {
            const state = peerConnection.current.remoteDescription;
            if (state) {
              await peerConnection.current.addIceCandidate(
                new RTCIceCandidate(signal.candidate)
              ).catch(() => {});
            } else if (pendingCandidatesRef.current.length < MAX_PENDING_CANDIDATES) {
              pendingCandidatesRef.current.push(signal.candidate);
            }
          }
        } else if (signal.type === 'hangup') {
          stopRingtone();
          cleanupRef.current?.('ended');
        } else if (signal.type === 'reject') {
          stopRingtone();
          cleanupRef.current?.('declined');
        } else if (signal.type === 'upgrade-to-group') {
          // The other party added a third person — end 1-to-1 and join group call
          stopRingtone();
          await cleanupRef.current?.();
          try {
            await onUpgradeToGroupRef.current?.();
          } catch {
            // getUserMedia failed; user is left in idle with no active call
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel.current!);
      // On unmount during an active call, save the record as ended
      if (callStateRef.current !== 'idle') cleanupRef.current?.('ended');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, currentUserId, enabled]);

  const sendSignal = useCallback((payload: Omit<SignalPayload, 'senderId'>) => {
    channel.current?.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...payload, senderId: currentUserId },
    });
  }, [currentUserId]);

  const notifyGlobalChannel = useCallback(async (
    targetUserId: string,
    event: string,
    data: object
  ) => {
    const globalCh = supabase.channel(`call_global_${targetUserId}`);
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        supabase.removeChannel(globalCh);
        resolve();
      }, 3000);

      globalCh.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          globalCh.send({ type: 'broadcast', event, payload: data });
          setTimeout(() => {
            clearTimeout(timeout);
            supabase.removeChannel(globalCh);
            resolve();
          }, 500);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          supabase.removeChannel(globalCh);
          resolve();
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

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'disconnected' || state === 'checking') {
        if (callStateRef.current === 'connected') {
          setCallStateSafe('reconnecting');
        }
      } else if (state === 'connected' || state === 'completed') {
        if (callStateRef.current === 'reconnecting') {
          setCallStateSafe('connected');
        }
      } else if (state === 'failed') {
        cleanupRef.current?.('failed');
      }
    };

    pc.ontrack = async (event) => {
      if (sharedKeyRef.current && isInsertableStreamsSupported()) {
        try {
          const hourKey = await getHourlyKey(sharedKeyRef.current);
          // Guard: abort if this PC was replaced by cleanup or a new call
          if (peerConnection.current !== pc) return;
          const container = await setupReceiverTransform(event.receiver, hourKey);
          if (peerConnection.current !== pc) return;
          keyContainersRef.current.push(container);
        } catch {}
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
      localStream.current.getTracks().forEach(async (track) => {
        const sender = pc.addTrack(track, localStream.current!);
        if (sharedKeyRef.current && isInsertableStreamsSupported()) {
          try {
            const hourKey = await getHourlyKey(sharedKeyRef.current);
            // Guard: abort if this PC was replaced by cleanup or a new call
            if (peerConnection.current !== pc) return;
            const container = await setupSenderTransform(sender, hourKey);
            if (peerConnection.current !== pc) return;
            keyContainersRef.current.push(container);
          } catch {}
        }
      });
    }

    return pc;
  }, [sendSignal, setCallStateSafe]);

  const setupLocalMedia = async (audioOnly = false) => {
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({ video: !audioOnly, audio: true });
      rawStreamRef.current = rawStream;
      const stream = (!audioOnly && processStream) ? processStream(rawStream) : rawStream;
      localStream.current = stream;
      if (!audioOnly && localVideoRef.current) localVideoRef.current.srcObject = stream;
      return true;
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      console.warn('No se pudo acceder al micrófono/cámara:', error.message);
      if (error.name === 'NotReadableError') {
        alert('El micrófono o cámara está en uso por otra ventana o aplicación.');
      } else {
        alert('No se pudo acceder al micrófono. Verifica los permisos.');
      }
      return false;
    }
  };

  const initiateCall = async (audioOnly = false) => {
    const ready = await setupLocalMedia(audioOnly);
    if (!ready) return;

    isAudioOnlyRef.current = audioOnly;
    setIsAudioOnly(audioOnly);
    setCallStateSafe('calling');
    playRingtone();
    peerConnection.current = createPeerConnection();

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

    // Create call record first to get callId, then include it in the offer
    await saveCallRecord('initiated');
    sendSignal({ type: 'offer', sdp: offer, audioOnly, callId: callIdRef.current ?? undefined });

    startKeyRotation();

    // 30s timeout — if no answer, mark as missed (clear any previous timeout first)
    if (missedTimeoutRef.current) clearTimeout(missedTimeoutRef.current);
    missedTimeoutRef.current = setTimeout(() => {
      if (callStateRef.current === 'calling') {
        cleanupRef.current?.('missed');
      }
    }, MISSED_CALL_TIMEOUT_MS);

    if (otherUserId && currentUsername) {
      await notifyGlobalChannel(otherUserId, 'incoming-call', {
        conversationId,
        callerId: currentUserId,
        callerName: currentUsername,
        callId: callIdRef.current,
        isAudioOnly: audioOnly,
      });
    }
  };

  const acceptCall = async () => {
    const ready = await setupLocalMedia(isAudioOnlyRef.current);
    if (!ready) {
      rejectCall();
      return;
    }
    if (!peerConnection.current) return;

    const currentPc = peerConnection.current;
    // Use Promise.all so all transforms are set up BEFORE creating the answer SDP
    await Promise.all(localStream.current!.getTracks().map(async (track) => {
      const sender = currentPc!.addTrack(track, localStream.current!);
      if (sharedKeyRef.current && isInsertableStreamsSupported()) {
        try {
          const hourKey = await getHourlyKey(sharedKeyRef.current);
          if (peerConnection.current !== currentPc) return;
          const container = await setupSenderTransform(sender, hourKey);
          if (peerConnection.current !== currentPc) return;
          keyContainersRef.current.push(container);
        } catch {}
      }
    }));

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);
    sendSignal({ type: 'answer', sdp: answer });
    setCallStateSafe('connected');
    callStartTimeRef.current = Date.now();

    await joinCallRecord();
    startKeyRotation();
  };

  const rejectCall = useCallback(() => {
    sendSignal({ type: 'reject' });
    cleanupRef.current?.(); // local rejection — go to idle immediately
  }, [sendSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Invita a un contacto a unirse a esta llamada, convirtiéndola en grupal.
   * Señala al participante actual para que migre al canal mesh, luego limpia la llamada 1-a-1.
   * El llamador debe iniciar la llamada grupal (joinGroupCall) después de llamar esto.
   */
  const inviteToCall = useCallback(async (contactId: string, _contactName: string) => {
    // Signal current peer to switch to group call
    sendSignal({ type: 'upgrade-to-group' });

    // Notify the new contact in parallel with the propagation delay
    const [,] = await Promise.all([
      notifyGlobalChannel(contactId, 'incoming-call', {
        conversationId,
        callerId: currentUserId,
        callerName: currentUsername ?? currentUserId,
        callId: callIdRef.current,
      }),
      // Wait for upgrade-to-group signal to reach Bob before tearing down the channel
      new Promise<void>(resolve => setTimeout(resolve, 1000)),
    ]);

    const duration = callStartTimeRef.current
      ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
      : undefined;
    await cleanupRef.current?.(undefined, duration);
  }, [sendSignal, notifyGlobalChannel, conversationId, currentUserId, currentUsername]); // eslint-disable-line react-hooks/exhaustive-deps

  const endCall = useCallback(() => {
    sendSignal({ type: 'hangup' });
    const duration = callStartTimeRef.current
      ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
      : undefined;
    cleanupRef.current?.('ended', duration);
  }, [sendSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const cleanup = useCallback(async (status?: string, durationSecs?: number) => {
    stopRingtone();
    if (missedTimeoutRef.current) clearTimeout(missedTimeoutRef.current);
    if (keyRotationIntervalRef.current) clearInterval(keyRotationIntervalRef.current);
    keyRotationIntervalRef.current = null;
    keyContainersRef.current = [];

    // Persist to DB — map UI state names to DB-valid statuses
    if (status) {
      const dbStatus = DB_STATUS_MAP[status as CallState];
      if (dbStatus) await saveCallRecord(dbStatus, durationSecs);
    }

    peerConnection.current?.close();
    peerConnection.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
    remoteStream.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    callIdRef.current = null;
    callStartTimeRef.current = null;
    isAudioOnlyRef.current = false;
    setIsAudioMuted(false);
    setIsVideoMuted(false);
    setIsAudioOnly(false);

    // Show terminal states briefly, then auto-close the modal
    if (status && TRANSITIONAL_STATES.has(status as CallState)) {
      setCallStateSafe(status as CallState);
      setTimeout(() => setCallStateSafe('idle'), TRANSITION_DELAY_MS);
    } else {
      setCallStateSafe('idle');
    }
  }, [stopRingtone, saveCallRecord, setCallStateSafe]);

  // Keep cleanupRef current so ICE handlers / timeouts always call the latest version
  useEffect(() => {
    cleanupRef.current = cleanup;
  }, [cleanup]);

  const toggleAudio = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsAudioMuted(!track.enabled);
    }
  };

  const toggleVideo = () => {
    // Toggle raw camera track (canvas capture track enabled flag has no effect on camera)
    const track = (rawStreamRef.current ?? localStream.current)?.getVideoTracks()[0];
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

  const forceIdle = useCallback(() => setCallStateSafe('idle'), [setCallStateSafe]);

  return {
    callState,
    localVideoRef,
    remoteVideoRef,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    forceIdle,
    inviteToCall,
    toggleAudio,
    toggleVideo,
    isAudioMuted,
    isVideoMuted,
    isAudioOnly,
    isE2EMedia,
  };
}
