'use client';

import { X } from 'lucide-react';

interface ReplyPreviewProps {
  text: string;
  senderName: string;
  onCancel: () => void;
}

/**
 * Barra que aparece encima del input cuando el usuario va a responder un mensaje.
 */
export function ReplyPreview({ text, senderName, onCancel }: ReplyPreviewProps) {
  const truncated = text.length > 60 ? `${text.slice(0, 60)}…` : text;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-xl bg-[#f0f2f5] border-l-2 border-[#0084ff]">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[#0084ff]">Respondiendo a {senderName}</p>
        <p className="text-[12px] text-[#65676b] truncate">{truncated || 'Mensaje eliminado'}</p>
      </div>
      <button
        onClick={onCancel}
        className="flex-shrink-0 p-1 rounded-full hover:bg-[#e4e6eb] text-[#65676b]"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
