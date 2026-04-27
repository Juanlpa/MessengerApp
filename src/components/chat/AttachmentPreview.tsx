'use client';

/**
 * AttachmentPreview.tsx — Preview de adjuntos dentro de burbujas de chat
 *
 * Tipos de preview:
 * - Imagen: muestra thumbnail descifrado, click abre ImageViewer
 * - Archivo: ícono + nombre + tamaño, click descarga
 * - Voz: renderiza VoicePlayer (delegado al componente padre)
 */

import { useState, useEffect, useCallback } from 'react';
import { Download, FileText, Image as ImageIcon, Loader2, Eye } from 'lucide-react';

interface AttachmentPreviewProps {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  attachmentType: 'image' | 'voice' | 'file';
  isOwnMessage: boolean;
  onDownload: (attachmentId: string) => Promise<void>;
  onViewImage: (attachmentId: string) => void;
  onLoadThumbnail: (attachmentId: string) => Promise<{ blobUrl: string } | null>;
}

export function AttachmentPreview({
  attachmentId,
  filename,
  mimeType,
  sizeBytes,
  attachmentType,
  isOwnMessage,
  onDownload,
  onViewImage,
  onLoadThumbnail,
}: AttachmentPreviewProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Cargar thumbnail para imágenes
  useEffect(() => {
    if (attachmentType !== 'image') return;

    let cancelled = false;
    setLoading(true);

    onLoadThumbnail(attachmentId).then(result => {
      if (!cancelled && result) {
        setThumbnailUrl(result.blobUrl);
      }
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentId, attachmentType]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      await onDownload(attachmentId);
    } finally {
      setDownloading(false);
    }
  }, [attachmentId, onDownload]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = () => {
    if (mimeType === 'application/pdf') {
      return <FileText className="w-8 h-8" />;
    }
    if (mimeType.includes('word') || mimeType.includes('document')) {
      return <FileText className="w-8 h-8" />;
    }
    if (mimeType.includes('sheet') || mimeType.includes('excel')) {
      return <FileText className="w-8 h-8" />;
    }
    return <FileText className="w-8 h-8" />;
  };

  // ── Imagen ──────────────────────────────────────────────────────
  if (attachmentType === 'image') {
    return (
      <div className="mb-1 rounded-xl overflow-hidden max-w-[280px]">
        {loading ? (
          <div className="w-[280px] h-[180px] bg-black/10 flex items-center justify-center rounded-xl">
            <Loader2 className="w-6 h-6 animate-spin text-white/70" />
          </div>
        ) : thumbnailUrl ? (
          <div className="relative group cursor-pointer" onClick={() => onViewImage(attachmentId)}>
            <img
              src={thumbnailUrl}
              alt={filename}
              className="w-full h-auto rounded-xl object-cover max-h-[300px]"
              loading="lazy"
            />
            {/* Overlay al hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-xl flex items-center justify-center">
              <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ) : (
          <div
            className="w-[280px] h-[120px] bg-black/10 flex flex-col items-center justify-center rounded-xl cursor-pointer gap-2"
            onClick={() => onViewImage(attachmentId)}
          >
            <ImageIcon className="w-8 h-8 text-white/60" />
            <span className="text-[12px] text-white/60">Click para ver</span>
          </div>
        )}
        <div className="flex items-center justify-between px-1 py-1">
          <span className={`text-[11px] truncate max-w-[200px] ${isOwnMessage ? 'text-white/70' : 'text-[#65676b]'}`}>
            {filename}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            disabled={downloading}
            className={`p-1 rounded-full transition-colors ${
              isOwnMessage ? 'hover:bg-white/20 text-white/70' : 'hover:bg-black/5 text-[#65676b]'
            }`}
            title="Descargar"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Archivo genérico ────────────────────────────────────────────
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl mb-1 cursor-pointer transition-colors ${
        isOwnMessage
          ? 'bg-white/15 hover:bg-white/25'
          : 'bg-black/5 hover:bg-black/10'
      }`}
      onClick={handleDownload}
    >
      <div className={`flex-shrink-0 ${isOwnMessage ? 'text-white/80' : 'text-[#0084ff]'}`}>
        {getFileIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[14px] font-medium truncate ${
          isOwnMessage ? 'text-white' : 'text-[#050505]'
        }`}>
          {filename}
        </p>
        <p className={`text-[12px] ${isOwnMessage ? 'text-white/60' : 'text-[#65676b]'}`}>
          {formatSize(sizeBytes)} · {mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
        </p>
      </div>
      <div className={`flex-shrink-0 ${isOwnMessage ? 'text-white/70' : 'text-[#65676b]'}`}>
        {downloading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Download className="w-5 h-5" />
        )}
      </div>
    </div>
  );
}
