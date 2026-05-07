'use client';

import { useState, useEffect } from 'react';
import { useCreateGroup } from '@/hooks/useGroups';
import { useContacts } from '@/hooks/useContacts';

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (groupId: string) => void;
}

export function CreateGroupModal({ open, onClose, onCreated }: CreateGroupModalProps) {
  const { createGroup, loading, error } = useCreateGroup();
  const { contacts, loading: contactsLoading } = useContacts();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) { setName(''); setDescription(''); setSelectedIds(new Set()); }
  }, [open]);

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim() || selectedIds.size < 2) return;
    const result = await createGroup({
      name: name.trim(),
      description: description.trim() || undefined,
      member_ids: Array.from(selectedIds),
    });
    if (result) {
      onCreated?.(result.id);
      onClose();
    }
  }

  if (!open) return null;

  const canCreate = name.trim().length > 0 && selectedIds.size >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[#2c2c2e] rounded-2xl shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-base font-semibold text-white">Nuevo grupo</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Nombre del grupo */}
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider block mb-1.5">
              Nombre del grupo *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder="Ej: Equipo de proyecto"
              className="w-full bg-white/10 text-white placeholder-white/40 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider block mb-1.5">
              Descripción (opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="¿De qué trata este grupo?"
              className="w-full bg-white/10 text-white placeholder-white/40 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Selección de miembros */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
              Miembros — selecciona al menos 2
              {selectedIds.size > 0 && (
                <span className="ml-1 text-blue-400">({selectedIds.size} seleccionados)</span>
              )}
            </p>

            {contactsLoading && (
              <p className="text-white/40 text-sm py-3 text-center">Cargando contactos...</p>
            )}

            {!contactsLoading && contacts.length === 0 && (
              <p className="text-white/40 text-sm py-3 text-center">
                Necesitas contactos para crear un grupo
              </p>
            )}

            <div className="space-y-1 max-h-52 overflow-y-auto">
              {contacts.map((c) => {
                if (!c.friend) return null;
                const selected = selectedIds.has(c.friend.id);
                return (
                  <button
                    key={c.friend.id}
                    onClick={() => toggleMember(c.friend!.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                      selected ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="size-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {c.friend.username[0]?.toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm text-white">{c.friend.username}</span>
                    {selected && <span className="text-blue-400 text-sm">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 shrink-0">
          <button
            onClick={handleCreate}
            disabled={!canCreate || loading}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Creando...' : `Crear grupo${selectedIds.size >= 2 ? ` (${selectedIds.size + 1})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
