'use client';

import { useState, useRef, useCallback } from 'react';
import { type FilterId, applyColorFilter } from '@/lib/filters/canvas-filters';

export type { FilterId };
export type BackgroundId = 'none';

export function useVideoFilter() {
  const [activeFilter, setActiveFilterState] = useState<FilterId>('none');
  const [activeBackground, setActiveBackgroundState] = useState<BackgroundId>('none');

  // Internal pipeline state — not React state to avoid extra re-renders
  const rafIdRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeFilterRef = useRef<FilterId>('none');

  const setFilter = useCallback((f: FilterId) => {
    activeFilterRef.current = f;
    setActiveFilterState(f);
  }, []);

  const setBackground = useCallback((_bg: BackgroundId) => {
    setActiveBackgroundState(_bg);
  }, []);

  const stopPipeline = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.pause();
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

    // Clean up any previous pipeline before creating a new one
    stopPipeline();

    const canvas = document.createElement('canvas');
    // alpha:false — compositor skips alpha blending → ~10-15% faster on low-end GPUs
    const ctx = canvas.getContext('2d', { alpha: false })!;

    // Set initial dimensions from track settings — available synchronously, no need to wait
    // for loadedmetadata. This ensures the canvas track is ready for WebRTC addTrack() calls
    // that happen immediately after processStream() returns.
    const settings = videoTracks[0].getSettings();
    canvas.width = settings.width || 1280;
    canvas.height = settings.height || 720;
    canvasRef.current = canvas;

    // Capture canvas stream BEFORE loadedmetadata so the track is in processedStream
    // when the caller does localStream.getTracks().forEach(t => pc.addTrack(t, ...))
    const captureStream = canvas.captureStream(30);
    const canvasVideoTrack = captureStream.getVideoTracks()[0];

    // Build processedStream synchronously with all tracks (canvas video + raw audio)
    const processedStream = new MediaStream([canvasVideoTrack, ...raw.getAudioTracks()]);

    const hiddenVideo = document.createElement('video');
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    hiddenVideo.srcObject = new MediaStream(videoTracks);
    hiddenVideoRef.current = hiddenVideo;

    const startLoop = () => {
      // Refine canvas dimensions from actual decoded video (more accurate than getSettings())
      const w = hiddenVideo.videoWidth;
      const h = hiddenVideo.videoHeight;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      }

      const loop = () => {
        if (!hiddenVideoRef.current || hiddenVideo.paused || hiddenVideo.ended) return;
        // Use canvas.width/height directly so any dimension update in startLoop is reflected
        applyColorFilter(ctx, hiddenVideo, activeFilterRef.current, canvas.width, canvas.height);
        rafIdRef.current = requestAnimationFrame(loop);
      };
      rafIdRef.current = requestAnimationFrame(loop);
    };

    hiddenVideo.addEventListener('loadedmetadata', startLoop, { once: true });
    hiddenVideo.play().catch(() => {});

    return processedStream;
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
