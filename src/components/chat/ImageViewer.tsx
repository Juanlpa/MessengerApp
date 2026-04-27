'use client';

/**
 * ImageViewer.tsx — Modal fullscreen para ver imágenes descifradas
 *
 * Features:
 * - Imagen descifrada a tamaño completo
 * - Botón de descarga
 * - Zoom con scroll (wheel)
 * - Esc o click fuera para cerrar
 * - Transición suave de apertura/cierre
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCw, Loader2 } from 'lucide-react';

interface ImageViewerProps {
  isOpen: boolean;
  attachmentId: string;
  filename: string;
  onClose: () => void;
  onDownload: (attachmentId: string) => Promise<void>;
  onLoadFullImage: (attachmentId: string) => Promise<{ blobUrl: string } | null>;
}

export function ImageViewer({
  isOpen,
  attachmentId,
  filename,
  onClose,
  onDownload,
  onLoadFullImage,
}: ImageViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Cargar imagen completa al abrir
  useEffect(() => {
    if (!isOpen || !attachmentId) return;

    let cancelled = false;
    setLoading(true);
    setZoom(1);
    setRotation(0);

    onLoadFullImage(attachmentId).then(result => {
      if (!cancelled && result) {
        setImageUrl(result.blobUrl);
      }
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, attachmentId, onLoadFullImage]);

  // Limpiar blob URL al cerrar
  useEffect(() => {
    if (!isOpen && imageUrl) {
      URL.revokeObjectURL(imageUrl);
      setImageUrl(null);
    }
  }, [isOpen, imageUrl]);

  // Cerrar con Esc
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Click fuera de la imagen para cerrar
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  }, [onClose]);

  // Zoom con scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => {
      const next = prev + (e.deltaY > 0 ? -0.1 : 0.1);
      return Math.max(0.3, Math.min(5, next));
    });
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await onDownload(attachmentId);
    } finally {
      setDownloading(false);
    }
  };

  if (!isOpen) return null;

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
          <span className="text-white/80 text-[14px] font-medium truncate max-w-[300px]">
            {filename}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom in */}
          <button
            onClick={() => setZoom(prev => Math.min(5, prev + 0.25))}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Acercar"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          {/* Zoom out */}
          <button
            onClick={() => setZoom(prev => Math.max(0.3, prev - 0.25))}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Alejar"
          >
            <ZoomOut className="w-5 h-5" />
          </button>

          {/* Rotar */}
          <button
            onClick={() => setRotation(prev => prev + 90)}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Rotar"
          >
            <RotateCw className="w-5 h-5" />
          </button>

          {/* Separador */}
          <div className="w-px h-6 bg-white/20 mx-1" />

          {/* Descargar */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Descargar imagen"
          >
            {downloading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
          </button>

          {/* Cerrar */}
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors ml-2"
            title="Cerrar (Esc)"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

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
            alt={filename}
            className="max-w-full max-h-full object-contain select-none transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
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
