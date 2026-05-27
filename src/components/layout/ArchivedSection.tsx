'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useConversations } from '@/hooks/useConversations';
import { ConversationActions } from '@/components/chat/ConversationActions';
import { OnlineIndicator } from '@/components/chat/OnlineIndicator';

interface Props {
  isUserOnline: (userId: string) => boolean;
}

export function ArchivedSection({ isUserOnline }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { conversations, archive, mute } = useConversations(true);

  if (conversations.length === 0) return null;

  return (
    <div className="border-t border-[#e4e6eb] mt-1 pt-1">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[#65676b] text-[13px] font-medium hover:bg-[#f0f2f5] rounded-lg transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
        Archivadas ({conversations.length})
      </button>

      {expanded && conversations.map(conv => (
        <div key={conv.id} className="group/conv relative flex items-center gap-1 mb-1">
          <Link
            href={`/chat/${conv.id}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#f0f2f5] transition-colors flex-1 min-w-0"
          >
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#65676b] to-[#b0b3b8] flex items-center justify-center text-white text-lg font-medium">
                {conv.otherUser.username[0]?.toUpperCase() || '?'}
              </div>
              <OnlineIndicator isOnline={isUserOnline(conv.otherUser.id)} size="md" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[#65676b] text-[15px] font-medium truncate">
                {conv.otherUser.username}
              </p>
              <p className="text-[#65676b] text-[13px] truncate">Archivado</p>
            </div>
          </Link>
          <ConversationActions
            conversationId={conv.id}
            isArchived={conv.isArchived}
            mutedUntil={conv.mutedUntil}
            onArchive={archive}
            onMute={mute}
          />
        </div>
      ))}
    </div>
  );
}
