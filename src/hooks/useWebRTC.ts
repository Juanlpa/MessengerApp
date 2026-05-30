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
import { useCallStore } from '@/stores/call-store';

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
  type: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'reject' | 'upgrade-to-group' | 'call-request';
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

  // Refs internos para el código del hook (acceso síncrono al element)
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Callback refs que se pasan al CallModal. Cuando React monta el <video>
  // (CallModal es lazy-loaded — el ref no existe en el momento de setupLocalMedia),
  // este callback dispara la asignación de srcObject inmediatamente.
  // Sin esto: el <video> se monta con srcObject=null y se queda en negro.
  const setLocalVideoEl = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el && localStream.current && el.srcObject !== localStream.current) {
      el.srcObject = localStream.current;
      el.play().catch(() => {});
    }
  }, []);

  const setRemoteVideoEl = useCallback((el: HTMLVideoElement | null) => {
    remoteVideoRef.current = el;
    if (el && remoteStream.current && el.srcObject !== remoteStream.current) {
      el.srcObject = remoteStream.current;
      // play() explícito — autoPlay con audio puede bloquearse sin user gesture
      el.play().catch(() => {});
    }
  }, []);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  // Sender del track de video — para replaceTrack al activar/desactivar filtros en vivo
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
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
  // Última oferta enviada por el llamante — para reenviarla si el receptor la
  // pide (aceptó desde el banner sin haber estado suscrito al canal).
  const lastOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  // Ref a acceptCall para poder auto-aceptar desde el handler de signals.
  const acceptCallRef = useRef<(() => Promise<void>) | null>(null);

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

  /**
   * Lookup SÍNCRONO de la clave horaria — usar SOLO en handlers críticos
   * (pc.ontrack) donde un microtask `await` cede el event loop y deja pasar
   * frames cifrados al decoder, congelando el codec de video.
   * Devuelve null si la clave aún no está derivada; en ese caso, el caller
   * debe usar el flujo async normal o saltar el cifrado.
   */
  const getHourlyKeySync = useCallback((): CryptoKey | null => {
    const hourIndex = Math.floor(Date.now() / 3_600_000);
    if (hourlyKeyCacheRef.current?.hourIndex === hourIndex) {
      return hourlyKeyCacheRef.current.key;
    }
    return null;
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

        if (signal.type === 'call-request') {
          // El receptor (que aceptó desde el banner) pide la oferta de nuevo
          // porque no estaba suscrito cuando se envió. Reenviarla si seguimos
          // llamando.
          if (callStateRef.current === 'calling' && lastOfferRef.current) {
            sendSignal({
              type: 'offer',
              sdp: lastOfferRef.current,
              audioOnly: isAudioOnlyRef.current,
              callId: callIdRef.current ?? undefined,
            });
          }
          return;
        }

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

          // Si aceptamos esta llamada desde el banner, aceptar automáticamente
          const autoAcceptId = useCallStore.getState().pendingAcceptCall;
          if (autoAcceptId === conversationId) {
            useCallStore.getState().setPendingAcceptCall(null);
            await acceptCallRef.current?.();
          }
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
      .subscribe((status) => {
        // Si entramos al chat tras aceptar una llamada desde el banner, pedir
        // al llamante que reenvíe la oferta (la original se perdió porque no
        // estábamos suscritos a este canal).
        if (status === 'SUBSCRIBED' && useCallStore.getState().pendingAcceptCall === conversationId) {
          sendSignal({ type: 'call-request' });
        }
      });

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

    // pc.ontrack es síncrono — configurar el receiver transform ANTES del
    // primer frame para no congelar el decoder. La clave debe estar pre-derivada
    // por initiateCall/acceptCall (getHourlyKey llamado antes del SDP exchange).
    pc.ontrack = (event) => {
      if (sharedKeyRef.current && isInsertableStreamsSupported()) {
        const hourKey = getHourlyKeySync();
        if (hourKey) {
          try {
            const container = setupReceiverTransform(event.receiver, hourKey);
            keyContainersRef.current.push(container);
          } catch {}
        } else {
          // Fallback raro — la clave debió estar lista. Lo intentamos async
          // pero los frames iniciales pasarán cifrados (codec puede congelarse).
          getHourlyKey(sharedKeyRef.current)
            .then((key) => {
              if (peerConnection.current !== pc) return;
              const container = setupReceiverTransform(event.receiver, key);
              keyContainersRef.current.push(container);
            })
            .catch(() => {});
        }
      }

      if (event.streams?.[0]) {
        remoteStream.current = event.streams[0];
      } else {
        if (!remoteStream.current) remoteStream.current = new MediaStream();
        remoteStream.current.addTrack(event.track);
      }
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream.current) {
        remoteVideoRef.current.srcObject = remoteStream.current;
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    // addTrack también necesita configurar el sender transform síncrono
    // antes de que se envíe el primer frame
    if (localStream.current) {
      const tracks = localStream.current.getTracks();
      for (const track of tracks) {
        const sender = pc.addTrack(track, localStream.current);
        // Guardar el sender de video para poder hacer replaceTrack al cambiar filtros
        if (track.kind === 'video') videoSenderRef.current = sender;
        if (sharedKeyRef.current && isInsertableStreamsSupported()) {
          const hourKey = getHourlyKeySync();
          if (hourKey) {
            try {
              const container = setupSenderTransform(sender, hourKey);
              keyContainersRef.current.push(container);
            } catch {}
          } else {
            getHourlyKey(sharedKeyRef.current)
              .then((key) => {
                if (peerConnection.current !== pc) return;
                const container = setupSenderTransform(sender, key);
                keyContainersRef.current.push(container);
              })
              .catch(() => {});
          }
        }
      }
    }

    return pc;
  }, [sendSignal, setCallStateSafe, getHourlyKey, getHourlyKeySync]);

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

    // Pre-derivar clave horaria — evita race condition donde el receiver transform
    // se configura tarde y los primeros frames cifrados llegan sin descifrar
    if (sharedKeyRef.current && isInsertableStreamsSupported()) {
      try { await getHourlyKey(sharedKeyRef.current); } catch {}
    }

    peerConnection.current = createPeerConnection();

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    lastOfferRef.current = offer; // guardar para reenviar si el receptor la pide

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

    // Pre-derivar clave horaria — evita race condition con los primeros frames
    if (sharedKeyRef.current && isInsertableStreamsSupported()) {
      try { await getHourlyKey(sharedKeyRef.current); } catch {}
    }

    const currentPc = peerConnection.current;
    // Clave horaria YA derivada (await arriba); usar lookup síncrono para
    // configurar el sender transform ANTES de crear la SDP answer.
    const hourKey = getHourlyKeySync();
    for (const track of localStream.current!.getTracks()) {
      const sender = currentPc!.addTrack(track, localStream.current!);
      if (track.kind === 'video') videoSenderRef.current = sender;
      if (sharedKeyRef.current && isInsertableStreamsSupported() && hourKey) {
        try {
          const container = setupSenderTransform(sender, hourKey);
          keyContainersRef.current.push(container);
        } catch {}
      }
    }

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);
    sendSignal({ type: 'answer', sdp: answer });
    setCallStateSafe('connected');
    callStartTimeRef.current = Date.now();

    await joinCallRecord();
    startKeyRotation();
  };

  // Mantener el ref actualizado para que el handler de signals pueda auto-aceptar
  acceptCallRef.current = acceptCall;

  const rejectCall = useCallback(() => {
    sendSignal({ type: 'reject' });
    cleanupRef.current?.(); // local rejection — go to idle immediately
  }, [sendSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Invita a un contacto a unirse a esta llamada, convirtiéndola en grupal.
   * Señala al participante actual para que migre al canal mesh, luego limpia la llamada 1-a-1.
   * El llamador debe iniciar la llamada grupal (joinGroupCall) después de llamar esto.
   */
  /**
   * Invita a un contacto a unirse a la llamada (1-a-1 → grupal).
   * NO hace cleanup automáticamente — el caller debe coordinar el cleanup
   * con joinGroupCall para evitar gap visual donde no se ve ningún modal.
   */
  const inviteToCall = useCallback(async (contactId: string, _contactName: string) => {
    // Signal current peer to switch to group call
    sendSignal({ type: 'upgrade-to-group' });

    // Notify the new contact — flag isGroupCall=true para que se una directo al canal mesh
    await Promise.all([
      notifyGlobalChannel(contactId, 'incoming-call', {
        conversationId,
        callerId: currentUserId,
        callerName: currentUsername ?? currentUserId,
        callId: callIdRef.current,
        isGroupCall: true,
        isAudioOnly: isAudioOnlyRef.current,
      }),
      // Wait for upgrade-to-group signal to reach Bob before tearing down the channel
      new Promise<void>(resolve => setTimeout(resolve, 1000)),
    ]);
  }, [sendSignal, notifyGlobalChannel, conversationId, currentUserId, currentUsername]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Cierra la llamada 1-a-1 sin enviar 'hangup' al peer (usar después de upgrade-to-group).
   * Devuelve un CLON del stream crudo de la cámara para reutilizarlo en la llamada
   * grupal — evita el patrón stop+getUserMedia inmediato (Chrome devuelve un track
   * congelado). El clon sobrevive al cleanup que detiene el stream original.
   */
  const endOneToOneCall = useCallback(async (): Promise<MediaStream | null> => {
    // Clonar la cámara cruda ANTES del cleanup; los clones son independientes
    // y siguen vivos aunque se detengan los tracks originales.
    let clonedStream: MediaStream | null = null;
    const raw = rawStreamRef.current;
    if (raw && !isAudioOnlyRef.current) {
      try {
        clonedStream = new MediaStream(raw.getTracks().map((t) => t.clone()));
      } catch {
        clonedStream = null;
      }
    }

    const duration = callStartTimeRef.current
      ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
      : undefined;
    await cleanupRef.current?.(undefined, duration);

    return clonedStream;
  }, []);

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
    videoSenderRef.current = null;
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

  /**
   * Re-procesa el video local con el filtro/fondo actual y reemplaza el track
   * en el sender vía replaceTrack(). Llamar después de cambiar filtro/fondo.
   *
   * El sender transform (Insertable Streams) se mantiene — está atado al sender,
   * no al track, así que replaceTrack conserva el cifrado E2E.
   */
  const refreshVideoProcessing = useCallback(() => {
    const raw = rawStreamRef.current;
    if (!raw || !videoSenderRef.current) return;
    if (isAudioOnlyRef.current) return; // sin video en llamadas de voz

    // Re-procesar el stream crudo con el filtro actual.
    // processStream devuelve el raw si no hay filtro, o un stream con canvas si lo hay.
    const processed = processStream ? processStream(raw) : raw;
    const newVideoTrack = processed.getVideoTracks()[0];
    if (!newVideoTrack) return;

    // Preservar el estado de mute al cambiar de track
    const prevVideoTrack = localStream.current?.getVideoTracks()[0];
    if (prevVideoTrack && newVideoTrack !== prevVideoTrack) {
      newVideoTrack.enabled = prevVideoTrack.enabled;
    }

    // Reconstruir localStream con el nuevo video track + el audio existente
    const audioTracks = localStream.current?.getAudioTracks() ?? raw.getAudioTracks();
    const merged = new MediaStream([newVideoTrack, ...audioTracks]);
    localStream.current = merged;

    // Reemplazar el track en el sender (mantiene el transform de cifrado)
    videoSenderRef.current.replaceTrack(newVideoTrack).catch(() => {});

    // Actualizar la vista previa local
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = merged;
      localVideoRef.current.play().catch(() => {});
    }
  }, [processStream]);

  return {
    callState,
    refreshVideoProcessing,
    // Devolvemos los callback refs para que CallModal/GroupCallModal usen.
    // Cuando React monta el <video>, el callback se invoca y el srcObject
    // se asigna inmediatamente — sobrevive al lazy-load de CallModal.
    localVideoRef: setLocalVideoEl,
    remoteVideoRef: setRemoteVideoEl,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    forceIdle,
    inviteToCall,
    endOneToOneCall,
    toggleAudio,
    toggleVideo,
    isAudioMuted,
    isVideoMuted,
    isAudioOnly,
    isE2EMedia,
  };
}
