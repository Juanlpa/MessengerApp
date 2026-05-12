'use client';

/**
 * ImageViewer.tsx — Modal fullscreen para ver imágenes descifradas
 *
 * Features:
 * - Navegación prev/next entre imágenes de la conversación (← →)
 * - Contador "2 / 5"
 * - Zoom con scroll y botones
 * - Rotación
 * - Descarga
 * - Esc para cerrar, click fuera para cerrar
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageItem {
  id: string;
  filename: string;
}

interface ImageViewerProps {
  isOpen: boolean;
  images: ImageItem[];
  initialIndex: number;
  onClose: () => void;
  onDownload: (attachmentId: string) => Promise<void>;
  onLoadFullImage: (attachmentId: string) => Promise<{ blobUrl: string } | null>;
}

export function ImageViewer({
  isOpen,
  images,
  initialIndex,
  onClose,
  onDownload,
  onLoadFullImage,
}: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageUrl, setImageUrl]         = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [downloading, setDownloading]   = useState(false);
  const [zoom, setZoom]                 = useState(1);
  const [rotation, setRotation]         = useState(0);

  const backdropRef         = useRef<HTMLDivElement>(null);
  const blobUrlRef          = useRef<string | null>(null);
  const onLoadFullImageRef  = useRef(onLoadFullImage);
  onLoadFullImageRef.current = onLoadFullImage;

  const currentImage = images[currentIndex];
  const hasPrev      = currentIndex > 0;
  const hasNext      = currentIndex < images.length - 1;

  const goPrev = useCallback(() => setCurrentIndex(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setCurrentIndex(i => Math.min(images.length - 1, i + 1)), [images.length]);

  // Resetear índice cuando el viewer se abre
  useEffect(() => {
    if (isOpen) setCurrentIndex(initialIndex);
  }, [isOpen, initialIndex]);

  // Cargar imagen al cambiar de índice
  useEffect(() => {
    if (!isOpen || !currentImage) return;

    let cancelled = false;
    setLoading(true);
    setZoom(1);
    setRotation(0);

    // Revocar blob anterior
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setImageUrl(null);

    onLoadFullImageRef.current(currentImage.id)
      .then(result => {
        if (!cancelled && result) {
          blobUrlRef.current = result.blobUrl;
          setImageUrl(result.blobUrl);
        }
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, currentIndex, currentImage?.id]);

  // Limpiar al cerrar
  useEffect(() => {
    if (!isOpen && blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
      setImageUrl(null);
    }
  }, [isOpen]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // Teclado: Esc cierra, ← → navegan
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, goPrev, goNext]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => Math.max(0.3, Math.min(5, prev + (e.deltaY > 0 ? -0.1 : 0.1))));
  }, []);

  const handleDownload = async () => {
    if (!currentImage) return;
    setDownloading(true);
    try { await onDownload(currentImage.id); }
    finally { setDownloading(false); }
  };

  if (!isOpen || !currentImage) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      onWheel={handleWheel}
    >
      {/* Toolbar superior */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-3">
          <span className="text-white/80 text-[14px] font-medium truncate max-w-[200px]">
            {currentImage.filename}
          </span>
          {images.length > 1 && (
            <span className="text-white/50 text-[13px] flex-shrink-0">
              {currentIndex + 1} / {images.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(p => Math.min(5, p + 0.25))}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Acercar"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={() => setZoom(p => Math.max(0.3, p - 0.25))}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Alejar"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            onClick={() => setRotation(p => p + 90)}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Rotar"
          >
            <RotateCw className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-white/20 mx-1" />
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Descargar imagen"
          >
            {downloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors ml-2"
            title="Cerrar (Esc)"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Flecha anterior */}
      {hasPrev && (
        <button
          onClick={goPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/40 hover:bg-black/70 text-white transition-colors"
          title="Anterior (←)"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Flecha siguiente */}
      {hasNext && (
        <button
          onClick={goNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/40 hover:bg-black/70 text-white transition-colors"
          title="Siguiente (→)"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Imagen */}
      <div className="flex items-center justify-center w-full h-full p-16">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-white/60" />
            <span className="text-white/60 text-[14px]">Descifrando imagen...</span>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={currentImage.filename}
            className="max-w-full max-h-full object-contain select-none transition-transform duration-200"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <X className="w-10 h-10 text-red-400" />
            <span className="text-red-400 text-[14px]">Error al descifrar imagen</span>
          </div>
        )}
      </div>

      {/* Indicador de zoom */}
      {zoom !== 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white/80 px-3 py-1.5 rounded-full text-[13px] font-medium">
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  );
}
