'use client';

import { useState } from 'react';
import { useUpdateGroup, useDeleteGroup, useRemoveMember, type GroupDetail } from '@/hooks/useGroups';
import { GroupAvatar } from './GroupAvatar';
import { GroupMembersList } from './GroupMembersList';
import { AddMembersModal } from './AddMembersModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuthStore } from '@/stores/auth-store';

interface GroupSettingsProps {
  group: GroupDetail;
  onClose: () => void;
  onUpdated: () => void;
  /** Se llama cuando el usuario sale o elimina el grupo (para navegar fuera) */
  onLeftGroup?: () => void;
}

export function GroupSettings({ group, onClose, onUpdated, onLeftGroup }: GroupSettingsProps) {
  const user = useAuthStore(s => s.user);
  const { updateGroup, loading, error } = useUpdateGroup();
  const { deleteGroup, loading: deleting } = useDeleteGroup();
  const { removeMember, loading: leaving } = useRemoveMember();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [editing, setEditing] = useState(false);
  // Confirmación con modal acorde al UI (en vez de window.confirm nativo)
  const [confirmAction, setConfirmAction] = useState<'leave' | 'delete' | null>(null);

  const currentMember = group.members.find((m) => m.user_id === user?.id);
  const isAdmin = currentMember?.role === 'admin';

  async function handleSave() {
    const ok = await updateGroup(group.id, { name, description });
    if (ok) { setEditing(false); onUpdated(); }
  }

  async function confirmLeave() {
    if (!user?.id) return;
    const ok = await removeMember(group.id, user.id);
    if (ok) { setConfirmAction(null); onClose(); onLeftGroup?.(); }
  }

  async function confirmDelete() {
    const ok = await deleteGroup(group.id);
    if (ok) { setConfirmAction(null); onClose(); onLeftGroup?.(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full max-w-md bg-[#2c2c2e] rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-base font-semibold text-white">Información del grupo</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Avatar + nombre */}
          <div className="flex flex-col items-center gap-3 py-2">
            <GroupAvatar name={group.name} avatarUrl={group.avatar_url} size="lg" />
            {editing ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                className="text-center text-base font-semibold text-white bg-white/10 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 w-full max-w-xs"
              />
            ) : (
              <h3 className="text-base font-semibold text-white">{group.name}</h3>
            )}
            <p className="text-xs text-white/40">{group.members.length} miembros</p>
          </div>

          {/* Descripción */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Descripción</p>
            {editing ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                rows={3}
                className="w-full bg-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            ) : (
              <p className="text-sm text-white/70">{group.description || 'Sin descripción'}</p>
            )}
          </div>

          {/* Botones de edición — solo admins */}
          {isAdmin && (
            <div className="flex gap-2">
              {editing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={loading || !name.trim()}
                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setName(group.name); setDescription(group.description ?? ''); }}
                    className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-sm transition-colors"
                >
                  Editar grupo
                </button>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          {/* Miembros */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-white/40 uppercase tracking-wider">Miembros</p>
              {isAdmin && (
                <button
                  onClick={() => setShowAddMembers(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  + Agregar
                </button>
              )}
            </div>
            <GroupMembersList
              groupId={group.id}
              members={group.members}
              currentUserRole={currentMember?.role ?? 'member'}
              onChanged={onUpdated}
            />
          </div>

          {/* Acciones: salir / eliminar */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <button
              onClick={() => setConfirmAction('leave')}
              disabled={leaving}
              className="w-full py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-red-400 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {leaving ? 'Saliendo...' : 'Salir del grupo'}
            </button>
            {isAdmin && (
              <button
                onClick={() => setConfirmAction('delete')}
                disabled={deleting}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar grupo'}
              </button>
            )}
          </div>
        </div>
      </div>

      <AddMembersModal
        groupId={group.id}
        existingMemberIds={group.members.map((m) => m.user_id)}
        open={showAddMembers}
        onClose={() => setShowAddMembers(false)}
        onAdded={onUpdated}
      />

      {/* Confirmación de salir/eliminar — modal acorde al UI */}
      <ConfirmDialog
        open={confirmAction === 'leave'}
        title="Salir del grupo"
        message="¿Seguro que quieres salir? Dejarás de recibir los mensajes de este grupo."
        confirmLabel="Salir"
        danger
        loading={leaving}
        onConfirm={confirmLeave}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="Eliminar grupo"
        message="Esto eliminará el grupo y todos sus mensajes para todos los miembros. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
