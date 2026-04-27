'use client';

/**
 * AttachmentButton.tsx — Botón de clip para adjuntar archivos cifrados
 *
 * Funcionalidades:
 * - Input file oculto con tipos aceptados filtrados
 * - Validación previa (tamaño, tipo)
 * - Barra de progreso durante cifrado/subida
 * - Indicador de error con auto-dismiss
 */

import { useRef, useState } from 'react';
import { Paperclip, X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import type { UploadProgress, AttachmentMeta } from '@/hooks/useAttachments';

// Extensiones aceptadas (matching mime-validator whitelist)
const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

interface AttachmentButtonProps {
  onFileSelected: (file: File) => Promise<AttachmentMeta | null>;
  uploadProgress: UploadProgress | null;
  error: string | null;
  onClearError: () => void;
  disabled?: boolean;
}

export function AttachmentButton({
  onFileSelected,
  uploadProgress,
  error,
  onClearError,
  disabled = false,
}: AttachmentButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleClick = () => {
    if (disabled || uploadProgress?.phase === 'uploading' || uploadProgress?.phase === 'encrypting') {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await onFileSelected(file);

    // Resetear input para permitir seleccionar el mismo archivo de nuevo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await onFileSelected(file);
  };

  const isUploading = uploadProgress?.phase === 'uploading' || uploadProgress?.phase === 'encrypting';

  return (
    <div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Input file oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        className="hidden"
        id="attachment-file-input"
      />

      {/* Botón del clip */}
      <button
        onClick={handleClick}
        disabled={disabled || isUploading}
        className={`p-2 rounded-full transition-colors flex-shrink-0 ${
          isDragOver
            ? 'bg-[#e3f2fd] text-[#0084ff]'
            : isUploading
              ? 'text-[#65676b] cursor-wait'
              : 'text-[#0084ff] hover:bg-[#f0f2f5]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title="Adjuntar archivo cifrado"
        aria-label="Adjuntar archivo"
        id="btn-attach-file"
      >
        {isUploading ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <Paperclip className="w-6 h-6" />
        )}
      </button>

      {/* Progress bar flotante */}
      {uploadProgress && uploadProgress.phase !== 'done' && uploadProgress.phase !== 'error' && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-lg shadow-lg border border-[#e4e6eb] p-3 z-50">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#0084ff]" />
            <span className="text-[13px] text-[#050505] font-medium">
              {uploadProgress.message}
            </span>
          </div>
          <div className="w-full bg-[#f0f2f5] rounded-full h-2">
            <div
              className="bg-[#0084ff] h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Éxito */}
      {uploadProgress?.phase === 'done' && (
        <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-lg border border-[#e4e6eb] p-3 z-50">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-[13px] text-emerald-600 font-medium">
              {uploadProgress.message}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-white rounded-lg shadow-lg border border-red-200 p-3 z-50">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-[13px] text-red-600 break-words">{error}</span>
            </div>
            <button
              onClick={onClearError}
              className="flex-shrink-0 p-0.5 hover:bg-red-50 rounded"
            >
              <X className="w-3 h-3 text-red-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
