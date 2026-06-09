'use client';

import { useEffect } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** estilo de peligro (rojo) para acciones destructivas */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-[#242526] rounded-2xl shadow-2xl border border-[#e4e6eb] dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-[17px] font-semibold text-[#050505] dark:text-white mb-1.5">{title}</h3>
          <p className="text-[14px] text-[#65676b] dark:text-gray-300 leading-snug">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#e4e6eb] dark:border-gray-700">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#050505] dark:text-white bg-[#e4e6eb] hover:bg-[#d8dadf] dark:bg-white/10 dark:hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-500' : 'bg-[#0084ff] hover:bg-[#0073e6]'
            }`}
          >
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
