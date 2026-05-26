'use client';

interface Reaction {
  emoji: string;
  userIds: string[];
}

interface MessageReactionsProps {
  reactions: Reaction[];
  currentUserId: string;
  onToggle: (emoji: string) => void;
  isMe: boolean;
}

/**
 * Fila de reacciones emoji debajo de un mensaje.
 * Click en una reacción → añadir o quitar la propia.
 */
export function MessageReactions({ reactions, currentUserId, onToggle, isMe }: MessageReactionsProps) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 mt-0.5 ${isMe ? 'justify-end mr-1' : 'justify-start ml-1'}`}>
      {reactions.map((r) => {
        const reacted = r.userIds.includes(currentUserId);
        return (
          <button
            key={r.emoji}
            onClick={() => onToggle(r.emoji)}
            title={reacted ? 'Quitar reacción' : 'Reaccionar'}
            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[13px] transition-colors ${
              reacted
                ? 'bg-[#0084ff]/15 border border-[#0084ff]/40'
                : 'bg-[#f0f2f5] border border-transparent hover:border-[#e4e6eb]'
            }`}
          >
            <span>{r.emoji}</span>
            {r.userIds.length > 1 && (
              <span className="text-[11px] text-[#65676b] font-medium">{r.userIds.length}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
