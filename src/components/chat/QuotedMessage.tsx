'use client';

interface QuotedMessageProps {
  text: string;
  senderName: string;
  isMe: boolean;
}

/**
 * Burbuja pequeña que muestra el mensaje al que se está respondiendo,
 * encima de la burbuja principal.
 */
export function QuotedMessage({ text, senderName, isMe }: QuotedMessageProps) {
  const truncated = text.length > 80 ? `${text.slice(0, 80)}…` : text;

  return (
    <div
      className={`max-w-[75%] mb-0.5 px-3 py-1.5 rounded-[12px] border-l-2 text-[13px] ${
        isMe
          ? 'border-white/60 bg-[#0073e6]/80 text-white/90'
          : 'border-[#0084ff] bg-[#e4e6eb] text-[#65676b]'
      }`}
    >
      <p className="font-semibold text-[12px] mb-0.5">{senderName}</p>
      <p className="leading-tight">{truncated || 'Mensaje eliminado'}</p>
    </div>
  );
}
