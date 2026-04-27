'use client';

/**
 * useVoiceRecorder.ts — Hook de grabación de mensajes de voz cifrados
 *
 * UX tipo WhatsApp:
 * - Press and hold para grabar
 * - Swipe up para bloquear grabación (manos libres)
 * - Swipe left para cancelar
 * - Timer visible mientras graba
 * - Waveform en tiempo real con Web Audio API AnalyserNode
 *
 * Flujo:
 *  1. Obtener getUserMedia({ audio: true })
 *  2. MediaRecorder graba en formato webm/opus
 *  3. AnalyserNode extrae datos de waveform en tiempo real
 *  4. Al terminar: cifrar blob → subir → enviar mensaje tipo 'voice'
 *
 * Seguridad: El audio NUNCA viaja sin cifrar. Se cifra inmediatamente
 * después de grabar con la shared key de la conversación.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  encryptFile,
  fileToUint8Array,
} from '@/lib/crypto/file-encrypt';
import { sanitizeFilename } from '@/lib/crypto/mime-validator';
import type { EncryptedData } from '@/lib/crypto/encrypt';

// ─── Types ──────────────────────────────────────────────────────────

export type RecordingState = 'idle' | 'recording' | 'locked' | 'sending';

export interface VoiceRecorderResult {
  /** Blob de audio cifrado listo para subir */
  encryptedData: EncryptedData;
  /** Duración en milisegundos */
  durationMs: number;
  /** Datos de waveform normalizados (0-1) para visualización */
  waveformData: number[];
  /** Tamaño del blob original en bytes */
  sizeBytes: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const WAVEFORM_SAMPLE_RATE = 10; // samples por segundo para waveform
const WAVEFORM_FFT_SIZE = 256;
const MAX_RECORDING_SECONDS = 120; // 2 minutos máximo

// ─── Hook ───────────────────────────────────────────────────────────

export function useVoiceRecorder(sharedKey: Uint8Array | null) {
  const [state, setState] = useState<RecordingState>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Inicia la grabación de audio.
   */
  const startRecording = useCallback(async () => {
    if (state !== 'idle') return;
    setError(null);

    try {
      // Obtener permisos de micrófono
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;

      // Configurar Web Audio API para waveform
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = WAVEFORM_FFT_SIZE;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Configurar MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg;codecs=opus';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(100); // Chunk cada 100ms
      startTimeRef.current = Date.now();
      setState('recording');
      setDurationMs(0);
      setWaveformData([]);

      // Timer de duración
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setDurationMs(elapsed);

        // Límite de duración
        if (elapsed >= MAX_RECORDING_SECONDS * 1000) {
          stopRecording();
        }
      }, 100);

      // Muestreo de waveform
      waveformTimerRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteTimeDomainData(dataArray);

        // Calcular amplitud RMS normalizada
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const normalized = Math.min(1, rms * 3); // Amplificar para mejor visualización

        setWaveformData(prev => [...prev, normalized]);
      }, 1000 / WAVEFORM_SAMPLE_RATE);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo acceder al micrófono';
      setError(msg);
      cleanup();
    }
  }, [state]);

  /**
   * Bloquea la grabación (modo manos libres).
   */
  const lockRecording = useCallback(() => {
    if (state === 'recording') {
      setState('locked');
    }
  }, [state]);

  /**
   * Detiene la grabación y devuelve el resultado cifrado.
   */
  const stopRecording = useCallback((): Promise<VoiceRecorderResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || (state !== 'recording' && state !== 'locked')) {
        resolve(null);
        return;
      }

      setState('sending');
      const finalDuration = Date.now() - startTimeRef.current;
      const finalWaveform = [...waveformData];

      recorder.onstop = async () => {
        try {
          // Crear blob de audio
          const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType });
          const audioBytes = new Uint8Array(await audioBlob.arrayBuffer());

          if (!sharedKey) {
            throw new Error('No hay clave de conversación');
          }

          // Cifrar con shared key
          const encrypted = encryptFile(audioBytes, sharedKey);

          cleanup();
          setState('idle');

          resolve({
            encryptedData: encrypted,
            durationMs: finalDuration,
            waveformData: finalWaveform,
            sizeBytes: audioBytes.length,
          });
        } catch (err) {
          console.error('[VoiceRecorder] Encryption error:', err);
          setError(err instanceof Error ? err.message : 'Error al cifrar audio');
          cleanup();
          setState('idle');
          resolve(null);
        }
      };

      recorder.stop();
    });
  }, [state, sharedKey, waveformData]);

  /**
   * Cancela la grabación sin guardar.
   */
  const cancelRecording = useCallback(() => {
    if (state === 'recording' || state === 'locked') {
      cleanup();
      setState('idle');
      setDurationMs(0);
      setWaveformData([]);
    }
  }, [state]);

  /**
   * Limpia todos los recursos de audio.
   */
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (waveformTimerRef.current) {
      clearInterval(waveformTimerRef.current);
      waveformTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    chunksRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  /**
   * Formatea duración para mostrar "0:05", "1:23", etc.
   */
  const formattedDuration = formatDuration(durationMs);

  return {
    state,
    durationMs,
    formattedDuration,
    waveformData,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    lockRecording,
    clearError: () => setError(null),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
