'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Conversation } from '@/hooks/useConversations';
import { ConversationActions } from '@/components/chat/ConversationActions';
import { OnlineIndicator } from '@/components/chat/OnlineIndicator';

interface Props {
  conversations: Conversation[];
  isUserOnline: (userId: string) => boolean;
  onArchive: (id: string, archived: boolean) => Promise<boolean>;
  onMute: (id: string, mutedUntil: string | null) => Promise<boolean>;
}

export function ArchivedSection({ conversations, isUserOnline, onArchive, onMute }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (conversations.length === 0) return null;

  return (
    <div className="border-t border-[#e4e6eb] dark:border-gray-800 mt-2 pt-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[#65676b] dark:text-gray-400 text-[13px] font-semibold uppercase tracking-wide hover:bg-[#f0f2f5] dark:hover:bg-gray-800/40 rounded-lg transition-colors"
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="5" rx="1" />
          <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M10 13h4" />
        </svg>
        Archivadas ({conversations.length})
      </button>

      {expanded &&
        conversations.map((conv) => {
          const displayName = conv.isGroup ? conv.groupName || 'Grupo' : conv.otherUser.username;
          return (
            <div key={conv.id} className="group/conv relative flex items-center gap-1 mb-1">
              <Link
                href={`/chat/${conv.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#f0f2f5] dark:hover:bg-gray-800/40 transition-colors flex-1 min-w-0"
              >
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#65676b] to-[#b0b3b8] flex items-center justify-center text-white text-lg font-medium">
                    {displayName[0]?.toUpperCase() || '?'}
                  </div>
                  {!conv.isGroup && <OnlineIndicator isOnline={isUserOnline(conv.otherUser.id)} size="md" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#65676b] dark:text-gray-300 text-[15px] font-medium truncate">
                    {displayName}
                  </p>
                  <p className="text-[#65676b] dark:text-gray-500 text-[13px] truncate">Archivado</p>
                </div>
              </Link>
              <ConversationActions
                conversationId={conv.id}
                isArchived={conv.isArchived}
                mutedUntil={conv.mutedUntil}
                onArchive={onArchive}
                onMute={onMute}
              />
            </div>
          );
        })}
    </div>
  );
}
