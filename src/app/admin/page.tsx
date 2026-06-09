'use client';

/**
 * /admin — Panel de gestión de usuarios (solo admin).
 *
 * Operaciones: listar, ver detalle, actualizar (rol/username), activar-desactivar,
 * eliminar. La autorización REAL la impone el servidor (requireAdmin verifica el
 * rol contra la DB); esta página solo refleja lo que el backend permite.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  is_active: boolean;
  is_online: boolean;
  created_at: string;
  last_seen: string | null;
}

type ConfirmState =
  | { type: 'delete'; user: AdminUser }
  | { type: 'deactivate'; user: AdminUser }
  | null;

export default function AdminUsersPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [query, setQuery] = useState('');

  const authToken = () => token || (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);

  const fetchUsers = useCallback(async () => {
    const t = authToken();
    if (!t) { router.push('/auth/login'); return; }
    setError(null);
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${t}` } });
      if (res.status === 401) { router.push('/auth/login'); return; }
      if (res.status === 403) { setForbidden(true); setLoading(false); return; }
      const data = await res.json();
      if (res.ok) setUsers(data.users ?? []);
      else setError(data.error || 'Error al cargar usuarios');
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [token, router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const patchUser = async (id: string, body: Record<string, unknown>) => {
    const t = authToken();
    if (!t) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error || 'No se pudo actualizar'); return; }
      await fetchUsers();
    } catch {
      alert('Error de conexión');
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (id: string) => {
    const t = authToken();
    if (!t) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error || 'No se pudo eliminar'); return; }
      await fetchUsers();
    } catch {
      alert('Error de conexión');
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  };

  const filtered = users.filter(
    (u) => u.username.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-md p-6 text-center shadow-lg">
          <p className="text-red-500 font-semibold mb-2">Acceso restringido</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No tienes permisos de administrador.</p>
          <Link href="/chat" className="px-4 py-2 bg-[#0084ff] hover:bg-[#0073e6] text-white rounded-lg text-sm font-medium inline-block">
            Volver al chat
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-gray-950 p-4 sm:p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión de usuarios</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{users.length} usuarios · panel de administración</p>
          </div>
          <Link href="/chat" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">← Chat</Link>
        </div>

        {/* Buscador */}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por usuario o email..."
          className="w-full mb-4 bg-white dark:bg-gray-900 border border-[#e4e6eb] dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#0084ff]"
        />

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        {/* Lista */}
        <div className="space-y-2">
          {filtered.map((u) => {
            const isMe = u.id === me?.id;
            const isDeleted = u.username.startsWith('deleted_');
            return (
              <div
                key={u.id}
                className="bg-white dark:bg-gray-900 border border-[#e4e6eb] dark:border-gray-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                {/* Avatar + datos */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 ${
                    u.is_active ? 'bg-gradient-to-tr from-[#0084ff] to-[#00c6ff]' : 'bg-gray-400 dark:bg-gray-600'
                  }`}>
                    {u.username[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white truncate">{u.username}</span>
                      {u.role === 'admin' && (
                        <span className="text-[10px] font-bold uppercase bg-[#0084ff]/15 text-[#0084ff] px-1.5 py-0.5 rounded">Admin</span>
                      )}
                      {isMe && <span className="text-[10px] text-gray-400">(tú)</span>}
                      {!u.is_active && (
                        <span className="text-[10px] font-bold uppercase bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded">Inactivo</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                    <p className="text-[11px] text-gray-400">
                      {u.is_online ? '🟢 en línea' : '⚪ desconectado'} · alta {new Date(u.created_at).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>

                {/* Acciones */}
                {!isDeleted && (
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {/* Rol */}
                    <button
                      onClick={() => patchUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })}
                      disabled={busyId === u.id || (isMe && u.role === 'admin')}
                      title={isMe && u.role === 'admin' ? 'No puedes quitarte tu propio rol' : ''}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[#f0f2f5] dark:bg-gray-800 hover:bg-[#e4e6eb] dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-40"
                    >
                      {u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                    </button>
                    {/* Activar / Desactivar */}
                    <button
                      onClick={() => u.is_active ? setConfirm({ type: 'deactivate', user: u }) : patchUser(u.id, { is_active: true })}
                      disabled={busyId === u.id || (isMe && u.is_active)}
                      title={isMe && u.is_active ? 'No puedes desactivarte' : ''}
                      className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                        u.is_active
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
                          : 'bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25'
                      }`}
                    >
                      {u.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    {/* Eliminar */}
                    <button
                      onClick={() => setConfirm({ type: 'delete', user: u })}
                      disabled={busyId === u.id || isMe}
                      title={isMe ? 'Usa tu perfil para darte de baja' : ''}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Sin resultados</p>
          )}
        </div>
      </div>

      {/* Confirmaciones */}
      <ConfirmDialog
        open={confirm?.type === 'deactivate'}
        title="Desactivar usuario"
        message={`¿Desactivar a "${confirm?.user.username}"? No podrá iniciar sesión hasta que lo reactives. Sus sesiones activas se cerrarán.`}
        confirmLabel="Desactivar"
        danger
        loading={busyId === confirm?.user.id}
        onConfirm={() => confirm && patchUser(confirm.user.id, { is_active: false }).then(() => setConfirm(null))}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.type === 'delete'}
        title="Eliminar usuario"
        message={`¿Eliminar a "${confirm?.user.username}"? Se anonimiza la cuenta y se revoca el acceso. Los mensajes asociados se conservan por integridad. No se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        loading={busyId === confirm?.user.id}
        onConfirm={() => confirm && deleteUser(confirm.user.id)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
