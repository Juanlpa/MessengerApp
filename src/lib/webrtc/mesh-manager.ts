/**
 * mesh-manager.ts — Gestión de llamadas grupales en topología mesh
 *
 * Cada participante mantiene N-1 RTCPeerConnections (una por cada otro participante).
 * La señalización se hace via Supabase Broadcast en el canal group_call_${conversationId}.
 *
 * Descubrimiento de participantes: Supabase Presence (track/untrack + sync).
 *   - Cada peer hace channel.track({ userId, username }) al suscribirse.
 *   - 'sync' entrega la lista completa de presentes → todos se descubren sin
 *     depender del timing de un broadcast.
 *
 * Señalización WebRTC (broadcast dirigido):
 *   offer      { from, to, sdp, username }
 *   answer     { from, to, sdp }
 *   ice        { from, to, candidate }
 *
 * Anti-glare: en cada par de peers solo el de userId MENOR crea la oferta.
 * El de userId mayor espera la oferta y responde con answer. Esto evita que
 * ambos oferten a la vez (que provocaría "Called in wrong state: stable").
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import {
  isInsertableStreamsSupported,
  setupSenderTransform,
  setupReceiverTransform,
} from './insertable-streams';
import { deriveHourlyKey } from './frame-crypto';
import { buildIceServers, ensureTurnCredentials } from './ice-servers';

export interface MeshParticipant {
  userId: string;
  username: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isSpeaking: boolean;
}

type OnParticipantsChange = (participants: Map<string, MeshParticipant>) => void;

// DECISIÓN DE DISEÑO: las llamadas grupales NO usan cifrado de frames manual
// (Insertable Streams). Razones:
//   1. El media YA va cifrado E2E por DTLS-SRTP — obligatorio en WebRTC. En la
//      topología mesh (peer-to-peer directo) el SRTP cifra de extremo a extremo
//      entre los participantes; el TURN solo reenvía paquetes SRTP opacos.
//   2. El cifrado de frames manual era REDUNDANTE en mesh y corrompía el media
//      cuando el mismo track local se enviaba a múltiples peers (doble proceso).
// Las llamadas 1-a-1 (useWebRTC) SÍ mantienen cifrado de frames manual con la
// shared key DH de la conversación, donde aporta valor y funciona correctamente.
const GROUP_CALL_FRAME_ENCRYPTION = false;

// Los ICE servers se construyen AL CREAR cada conexión (buildIceServers()), no
// aquí, porque las credenciales TURN de Cloudflare se cargan async tras importar
// el módulo. A nivel de módulo siempre se usaría el fallback (openrelay).

const MAX_VIDEO_PARTICIPANTS = 4;
const MAX_AUDIO_PARTICIPANTS = 8;

export class MeshManager {
  private peers = new Map<string, RTCPeerConnection>();
  private participants = new Map<string, MeshParticipant>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private channel: RealtimeChannel | null = null;
  private localStream: MediaStream | null = null;
  private sharedKey: Uint8Array | null = null;
  private analyserNodes = new Map<string, AnalyserNode>();
  private audioContext: AudioContext | null = null;
  private speakingInterval: ReturnType<typeof setInterval> | null = null;
  // Guardamos el CryptoKey resuelto (no la Promise) para lookups síncronos
  // desde pc.ontrack y addTrack, donde un microtask `await` cede el event loop
  // y deja pasar frames cifrados al decoder (congela el codec de video).
  private hourlyKeyCache: { hourIndex: number; key: CryptoKey } | null = null;
  private hourlyKeyDerivation: Promise<CryptoKey> | null = null;
  private onParticipantsChange: OnParticipantsChange;

  constructor(
    private conversationId: string,
    private userId: string,
    private username: string,
    onParticipantsChange: OnParticipantsChange
  ) {
    this.onParticipantsChange = onParticipantsChange;
  }

  async join(localStream: MediaStream) {
    const videoTracks = localStream.getVideoTracks().length;
    const currentSize = this.participants.size + 1;

    if (videoTracks > 0 && currentSize > MAX_VIDEO_PARTICIPANTS) {
      throw new Error(`Máximo ${MAX_VIDEO_PARTICIPANTS} participantes con video`);
    }
    if (currentSize > MAX_AUDIO_PARTICIPANTS) {
      throw new Error(`Máximo ${MAX_AUDIO_PARTICIPANTS} participantes en llamada`);
    }

    this.localStream = localStream;

    // Garantizar credenciales TURN (Cloudflare) antes de crear conexiones mesh
    await ensureTurnCredentials();

    // CLAVE DE GRUPO derivada del conversationId (cifrado manual).
    // A diferencia de las llamadas 1-a-1 (que usan la sharedKey DH de la
    // conversación), aquí todos los participantes derivan la MISMA clave a
    // partir del conversationId — que todos conocen porque es el nombre del
    // canal mesh. Esto permite que un invitado externo (que no tiene la
    // sharedKey de la conversación) cifre/descifre igual que los demás.
    // Sigue siendo cifrado manual: frame-crypto.ts (AES-GCM) + HKDF horario.
    this.sharedKey = new TextEncoder().encode(`messenger-group-call-v1:${this.conversationId}`);

    // Pre-derivar la clave horaria — evita race condition donde llegan
    // frames cifrados antes de que el receiver transform esté listo
    if (isInsertableStreamsSupported()) {
      try { await this.getHourlyKey(); } catch {}
    }

    // setupSignaling() crea el canal, lo suscribe y registra presencia.
    await this.setupSignaling();

    this.startSpeakingDetection();
  }

  private async setupSignaling() {
    // Limpiar canales previos con el mismo topic (re-entrada después de desconexión)
    const topic = `realtime:group_call_${this.conversationId}`;
    supabase.getChannels()
      .filter(ch => ch.topic === topic)
      .forEach(ch => supabase.removeChannel(ch));

    this.channel = supabase.channel(`group_call_${this.conversationId}`, {
      config: {
        broadcast: { self: false },
        // Presence mantiene de forma confiable la lista de quién está en el
        // canal — no depende del timing de un broadcast 'join' (frágil: si el
        // otro aún no se suscribió, pierde el anuncio). Cada vez que cambia la
        // membresía, todos reciben 'sync' con el estado completo.
        presence: { key: this.userId },
      },
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel!.presenceState<{ userId: string; username: string }>();
        // state: { [presenceKey]: [{ userId, username }, ...] }
        for (const key of Object.keys(state)) {
          const meta = state[key]?.[0];
          const peerId = meta?.userId ?? key;
          if (peerId === this.userId) continue;

          this.addParticipant(peerId, meta?.username ?? '');

          // TIE-BREAK contra glare: en cada par (A,B) solo el de userId MENOR
          // crea la oferta. El guard en createOffer evita duplicados si 'sync'
          // se dispara varias veces.
          if (this.userId < peerId) {
            this.createOffer(peerId);
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        const peerId = (leftPresences?.[0] as { userId?: string } | undefined)?.userId ?? key;
        this.removePeer(peerId);
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        const { from, to, sdp, username } = payload as { from: string; to: string; sdp: RTCSessionDescriptionInit; username?: string };
        if (to !== this.userId) return;

        this.addParticipant(from, username || '');
        const pc = this.getOrCreatePeer(from);

        // Guard contra glare: solo aceptar una oferta si NO tenemos una propia
        // pendiente. Con el tie-break esto no debería ocurrir, pero protege
        // ante reentradas/reconexiones.
        if (pc.signalingState !== 'stable') return;

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));

          const queued = this.pendingCandidates.get(from) ?? [];
          this.pendingCandidates.set(from, []);
          for (const c of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.send('answer', { from: this.userId, to: from, sdp: answer });
        } catch {
          // Estado inválido (glare residual) — ignorar; el tie-break reintenta
        }
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        const { from, to, sdp } = payload as { from: string; to: string; sdp: RTCSessionDescriptionInit };
        if (to !== this.userId) return;

        const pc = this.peers.get(from);
        if (!pc) return;

        // Solo aplicar el answer si estamos esperando uno (have-local-offer).
        // Si ya estamos 'stable', el answer es duplicado/tardío → ignorar para
        // evitar "Failed to set remote answer sdp: Called in wrong state: stable".
        if (pc.signalingState !== 'have-local-offer') return;

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));

          const queued = this.pendingCandidates.get(from) ?? [];
          this.pendingCandidates.set(from, []);
          for (const c of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
        } catch {
          // Estado inválido — ignorar
        }
      })
      .on('broadcast', { event: 'ice' }, async ({ payload }) => {
        const { from, to, candidate } = payload as { from: string; to: string; candidate: RTCIceCandidateInit };
        if (to !== this.userId) return;

        const pc = this.peers.get(from);
        if (!pc || !candidate) return;

        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        } else {
          // Queue candidate until setRemoteDescription completes
          const queue = this.pendingCandidates.get(from) ?? [];
          queue.push(candidate);
          this.pendingCandidates.set(from, queue);
        }
      });

    // Suscribir, registrar presencia y esperar la confirmación (timeout 10s)
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Realtime subscription timed out'));
      }, 10000);

      this.channel!.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          // Anunciar presencia — dispara 'sync' en todos (incluido yo mismo)
          await this.channel!.track({ userId: this.userId, username: this.username });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(err || new Error(`Realtime subscription failed: ${status}`));
        }
      });
    });
  }

  private addParticipant(userId: string, username: string) {
    if (!this.participants.has(userId)) {
      this.participants.set(userId, { userId, username, stream: null, isMuted: false, isSpeaking: false });
      this.notify();
    } else if (username) {
      // Crear NUEVO objeto (inmutable) — React.memo en ParticipantTile compara
      // por referencia; mutar in-place haría que el tile nunca se re-renderice.
      const p = this.participants.get(userId)!;
      this.participants.set(userId, { ...p, username });
      this.notify();
    }
  }

  private getOrCreatePeer(peerId: string): RTCPeerConnection {
    if (this.peers.has(peerId)) return this.peers.get(peerId)!;

    const pc = new RTCPeerConnection({ iceServers: buildIceServers() });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send('ice', { from: this.userId, to: peerId, candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams?.[0] ?? (() => {
        const s = new MediaStream();
        s.addTrack(e.track);
        return s;
      })();

      // Insertable Streams — descifrado SÍNCRONO (la clave debe estar
      // pre-derivada por join() antes del SDP exchange)
      if (GROUP_CALL_FRAME_ENCRYPTION && this.sharedKey && isInsertableStreamsSupported()) {
        const key = this.getHourlyKeySync();
        if (key) {
          try {
            setupReceiverTransform(e.receiver, key);
          } catch {}
        } else {
          // Fallback async — frames iniciales pueden congelar el codec
          this.getHourlyKey()
            .then((k) => {
              if (this.peers.get(peerId) !== pc) return;
              setupReceiverTransform(e.receiver, k);
            })
            .catch(() => {});
        }
      }

      const participant = this.participants.get(peerId);
      if (participant) {
        // NUEVO objeto (inmutable) para que React.memo detecte el cambio de stream
        this.participants.set(peerId, { ...participant, stream });
        this.notify();
        this.setupSpeakingDetection(peerId, stream);
      } else {
        // ontrack llegó antes de registrar al participante (raro) — crearlo
        this.participants.set(peerId, { userId: peerId, username: '', stream, isMuted: false, isSpeaking: false });
        this.notify();
        this.setupSpeakingDetection(peerId, stream);
      }
    };

    // Agregar tracks locales — sender transform también síncrono
    if (this.localStream) {
      const tracks = this.localStream.getTracks();
      for (const track of tracks) {
        const sender = pc.addTrack(track, this.localStream);
        if (GROUP_CALL_FRAME_ENCRYPTION && this.sharedKey && isInsertableStreamsSupported()) {
          const key = this.getHourlyKeySync();
          if (key) {
            try {
              setupSenderTransform(sender, key);
            } catch {}
          } else {
            this.getHourlyKey()
              .then((k) => {
                if (this.peers.get(peerId) !== pc) return;
                setupSenderTransform(sender, k);
              })
              .catch(() => {});
          }
        }
      }
    }

    this.peers.set(peerId, pc);
    return pc;
  }

  private async createOffer(peerId: string) {
    // Guard anti-duplicado: si ya existe un peer para este id, ya estamos
    // negociando/conectados. join + hello pueden disparar createOffer dos veces
    // hacia el mismo peer; una segunda oferta corrompe el estado de negociación
    // y la conexión nunca entrega media.
    if (this.peers.has(peerId)) return;

    const pc = this.getOrCreatePeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send('offer', { from: this.userId, to: peerId, sdp: offer, username: this.username });
  }

  private removePeer(peerId: string) {
    this.peers.get(peerId)?.close();
    this.peers.delete(peerId);
    this.participants.delete(peerId);
    this.analyserNodes.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.notify();
  }

  private async getHourlyKey(): Promise<CryptoKey> {
    const hourIndex = Math.floor(Date.now() / 3_600_000);
    if (this.hourlyKeyCache?.hourIndex === hourIndex) {
      return this.hourlyKeyCache.key;
    }
    // Si ya hay una derivación en vuelo para esta hora, esperarla
    if (this.hourlyKeyDerivation) return this.hourlyKeyDerivation;

    this.hourlyKeyDerivation = deriveHourlyKey(this.sharedKey!).then((key) => {
      this.hourlyKeyCache = { hourIndex, key };
      this.hourlyKeyDerivation = null;
      return key;
    }).catch((err) => {
      this.hourlyKeyDerivation = null;
      throw err;
    });
    return this.hourlyKeyDerivation;
  }

  /**
   * Lookup SÍNCRONO de la clave horaria. Devuelve null si no está derivada.
   * Usar en pc.ontrack / addTrack para evitar microtask delay que
   * permite frames cifrados llegar al decoder antes del transform.
   */
  private getHourlyKeySync(): CryptoKey | null {
    const hourIndex = Math.floor(Date.now() / 3_600_000);
    if (this.hourlyKeyCache?.hourIndex === hourIndex) {
      return this.hourlyKeyCache.key;
    }
    return null;
  }

  private setupSpeakingDetection(userId: string, stream: MediaStream) {
    try {
      if (!this.audioContext) this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.analyserNodes.set(userId, analyser);
    } catch {
      this.analyserNodes.delete(userId);
    }
  }

  private startSpeakingDetection() {
    const buffer = new Uint8Array(128);
    this.speakingInterval = setInterval(() => {
      this.analyserNodes.forEach((analyser, userId) => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const v of buffer) sum += Math.abs(v - 128);
        const rms = sum / buffer.length;
        const participant = this.participants.get(userId);
        if (participant) {
          const isSpeaking = rms > 5;
          if (participant.isSpeaking !== isSpeaking) {
            // NUEVO objeto (inmutable) para React.memo
            this.participants.set(userId, { ...participant, isSpeaking });
            this.notify();
          }
        }
      });
    }, 500);
  }

  leave() {
    // untrack() retira mi presencia → los demás reciben 'leave' y me eliminan
    this.channel?.untrack().catch(() => {});
    if (this.speakingInterval) clearInterval(this.speakingInterval);
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
    this.participants.clear();
    this.analyserNodes.clear();
    this.pendingCandidates.clear();
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    if (this.channel) supabase.removeChannel(this.channel);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.notify();
  }

  /**
   * Reemplaza el track de video local en TODOS los peers (replaceTrack).
   * Úsalo al activar/desactivar filtros — el sender transform de cifrado
   * se mantiene porque está atado al sender, no al track.
   */
  replaceLocalVideoTrack(newTrack: MediaStreamTrack) {
    // Actualizar el localStream interno con el nuevo track de video
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      this.localStream = new MediaStream([newTrack, ...audioTracks]);
    }
    for (const pc of this.peers.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      sender?.replaceTrack(newTrack).catch(() => {});
    }
  }

  private send(event: string, payload: object) {
    this.channel?.send({ type: 'broadcast', event, payload });
  }

  private notify() {
    this.onParticipantsChange(new Map(this.participants));
  }

  getLocalStream() {
    return this.localStream;
  }
}
