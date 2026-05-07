'use client';

import { usePendingRequests, useRespondRequest } from '@/hooks/useContacts';

interface PendingRequestsProps {
  onAccepted?: () => void;
}

export function PendingRequests({ onAccepted }: PendingRequestsProps) {
  const { requests, loading, refetch } = usePendingRequests();
  const { respond, loading: responding } = useRespondRequest();

  async function handleRespond(friendshipId: string, status: 'accepted' | 'rejected') {
    const ok = await respond(friendshipId, status);
    if (ok) {
      refetch();
      if (status === 'accepted') onAccepted?.();
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-3 text-white/40 text-sm">Cargando solicitudes...</div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="px-4 py-3 text-white/40 text-sm">Sin solicitudes pendientes</div>
    );
  }

  return (
    <div className="space-y-1">
      {requests.map((req) => (
        <div
          key={req.friendship_id}
          className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg"
        >
          {/* Avatar */}
          <div className="size-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
            {req.requester?.username?.[0]?.toUpperCase() ?? '?'}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {req.requester?.username ?? 'Usuario desconocido'}
            </p>
            <p className="text-xs text-white/40">
              {new Date(req.sent_at).toLocaleDateString('es', {
                day: 'numeric',
                month: 'short',
              })}
            </p>
          </div>

          {/* Botones */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => handleRespond(req.friendship_id, 'accepted')}
              disabled={responding}
              className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
            >
              Aceptar
            </button>
            <button
              onClick={() => handleRespond(req.friendship_id, 'rejected')}
              disabled={responding}
              className="text-xs px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white/70 transition-colors disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
