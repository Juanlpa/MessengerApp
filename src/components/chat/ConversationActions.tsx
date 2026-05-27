'use client';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { isMuted } from '@/hooks/useConversations';

interface Props {
  conversationId: string;
  isArchived: boolean;
  mutedUntil: string | null;
  onArchive: (id: string, archived: boolean) => Promise<boolean>;
  onMute: (id: string, mutedUntil: string | null) => Promise<boolean>;
}

export function ConversationActions({
  conversationId,
  isArchived,
  mutedUntil,
  onArchive,
  onMute,
}: Props) {
  const currentlyMuted = isMuted(mutedUntil);

  function muteUntil(hours: number) {
    const until = new Date(Date.now() + hours * 3_600_000).toISOString();
    onMute(conversationId, until);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="p-1.5 rounded-full hover:bg-[#e4e6eb] text-[#65676b] opacity-0 group-hover/conv:opacity-100 transition-opacity flex-shrink-0"
        aria-label="Más opciones"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start">
        <DropdownMenuItem onClick={() => onArchive(conversationId, !isArchived)}>
          {isArchived ? 'Desarchivar' : 'Archivar'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {currentlyMuted ? (
          <DropdownMenuItem onClick={() => onMute(conversationId, null)}>
            Activar notificaciones
          </DropdownMenuItem>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Silenciar</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => muteUntil(1)}>1 hora</DropdownMenuItem>
              <DropdownMenuItem onClick={() => muteUntil(8)}>8 horas</DropdownMenuItem>
              <DropdownMenuItem onClick={() => muteUntil(24)}>24 horas</DropdownMenuItem>
              <DropdownMenuItem onClick={() => muteUntil(168)}>7 días</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
