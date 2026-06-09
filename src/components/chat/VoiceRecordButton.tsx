'use client';

/**
 * VoiceRecordButton.tsx — Botón de micrófono con UX tipo WhatsApp
 *
 * Interacciones:
 * - Press and hold → graba
 * - Soltar sin gesto → envía automáticamente
 * - Swipe ↑ 50px → bloquea (manos libres); aparecen botones cancelar/enviar
 * - Swipe ← 80px → cancela
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, Send, X, Lock, Loader2 } from 'lucide-react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import type { VoiceRecorderResult } from '@/hooks/useVoiceRecorder';

const LOCK_THRESHOLD   = -50;  // px hacia arriba para bloquear
const CANCEL_THRESHOLD = -80;  // px hacia la izquierda para cancelar

interface VoiceRecordButtonProps {
  sharedKey: Uint8Array | null;
  onVoiceReady: (result: VoiceRecorderResult) => Promise<void>;
  disabled?: boolean;
  /** Avisa al padre cuando hay una grabación activa (para ocultar el input y dar espacio) */
  onRecordingChange?: (recording: boolean) => void;
}

export function VoiceRecordButton({ sharedKey, onVoiceReady, disabled = false, onRecordingChange }: VoiceRecordButtonProps) {
  const [sending, setSending] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_swipeHint, setSwipeHint] = useState<'none' | 'lock' | 'cancel'>('none');

  const startPosRef  = useRef<{ x: number; y: number } | null>(null);
  const isHoldingRef = useRef(false);

  // Ref estable para enviar — evita re-crear el effect de listeners
  const doSendRef = useRef<() => Promise<void>>(async () => {});

  const {
    state, formattedDuration, waveformData, error,
    startRecording, stopRecording, cancelRecording, lockRecording, clearError,
  } = useVoiceRecorder(sharedKey);

  // Notificar al padre cuando la grabación está activa (recording/locked)
  const isActive = state === 'recording' || state === 'locked';
  useEffect(() => {
    onRecordingChange?.(isActive);
  }, [isActive, onRecordingChange]);

  // Mantener doSendRef siempre actualizado sin re-crear el effect
  doSendRef.current = useCallback(async () => {
    setSending(true);
    try {
      const result = await stopRecording();
      if (result) await onVoiceReady(result);
    } finally {
      setSending(false);
    }
  }, [stopRecording, onVoiceReady]);

  // ── Listeners globales durante 'recording' ───────────────────────
  useEffect(() => {
    if (state !== 'recording') {
      setSwipeHint('none');
      return;
    }

    const getPos = (e: MouseEvent | TouchEvent) =>
      'touches' in e
        ? { x: e.touches[0].clientX,       y: e.touches[0].clientY }
        : { x: (e as MouseEvent).clientX,  y: (e as MouseEvent).clientY };

    const getEndPos = (e: MouseEvent | TouchEvent) =>
      'changedTouches' in e
        ? { x: (e as TouchEvent).changedTouches[0].clientX, y: (e as TouchEvent).changedTouches[0].clientY }
        : { x: (e as MouseEvent).clientX,                   y: (e as MouseEvent).clientY };

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!startPosRef.current) return;
      const { x, y } = getPos(e);
      const dx = x - startPosRef.current.x;
      const dy = y - startPosRef.current.y;

      if (dy < LOCK_THRESHOLD)        setSwipeHint('lock');
      else if (dx < CANCEL_THRESHOLD) setSwipeHint('cancel');
      else                            setSwipeHint('none');
    };

    const onUp = async (e: MouseEvent | TouchEvent) => {
      if (!isHoldingRef.current) return;

      const end = getEndPos(e);
      const dx  = startPosRef.current ? end.x - startPosRef.current.x : 0;
      const dy  = startPosRef.current ? end.y - startPosRef.current.y : 0;

      isHoldingRef.current = false;
      startPosRef.current  = null;
      setSwipeHint('none');

      if (dy < LOCK_THRESHOLD)        lockRecording();
      else if (dx < CANCEL_THRESHOLD) cancelRecording();
      else                            await doSendRef.current();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend',  onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    };
  }, [state, lockRecording, cancelRecording]);

  // ── Press start ──────────────────────────────────────────────────
  const handlePressStart = useCallback(async (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || !sharedKey) return;
    e.preventDefault(); // evita selección de texto accidental
    const pos = 'touches' in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX,            y: e.clientY };
    startPosRef.current  = pos;
    isHoldingRef.current = true;
    await startRecording();
  }, [disabled, sharedKey, startRecording]);

  // ── Locked: send / cancel manual ────────────────────────────────
  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      const result = await stopRecording();
      if (result) await onVoiceReady(result);
    } finally {
      setSending(false);
    }
  }, [stopRecording, onVoiceReady]);

  const handleCancel = useCallback(() => cancelRecording(), [cancelRecording]);

  // ── IDLE / SENDING: botón de micrófono ──────────────────────────
  if (state === 'idle' || state === 'sending') {
    return (
      <div className="relative">
        {error && (
          <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-lg shadow-lg border border-red-200 p-2 z-50">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-red-600">{error}</span>
              <button onClick={clearError} className="p-0.5 hover:bg-red-50 rounded">
                <X className="w-3 h-3 text-red-400" />
              </button>
            </div>
          </div>
        )}
        <button
          onMouseDown={handlePressStart}
          onTouchStart={handlePressStart}
          disabled={disabled || state === 'sending'}
          className={`p-2 rounded-full transition-colors flex-shrink-0 select-none ${
            disabled || state === 'sending'
              ? 'text-[#65676b] opacity-50 cursor-not-allowed'
              : 'text-[#0084ff] hover:bg-[#f0f2f5] active:bg-[#d8e0f0] cursor-pointer'
          }`}
          title="Mantén presionado para grabar"
          aria-label="Grabar mensaje de voz"
          id="btn-voice-record"
        >
          {state === 'sending'
            ? <Loader2 className="w-6 h-6 animate-spin" />
            : <Mic className="w-6 h-6" />}
        </button>
      </div>
    );
  }

  // ── RECORDING: waveform + cancelar + enviar ─────────────────────
  if (state === 'recording') {
    return (
      <div className="flex-1 min-w-0 flex items-center gap-2 bg-red-50 border border-red-100 rounded-full pl-3 pr-1 py-1 animate-in slide-in-from-right-2 duration-200 select-none">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />

        <span className="text-[14px] font-mono text-red-600 font-medium min-w-[40px] flex-shrink-0">
          {formattedDuration}
        </span>

        {/* Mini waveform */}
        <div className="flex-1 min-w-0 flex items-center justify-end gap-[2px] h-6 mx-1 overflow-hidden">
          {waveformData.slice(-10).map((val, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full bg-red-400 transition-all duration-100"
              style={{ height: `${Math.max(4, val * 24)}px` }}
            />
          ))}
          {waveformData.length < 10 && Array.from({ length: 10 - waveformData.length }).map((_, i) => (
            <div key={`e-${i}`} className="w-[3px] h-1 rounded-full bg-red-200" />
          ))}
        </div>

        {/* Cancelar */}
        <button
          onClick={handleCancel}
          className="p-2 rounded-full hover:bg-red-100 text-red-500 transition-colors flex-shrink-0"
          title="Cancelar grabación"
          aria-label="Cancelar grabación"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Enviar */}
        <button
          onClick={async () => { isHoldingRef.current = false; await doSendRef.current(); }}
          className="p-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] text-white transition-colors flex-shrink-0"
          title="Enviar mensaje de voz"
          aria-label="Enviar mensaje de voz"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // ── LOCKED: botones cancelar + enviar ───────────────────────────
  return (
    <div className="flex-1 min-w-0 flex items-center gap-2 bg-red-50 rounded-full pl-3 pr-1 py-1 animate-in slide-in-from-right-2 duration-200">
      <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />

      <span className="text-[14px] font-mono text-red-600 font-medium min-w-[40px] flex-shrink-0">
        {formattedDuration}
      </span>

      <div className="flex-1 min-w-0 flex items-center justify-end gap-[2px] h-6 mx-1 overflow-hidden">
        {waveformData.slice(-15).map((val, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-red-400 transition-all duration-100"
            style={{ height: `${Math.max(4, val * 24)}px` }}
          />
        ))}
        {waveformData.length < 15 && Array.from({ length: 15 - waveformData.length }).map((_, i) => (
          <div key={`e-${i}`} className="w-[3px] h-1 rounded-full bg-red-200" />
        ))}
      </div>

      <Lock className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />

      <button
        onClick={handleCancel}
        className="p-2 rounded-full hover:bg-red-100 text-red-500 transition-colors flex-shrink-0"
        title="Cancelar grabación"
        aria-label="Cancelar grabación"
      >
        <X className="w-5 h-5" />
      </button>

      <button
        onClick={handleSend}
        disabled={sending}
        className="p-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] text-white transition-colors flex-shrink-0"
        title="Enviar mensaje de voz"
        aria-label="Enviar mensaje de voz"
      >
        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
      </button>
    </div>
  );
}
