'use client';

import { useAuthStore } from '@/stores/auth-store';
import { useRemoveMember, type GroupMember } from '@/hooks/useGroups';
import { ChangeRoleModal } from './ChangeRoleModal';
import { useState } from 'react';

interface GroupMembersListProps {
  groupId: string;
  members: GroupMember[];
  currentUserRole: 'admin' | 'member';
  onChanged: () => void;
}

export function GroupMembersList({
  groupId,
  members,
  currentUserRole,
  onChanged,
}: GroupMembersListProps) {
  const { user } = useAuthStore();
  const { removeMember, loading: removing } = useRemoveMember();
  const [roleTarget, setRoleTarget] = useState<GroupMember | null>(null);

  async function handleRemove(userId: string) {
    const ok = await removeMember(groupId, userId);
    if (ok) onChanged();
  }

  const isAdmin = currentUserRole === 'admin';
  const adminCount = members.filter((m) => m.role === 'admin').length;

  return (
    <div className="space-y-1">
      {members.map((m) => {
        const isSelf = m.user_id === user?.id;
        const canRemove = isAdmin && !isSelf;
        const canLeave = isSelf;
        const canChangeRole = isAdmin && !isSelf && !(m.role === 'admin' && adminCount <= 1);

        return (
          <div
            key={m.user_id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 group"
          >
            {/* Avatar */}
            <div className="size-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
              {m.username[0]?.toUpperCase() ?? '?'}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">
                {m.username}
                {isSelf && <span className="ml-1 text-white/40 text-xs">(tú)</span>}
              </p>
              <p className="text-xs text-white/40 capitalize">{m.role}</p>
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {canChangeRole && (
                <button
                  onClick={() => setRoleTarget(m)}
                  className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
                >
                  Rol
                </button>
              )}
              {canRemove && (
                <button
                  onClick={() => handleRemove(m.user_id)}
                  disabled={removing}
                  className="text-xs px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-colors"
                >
                  Quitar
                </button>
              )}
              {canLeave && (
                <button
                  onClick={() => handleRemove(m.user_id)}
                  disabled={removing}
                  className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
                >
                  Salir
                </button>
              )}
            </div>
          </div>
        );
      })}

      {roleTarget && (
        <ChangeRoleModal
          groupId={groupId}
          member={roleTarget}
          onClose={() => setRoleTarget(null)}
          onChanged={() => { setRoleTarget(null); onChanged(); }}
        />
      )}
    </div>
  );
}
