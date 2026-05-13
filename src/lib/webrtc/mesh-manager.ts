/**
 * mesh-manager.ts — Gestión de llamadas grupales en topología mesh
 *
 * Cada participante mantiene N-1 RTCPeerConnections (una por cada otro participante).
 * La señalización se hace via Supabase Broadcast en el canal group_call_${conversationId}.
 *
 * Mensajes de señalización:
 *   join       { userId, username }
 *   leave      { userId }
 *   offer      { from, to, sdp, username }
 *   answer     { from, to, sdp }
 *   ice        { from, to, candidate }
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  isInsertableStreamsSupported,
  setupSenderTransform,
  setupReceiverTransform,
} from './insertable-streams';

export interface MeshParticipant {
  userId: string;
  username: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isSpeaking: boolean;
}

type OnParticipantsChange = (participants: Map<string, MeshParticipant>) => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
];

const MAX_VIDEO_PARTICIPANTS = 4;
const MAX_AUDIO_PARTICIPANTS = 8;

export class MeshManager {
  private peers = new Map<string, RTCPeerConnection>();
  private participants = new Map<string, MeshParticipant>();
  private channel: RealtimeChannel | null = null;
  private localStream: MediaStream | null = null;
  private sharedKey: Uint8Array | null = null;
  private analyserNodes = new Map<string, AnalyserNode>();
  private audioContexts = new Map<string, AudioContext>();
  private speakingInterval: ReturnType<typeof setInterval> | null = null;
  private onParticipantsChange: OnParticipantsChange;
  private supabase;

  constructor(
    private conversationId: string,
    private userId: string,
    private username: string,
    onParticipantsChange: OnParticipantsChange
  ) {
    this.onParticipantsChange = onParticipantsChange;
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  async join(localStream: MediaStream, sharedKey?: Uint8Array | null) {
    const videoTracks = localStream.getVideoTracks().length;
    const currentSize = this.participants.size + 1;

    if (videoTracks > 0 && currentSize > MAX_VIDEO_PARTICIPANTS) {
      throw new Error(`Máximo ${MAX_VIDEO_PARTICIPANTS} participantes con video`);
    }
    if (currentSize > MAX_AUDIO_PARTICIPANTS) {
      throw new Error(`Máximo ${MAX_AUDIO_PARTICIPANTS} participantes en llamada`);
    }

    this.localStream = localStream;
    this.sharedKey = sharedKey ?? null;
    this.setupSignaling();

    await new Promise<void>((resolve) => {
      this.channel!.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
    });

    // Anunciar entrada al grupo
    this.send('join', { userId: this.userId, username: this.username });
    this.startSpeakingDetection();
  }

  private setupSignaling() {
    this.channel = this.supabase.channel(`group_call_${this.conversationId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'join' }, async ({ payload }) => {
        const { userId, username } = payload as { userId: string; username: string };
        if (userId === this.userId) return;

        // Añadir nuevo participante y crear oferta hacia él
        this.addParticipant(userId, username);
        await this.createOffer(userId);
      })
      .on('broadcast', { event: 'leave' }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        this.removePeer(userId);
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        const { from, to, sdp, username } = payload as { from: string; to: string; sdp: RTCSessionDescriptionInit; username?: string };
        if (to !== this.userId) return;

        this.addParticipant(from, username || '');
        const pc = this.getOrCreatePeer(from);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send('answer', { from: this.userId, to: from, sdp: answer });
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        const { from, to, sdp } = payload as { from: string; to: string; sdp: RTCSessionDescriptionInit };
        if (to !== this.userId) return;

        const pc = this.peers.get(from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      })
      .on('broadcast', { event: 'ice' }, async ({ payload }) => {
        const { from, to, candidate } = payload as { from: string; to: string; candidate: RTCIceCandidateInit };
        if (to !== this.userId) return;

        const pc = this.peers.get(from);
        if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      })
      .subscribe();
  }

  private addParticipant(userId: string, username: string) {
    if (!this.participants.has(userId)) {
      this.participants.set(userId, { userId, username, stream: null, isMuted: false, isSpeaking: false });
      this.notify();
    } else if (username) {
      const p = this.participants.get(userId)!;
      p.username = username;
      this.notify();
    }
  }

  private getOrCreatePeer(peerId: string): RTCPeerConnection {
    if (this.peers.has(peerId)) return this.peers.get(peerId)!;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

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

      // Insertable Streams — descifrado
      if (this.sharedKey && isInsertableStreamsSupported()) {
        setupReceiverTransform(e.receiver, this.sharedKey).catch(() => {});
      }

      const participant = this.participants.get(peerId);
      if (participant) {
        participant.stream = stream;
        this.notify();
        this.setupSpeakingDetection(peerId, stream);
      }
    };

    // Agregar tracks locales
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, this.localStream!);
        if (this.sharedKey && isInsertableStreamsSupported()) {
          setupSenderTransform(sender, this.sharedKey).catch(() => {});
        }
      });
    }

    this.peers.set(peerId, pc);
    return pc;
  }

  private async createOffer(peerId: string) {
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
    this.audioContexts.get(peerId)?.close().catch(() => {});
    this.audioContexts.delete(peerId);
    this.notify();
  }

  private setupSpeakingDetection(userId: string, stream: MediaStream) {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.analyserNodes.set(userId, analyser);
      this.audioContexts.set(userId, ctx);
    } catch {}
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
            participant.isSpeaking = isSpeaking;
            this.notify();
          }
        }
      });
    }, 200);
  }

  leave() {
    this.send('leave', { userId: this.userId });
    if (this.speakingInterval) clearInterval(this.speakingInterval);
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
    this.participants.clear();
    this.analyserNodes.clear();
    this.audioContexts.forEach((ctx) => ctx.close().catch(() => {}));
    this.audioContexts.clear();
    if (this.channel) this.supabase.removeChannel(this.channel);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.notify();
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
