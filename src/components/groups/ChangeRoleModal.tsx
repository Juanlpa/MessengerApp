'use client';

import { useChangeRole, type GroupMember } from '@/hooks/useGroups';

interface ChangeRoleModalProps {
  groupId: string;
  member: GroupMember;
  onClose: () => void;
  onChanged: () => void;
}

export function ChangeRoleModal({ groupId, member, onClose, onChanged }: ChangeRoleModalProps) {
  const { changeRole, loading, error } = useChangeRole();

  async function handleChange(role: 'admin' | 'member') {
    const ok = await changeRole(groupId, member.user_id, role);
    if (ok) onChanged();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-80 bg-[#2c2c2e] rounded-2xl shadow-xl p-5">
        <h3 className="text-base font-semibold text-white mb-1">Cambiar rol</h3>
        <p className="text-sm text-white/50 mb-4">
          Cambiar el rol de <span className="text-white font-medium">{member.username}</span>
        </p>

        <div className="space-y-2">
          <button
            onClick={() => handleChange('admin')}
            disabled={loading || member.role === 'admin'}
            className="w-full text-left px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <p className="text-sm font-medium text-white">Administrador</p>
            <p className="text-xs text-white/40">Puede editar el grupo, agregar y quitar miembros</p>
          </button>

          <button
            onClick={() => handleChange('member')}
            disabled={loading || member.role === 'member'}
            className="w-full text-left px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <p className="text-sm font-medium text-white">Miembro</p>
            <p className="text-xs text-white/40">Solo puede enviar mensajes y salirse del grupo</p>
          </button>
        </div>

        {error && <p className="mt-3 text-red-400 text-xs">{error}</p>}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-sm transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
