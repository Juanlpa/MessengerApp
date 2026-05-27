'use client';

import { useState } from 'react';
import { useDeleteContact } from '@/hooks/useContacts';

interface ContactCardProps {
  friendshipId: string;
  username: string;
  userId: string;
  isOnline?: boolean;
  onDeleted?: () => void;
  onStartChat?: (userId: string) => void;
}

/** Genera un color de fondo determinístico a partir de userId */
function avatarColor(userId: string): string {
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500',
    'bg-rose-500', 'bg-amber-500', 'bg-teal-500',
  ];
  const index = userId.charCodeAt(0) % colors.length;
  return colors[index];
}

export function ContactCard({
  friendshipId,
  username,
  userId,
  isOnline = false,
  onDeleted,
  onStartChat,
}: ContactCardProps) {
  const { deleteContact, loading } = useDeleteContact();
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return; }
    const ok = await deleteContact(friendshipId);
    if (ok) onDeleted?.();
    setConfirming(false);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-lg transition-colors group">
      {/* Avatar con inicial */}
      <div className="relative shrink-0">
        <div
          className={`size-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${avatarColor(userId)}`}
        >
          {username[0].toUpperCase()}
        </div>
        {isOnline && (
          <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full border-2 border-[#1c1c1e]" />
        )}
      </div>

      {/* Nombre */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{username}</p>
        <p className="text-xs text-white/40">{isOnline ? 'En línea' : 'Desconectado'}</p>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {onStartChat && (
          <button
            onClick={() => onStartChat(userId)}
            className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Mensaje
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={loading}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            confirming
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-white/10 hover:bg-white/20 text-white/70'
          }`}
        >
          {confirming ? '¿Confirmar?' : 'Eliminar'}
        </button>
      </div>
    </div>
  );
}
