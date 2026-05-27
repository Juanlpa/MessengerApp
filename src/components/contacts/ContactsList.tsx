'use client';

import { useState } from 'react';
import { useContacts, usePendingRequests } from '@/hooks/useContacts';
import { ContactCard } from './ContactCard';
import { PendingRequests } from './PendingRequests';
import { SendRequestModal } from './SendRequestModal';

interface ContactsListProps {
  onStartChat?: (userId: string) => void;
}

export function ContactsList({ onStartChat }: ContactsListProps) {
  const { contacts, loading, refetch } = useContacts();
  const { requests } = usePendingRequests();
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<'friends' | 'pending'>('friends');

  const pendingCount = requests.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white">Contactos</h2>
        <button
          onClick={() => setShowModal(true)}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          + Agregar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setTab('friends')}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
            tab === 'friends'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          Amigos ({contacts.length})
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
            tab === 'pending'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          Solicitudes
          {pendingCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center size-4 rounded-full bg-red-500 text-[10px] text-white font-bold">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto py-2">
        {tab === 'friends' && (
          <>
            {loading && (
              <p className="px-4 py-3 text-white/40 text-sm">Cargando...</p>
            )}
            {!loading && contacts.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-white/40 text-sm">Aún no tienes contactos.</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-2 text-blue-400 text-sm hover:underline"
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
      </div>

      {/* Modal para agregar contacto */}
      <SendRequestModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSent={() => {}}
      />
    </div>
  );
}
