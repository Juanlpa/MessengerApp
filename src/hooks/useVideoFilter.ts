'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { type FilterId, applyColorFilter } from '@/lib/filters/canvas-filters';

export type { FilterId };
export type BackgroundId = 'none' | 'blur';

export function useVideoFilter() {
  const [activeFilter, setActiveFilterState] = useState<FilterId>('none');
  const [activeBackground, setActiveBackgroundState] = useState<BackgroundId>('none');

  // Internal pipeline state — not React state to avoid extra re-renders
  const rafIdRef = useRef<number | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeFilterRef = useRef<FilterId>('none');
  const activeBackgroundRef = useRef<BackgroundId>('none');

  const setFilter = useCallback((f: FilterId) => {
    activeFilterRef.current = f;
    setActiveFilterState(f);
  }, []);

  const setBackground = useCallback((bg: BackgroundId) => {
    activeBackgroundRef.current = bg;
    setActiveBackgroundState(bg);
  }, []);

  const stopPipeline = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (fallbackIntervalRef.current !== null) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.pause();
      const stream = hiddenVideoRef.current.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      hiddenVideoRef.current.srcObject = null;
      hiddenVideoRef.current = null;
    }
    if (canvasRef.current) {
      // Setting width to 0 releases GPU texture memory
      canvasRef.current.width = 0;
      canvasRef.current.height = 0;
      canvasRef.current = null;
    }
  }, []);

  const processStream = useCallback((raw: MediaStream): MediaStream => {
    // Audio-only calls: nothing to process
    const videoTracks = raw.getVideoTracks();
    if (videoTracks.length === 0) return raw;

    // CRÍTICO: si no hay filtro ni fondo activo, NO usar el canvas pipeline.
    // El canvas depende de requestAnimationFrame, que se PAUSA cuando la ventana
    // no está enfocada → el canvas no se dibuja → el track emite frames negros
    // y se transmite video/“nada” al otro lado. Pasar el stream crudo directo
    // (idéntico al flujo de audio, que sí funciona) y solo procesar cuando el
    // usuario activa explícitamente un filtro.
    if (activeFilterRef.current === 'none' && activeBackgroundRef.current === 'none') {
      stopPipeline(); // detener cualquier pipeline anterior (al quitar el filtro)
      return raw;
    }

    // Clean up any previous pipeline before creating a new one
    stopPipeline();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const settings = videoTracks[0].getSettings();
    canvas.width = settings.width || 1280;
    canvas.height = settings.height || 720;
    canvasRef.current = canvas;

    const captureStream = canvas.captureStream(30);
    const canvasVideoTrack = captureStream.getVideoTracks()[0];
    const processedStream = new MediaStream([canvasVideoTrack, ...raw.getAudioTracks()]);

    const hiddenVideo = document.createElement('video');
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    // CLON del track de cámara — stopPipeline() hace track.stop() sobre el
    // srcObject del hiddenVideo. Si usáramos el track original, apagaríamos
    // la cámara raw (rompiendo replaceTrack al quitar el filtro). El clon
    // se detiene de forma independiente.
    hiddenVideo.srcObject = new MediaStream(videoTracks.map((t) => t.clone()));
    hiddenVideoRef.current = hiddenVideo;

    const drawFrame = () => {
      const w = hiddenVideo.videoWidth;
      const h = hiddenVideo.videoHeight;
      if (w > 0 && h > 0) {
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        applyColorFilter(
          ctx,
          hiddenVideo,
          activeFilterRef.current,
          canvas.width,
          canvas.height,
          activeBackgroundRef.current === 'blur'
        );
      }
    };

    // Loop por rAF (suave cuando la ventana está enfocada)
    const rafLoop = () => {
      if (!hiddenVideoRef.current) return;
      drawFrame();
      rafIdRef.current = requestAnimationFrame(rafLoop);
    };

    // Fallback por setInterval — rAF se pausa en ventanas sin foco; el interval
    // sigue corriendo (a ~15fps) y mantiene el canvas con frames reales, evitando
    // que el track transmita negro cuando la pestaña no está al frente.
    fallbackIntervalRef.current = setInterval(drawFrame, 66);

    hiddenVideo.addEventListener('loadedmetadata', () => {
      drawFrame(); // primer frame inmediato
      rafIdRef.current = requestAnimationFrame(rafLoop);
    }, { once: true });

    // Algunos navegadores no disparan loadedmetadata si el <video> no está en
    // el DOM; arrancamos el loop igual tras play()
    hiddenVideo.play()
      .then(() => {
        drawFrame();
        if (rafIdRef.current === null) rafIdRef.current = requestAnimationFrame(rafLoop);
      })
      .catch(() => {
        // Aunque play() falle, el interval sigue dibujando los frames disponibles
      });

    return processedStream;
  }, [stopPipeline]);

  useEffect(() => {
    return () => {
      stopPipeline();
    };
  }, [stopPipeline]);

  return {
    activeFilter,
    activeBackground,
    setFilter,
    setBackground,
    processStream,
    stopPipeline,
  };
}
