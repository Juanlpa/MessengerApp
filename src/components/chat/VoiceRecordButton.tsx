'use client';

/**
 * VoiceRecordButton.tsx — Botón de micrófono con UX tipo WhatsApp
 *
 * Interacciones:
 * - Click: empieza a grabar (modo bloqueado directamente)
 * - Mientras graba: muestra timer + waveform + botones cancelar/enviar
 * - Click en enviar: cifra y envía
 * - Click en cancelar: descarta grabación
 */

import { useState, useCallback } from 'react';
import { Mic, Send, X, Lock, Loader2 } from 'lucide-react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import type { VoiceRecorderResult } from '@/hooks/useVoiceRecorder';

interface VoiceRecordButtonProps {
  sharedKey: Uint8Array | null;
  onVoiceReady: (result: VoiceRecorderResult) => Promise<void>;
  disabled?: boolean;
}

export function VoiceRecordButton({
  sharedKey,
  onVoiceReady,
  disabled = false,
}: VoiceRecordButtonProps) {
  const [sending, setSending] = useState(false);

  const {
    state,
    formattedDuration,
    waveformData,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    lockRecording,
    clearError,
  } = useVoiceRecorder(sharedKey);

  const handleStart = useCallback(async () => {
    if (disabled || !sharedKey) return;
    await startRecording();
    // Auto-lock para simplificar UX (el usuario puede grabar sin mantener presionado)
    setTimeout(() => lockRecording(), 100);
  }, [disabled, sharedKey, startRecording, lockRecording]);

  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      const result = await stopRecording();
      if (result) {
        await onVoiceReady(result);
      }
    } finally {
      setSending(false);
    }
  }, [stopRecording, onVoiceReady]);

  const handleCancel = useCallback(() => {
    cancelRecording();
  }, [cancelRecording]);

  // ── Estado: Idle → mostrar solo ícono de micrófono ─────────────
  if (state === 'idle') {
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
          onClick={handleStart}
          disabled={disabled}
          className={`p-2 rounded-full transition-colors flex-shrink-0 ${
            disabled
              ? 'text-[#65676b] opacity-50 cursor-not-allowed'
              : 'text-[#0084ff] hover:bg-[#f0f2f5]'
          }`}
          title="Grabar mensaje de voz"
          aria-label="Grabar mensaje de voz"
          id="btn-voice-record"
        >
          <Mic className="w-6 h-6" />
        </button>
      </div>
    );
  }

  // ── Estado: Recording / Locked → mostrar controles de grabación ─
  return (
    <div className="flex items-center gap-2 bg-red-50 rounded-full pl-3 pr-1 py-1 animate-in slide-in-from-right-2 duration-200">
      {/* Indicador de grabación pulsante */}
      <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />

      {/* Timer */}
      <span className="text-[14px] font-mono text-red-600 font-medium min-w-[40px]">
        {formattedDuration}
      </span>

      {/* Mini waveform (últimos 15 samples) */}
      <div className="flex items-center gap-[2px] h-6 mx-1">
        {waveformData.slice(-15).map((val, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-red-400 transition-all duration-100"
            style={{ height: `${Math.max(4, val * 24)}px` }}
          />
        ))}
        {/* Rellenar si hay menos de 15 barras */}
        {waveformData.length < 15 && Array.from({ length: 15 - waveformData.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-[3px] h-1 rounded-full bg-red-200"
          />
        ))}
      </div>

      {/* Lock indicator */}
      {state === 'locked' && (
        <Lock className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
      )}

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
        onClick={handleSend}
        disabled={sending}
        className="p-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] text-white transition-colors flex-shrink-0"
        title="Enviar mensaje de voz"
        aria-label="Enviar mensaje de voz"
      >
        {sending ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Send className="w-5 h-5" />
        )}
      </button>
    </div>
  );
}
