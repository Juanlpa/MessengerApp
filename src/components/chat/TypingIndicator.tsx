/**
 * TypingIndicator — Muestra animación de "escribiendo..." estilo Messenger
 * 
 * Tres puntos que se animan (bouncing dots) con el texto del usuario que escribe.
 */

'use client';

interface TypingIndicatorProps {
  typingText: string | null;
}

export function TypingIndicator({ typingText }: TypingIndicatorProps) {
  if (!typingText) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-[13px] text-[#65676b]">
      {/* Burbuja con puntos animados */}
      <div className="bg-[#e4e6eb] rounded-full px-3 py-2 flex items-center gap-1">
        <span className="typing-dot" style={{ animationDelay: '0ms' }} />
        <span className="typing-dot" style={{ animationDelay: '150ms' }} />
        <span className="typing-dot" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-[12px] italic">{typingText}</span>

      <style jsx>{`
        .typing-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #65676b;
          animation: typingBounce 1.2s infinite ease-in-out;
        }

        @keyframes typingBounce {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
