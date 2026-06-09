'use client';

/**
 * VoicePlayer.tsx — Reproductor de mensajes de voz cifrados
 *
 * Features:
 * - Waveform visual renderizada en Canvas
 * - Play/pause con animación
 * - Scrub (seek) clickeando en la waveform
 * - Velocidad 1x / 1.5x / 2x
 * - Duración visible
 * - Descarga y descifrado automático del blob de voz
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';
import { formatDuration } from '@/hooks/useVoiceRecorder';

interface VoicePlayerProps {
  attachmentId: string;
  durationMs: number;
  waveformData: number[];
  isOwnMessage: boolean;
  onLoadAudio: (attachmentId: string) => Promise<{ blobUrl: string } | null>;
}

type PlaybackSpeed = 1 | 1.5 | 2;

export function VoicePlayer({
  attachmentId,
  durationMs,
  waveformData,
  isOwnMessage,
  onLoadAudio,
}: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs / 1000);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [loadFailed, setLoadFailed] = useState(false);

  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const animationRef   = useRef<number | null>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const onLoadAudioRef = useRef(onLoadAudio);
  onLoadAudioRef.current = onLoadAudio;
  // Track blob URL in a ref so unmount cleanup can revoke it (audioUrl state is null at mount time)
  const audioUrlRef = useRef<string | null>(null);

  // Colores según si es mensaje propio o recibido
  const colors = isOwnMessage
    ? { played: '#ffffff', unplayed: 'rgba(255,255,255,0.4)', bg: 'transparent' }
    : { played: '#0084ff', unplayed: '#c4c4c4', bg: 'transparent' };

  // ── Cargar audio al primer play ─────────────────────────────────
  const loadAudio = useCallback(async () => {
    if (audioUrlRef.current) return audioUrlRef.current;
    setIsLoading(true);
    try {
      const result = await onLoadAudioRef.current(attachmentId);
      if (result) {
        audioUrlRef.current = result.blobUrl;
        return result.blobUrl;
      }
    } catch (err) {
      console.error('[VoicePlayer] Load error:', err);
    } finally {
      setIsLoading(false);
    }
    return null;
  }, [attachmentId]);

  // ── Play/Pause ──────────────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    if (isLoading) return;
    setLoadFailed(false);

    if (!audioRef.current) {
      const url = await loadAudio();
      if (!url) { setLoadFailed(true); return; }

      // Crear el elemento y adjuntar handlers ANTES de asignar src, para no
      // perder un posible evento de error durante la selección del recurso.
      const audio = new Audio();
      audio.preload = 'auto';
      audio.playbackRate = speed;
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        setLoadFailed(false);
        if (audio.duration && isFinite(audio.duration)) {
          setDuration(audio.duration);
        }
      };

      audio.oncanplay = () => setLoadFailed(false);

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };

      audio.onerror = () => {
        // Diagnóstico completo: code (1=ABORTED 2=NETWORK 3=DECODE 4=SRC_NOT_SUPPORTED),
        // networkState (3=NO_SOURCE), readyState. Si error es null suele ser
        // un blob revocado o un fallo de red del object URL.
        console.warn('[VoicePlayer] No se pudo reproducir el audio', {
          errorCode: audio.error?.code ?? null,
          errorMessage: audio.error?.message ?? null,
          networkState: audio.networkState,
          readyState: audio.readyState,
          srcSet: !!audio.src,
        });
        setIsPlaying(false);
        setLoadFailed(true);
      };

      audio.src = url;
      audio.load();
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
        updateProgress();
      } catch (err) {
        // play() rechaza si el formato no es reproducible o falta gesto de usuario
        console.warn('[VoicePlayer] play() rechazado:', err);
        setIsPlaying(false);
        setLoadFailed(true);
      }
    }
  }, [isPlaying, isLoading, loadAudio, speed]);

  // ── Actualización de progreso ───────────────────────────────────
  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentTime(audio.currentTime);

    if (!audio.paused && !audio.ended) {
      animationRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  // ── Velocidad ───────────────────────────────────────────────────
  const cycleSpeed = useCallback(() => {
    setSpeed(prev => {
      const next: PlaybackSpeed = prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1;
      if (audioRef.current) {
        audioRef.current.playbackRate = next;
      }
      return next;
    });
  }, []);

  // ── Seek (click en waveform) ────────────────────────────────────
  const handleSeek = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const newTime = ratio * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // ── Renderizar waveform ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const bars = waveformData.length || 30;
    const barWidth = Math.max(2, (width / bars) - 1);
    const gap = 1;
    const progressRatio = duration > 0 ? currentTime / duration : 0;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < bars; i++) {
      const x = i * (barWidth + gap);
      const amplitude = waveformData[i] ?? 0.1;
      const barHeight = Math.max(3, amplitude * (height * 0.8));
      const y = (height - barHeight) / 2;

      const barProgress = x / width;
      ctx.fillStyle = barProgress <= progressRatio ? colors.played : colors.unplayed;

      // Barras redondeadas
      const radius = Math.min(barWidth / 2, 2);
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, radius);
      ctx.fill();
    }
  }, [waveformData, currentTime, duration, colors.played, colors.unplayed]);

  // ── Cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const displayTime = isPlaying || currentTime > 0
    ? formatDuration(currentTime * 1000)
    : formatDuration(durationMs);

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-2 py-1 px-1 min-w-[200px] max-w-[280px]"
    >
      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        disabled={isLoading}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
          isOwnMessage
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-[#0084ff]/10 hover:bg-[#0084ff]/20 text-[#0084ff]'
        }`}
        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-5 h-5" fill="currentColor" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
        )}
      </button>

      {/* Waveform */}
      <div className="flex-1 flex flex-col gap-1">
        <canvas
          ref={canvasRef}
          className="w-full h-[28px] cursor-pointer"
          onClick={handleSeek}
        />
        <div className="flex items-center justify-between">
          <span className={`text-[11px] font-mono ${
            loadFailed
              ? (isOwnMessage ? 'text-red-200' : 'text-red-500')
              : (isOwnMessage ? 'text-white/60' : 'text-[#65676b]')
          }`}>
            {loadFailed ? 'No se pudo reproducir' : displayTime}
          </span>
          <button
            onClick={cycleSpeed}
            className={`text-[11px] font-bold px-1.5 py-0.5 rounded transition-colors ${
              isOwnMessage
                ? 'text-white/70 hover:bg-white/10'
                : 'text-[#65676b] hover:bg-black/5'
            }`}
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}
