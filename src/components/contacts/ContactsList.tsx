'use client';

import { useState } from 'react';
import { useContacts, usePendingRequests, useSentRequests, useDeleteContact } from '@/hooks/useContacts';
import { ContactCard } from './ContactCard';
import { PendingRequests } from './PendingRequests';
import { SendRequestModal } from './SendRequestModal';

interface ContactsListProps {
  onStartChat?: (userId: string) => void;
}

export function ContactsList({ onStartChat }: ContactsListProps) {
  const { contacts, loading, refetch } = useContacts();
  const { requests } = usePendingRequests();
  const { requests: sentRequests, loading: sentLoading, refetch: refetchSent } = useSentRequests();
  const { deleteContact, loading: cancelling } = useDeleteContact();
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<'friends' | 'pending' | 'sent'>('friends');

  const pendingCount = requests.length;

  async function handleCancelSent(friendshipId: string) {
    const ok = await deleteContact(friendshipId);
    if (ok) refetchSent();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e4e6eb] dark:border-white/10">
        <h2 className="text-sm font-semibold text-[#050505] dark:text-white">Contactos</h2>
        <button
          onClick={() => setShowModal(true)}
          className="text-xs px-3 py-1.5 rounded-lg bg-[#0084ff] hover:bg-[#0073e6] dark:bg-blue-600 dark:hover:bg-blue-500 text-white transition-colors"
        >
          + Agregar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#e4e6eb] dark:border-white/10">
        <button
          onClick={() => setTab('friends')}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
            tab === 'friends'
              ? 'text-[#0084ff] dark:text-blue-400 border-b-2 border-[#0084ff] dark:border-blue-400'
              : 'text-[#65676b] dark:text-white/50 hover:text-[#050505] dark:hover:text-white/80'
          }`}
        >
          Amigos ({contacts.length})
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
            tab === 'pending'
              ? 'text-[#0084ff] dark:text-blue-400 border-b-2 border-[#0084ff] dark:border-blue-400'
              : 'text-[#65676b] dark:text-white/50 hover:text-[#050505] dark:hover:text-white/80'
          }`}
        >
          Solicitudes
          {pendingCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center size-4 rounded-full bg-red-500 text-[10px] text-white font-bold">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('sent')}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
            tab === 'sent'
              ? 'text-[#0084ff] dark:text-blue-400 border-b-2 border-[#0084ff] dark:border-blue-400'
              : 'text-[#65676b] dark:text-white/50 hover:text-[#050505] dark:hover:text-white/80'
          }`}
        >
          Enviadas ({sentRequests.length})
        </button>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto py-2">
        {tab === 'friends' && (
          <>
            {loading && (
              <p className="px-4 py-3 text-[#65676b] dark:text-white/40 text-sm">Cargando...</p>
            )}
            {!loading && contacts.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-[#65676b] dark:text-white/40 text-sm">Aún no tienes contactos.</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-2 text-[#0084ff] dark:text-blue-400 text-sm hover:underline"
                >
                  Agregar uno ahora
                </button>
              </div>
            )}
            {contacts.map((c) => (
              <ContactCard
                key={c.friendship_id}
                friendshipId={c.friendship_id}
                username={c.friend?.username ?? '?'}
                userId={c.friend?.id ?? ''}
                onDeleted={refetch}
                onStartChat={onStartChat}
              />
            ))}
          </>
        )}

        {tab === 'pending' && (
          <div className="px-2 py-2">
            <PendingRequests onAccepted={refetch} />
          </div>
        )}

        {tab === 'sent' && (
          <>
            {sentLoading && (
              <p className="px-4 py-3 text-[#65676b] dark:text-white/40 text-sm">Cargando...</p>
            )}
            {!sentLoading && sentRequests.length === 0 && (
              <p className="px-4 py-8 text-center text-[#65676b] dark:text-white/40 text-sm">
                No tienes solicitudes pendientes de respuesta.
              </p>
            )}
            {sentRequests.map((req) => (
              <div
                key={req.friendship_id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#f0f2f5] dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                <div className="size-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                  {req.addressee?.username?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#050505] dark:text-white truncate">
                    {req.addressee?.username ?? 'Usuario desconocido'}
                  </p>
                  <p className="text-xs text-[#65676b] dark:text-white/40">Pendiente de respuesta</p>
                </div>
                <button
                  onClick={() => handleCancelSent(req.friendship_id)}
                  disabled={cancelling}
                  className="text-xs px-3 py-1.5 rounded bg-[#e4e6eb] hover:bg-[#d8dadf] text-[#050505] dark:bg-white/10 dark:hover:bg-white/20 dark:text-white/70 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Modal para agregar contacto */}
      <SendRequestModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSent={() => refetchSent()}
      />
    </div>
  );
}
