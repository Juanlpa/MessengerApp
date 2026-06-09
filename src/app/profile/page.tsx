'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const setAuth = useAuthStore(s => s.setAuth);
  const logout = useAuthStore(s => s.logout);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!token) return;
    const confirmed = window.confirm(
      '¿Eliminar tu cuenta permanentemente? Perderás el acceso a todos tus mensajes y conversaciones. Esta acción no se puede deshacer.'
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        logout();
        router.push('/auth/login');
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo eliminar la cuenta.');
        setDeleting(false);
      }
    } catch {
      alert('Error de conexión.');
      setDeleting(false);
    }
  };

  useEffect(() => {
    // Redirigir al login si no hay token (tras cargar)
    const storedToken = localStorage.getItem('auth_token');
    if (!storedToken && !token) {
      router.push('/auth/login');
      return;
    }

    async function fetchProfile() {
      const activeToken = token || localStorage.getItem('auth_token');
      try {
        const res = await fetch('/api/users/me', {
          headers: {
            Authorization: `Bearer ${activeToken}`,
          },
        });
        const data = await res.json();
        if (res.ok) {
          setProfile(data.user);
          setNewUsername(data.user.username);
        } else {
          setError(data.error || 'Error al cargar perfil');
        }
      } catch (err) {
        setError('Error de conexión');
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [token, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !token) return;
    setUpdating(true);
    setUpdateError(null);

    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: newUsername }),
      });

      const data = await res.json();
      if (res.ok) {
        setProfile(prev => prev ? { ...prev, username: data.username } : null);
        setIsEditing(false);
        // Actualizar el estado de Zustand
        if (user) {
          setAuth({ ...user, username: data.username }, token);
        }
      } else {
        setUpdateError(data.error || 'Error al actualizar el username');
      }
    } catch (err) {
      setUpdateError('Error de red');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] dark:bg-gray-950 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Cargando tu perfil...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] dark:bg-gray-950 flex items-center justify-center p-4 font-sans">
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-md p-6 text-center shadow-lg">
          <p className="text-red-500 font-medium mb-4">{error || 'Usuario no encontrado'}</p>
          <Link
            href="/chat"
            className="px-4 py-2 bg-[#0084ff] hover:bg-[#0073e6] text-white rounded-lg text-sm font-medium transition-colors inline-block"
          >
            Volver al chat
          </Link>
        </div>
      </div>
    );
  }

  const initials = profile.username[0]?.toUpperCase() || '?';
  const registrationDate = new Date(profile.created_at).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-gray-950 flex flex-col items-center justify-center p-4 font-sans transition-colors">
      <div className="bg-white dark:bg-gray-900 border border-[#e4e6eb] dark:border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-xl relative overflow-hidden transition-colors">
        {/* Banner decorativo */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#0084ff] to-[#00c6ff]" />

        {/* Encabezado */}
        <div className="flex flex-col items-center mt-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white text-3xl font-bold shadow-md mb-3">
            {initials}
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Mi Perfil</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Miembro desde {registrationDate}</p>
        </div>

        {/* Formulario y Detalles */}
        <form onSubmit={handleSave} className="mt-8 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              type="text"
              readOnly
              value={profile.email}
              className="w-full bg-[#f0f2f5] dark:bg-gray-800/50 border border-transparent text-gray-500 dark:text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none cursor-not-allowed select-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Nombre de usuario
            </label>
            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  autoFocus
                  required
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="w-full bg-white dark:bg-gray-850 border border-[#0084ff] text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
                  placeholder="Nuevo username..."
                />
                {updateError && (
                  <p className="text-xs text-red-500 font-medium">{updateError}</p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={updating}
                    className="flex-1 bg-[#0084ff] hover:bg-[#0073e6] text-white rounded-lg py-2 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {updating ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setNewUsername(profile.username);
                      setUpdateError(null);
                    }}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-xs font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-[#f0f2f5] dark:bg-gray-800 border border-transparent rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{profile.username}</span>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-[#0084ff] hover:underline font-semibold"
                >
                  Editar
                </button>
              </div>
            )}
          </div>
        </form>

        {/* Acciones de seguridad */}
        <div className="mt-8 border-t border-gray-150 dark:border-gray-850 pt-5 space-y-2">
          <Link
            href="/profile/change-password"
            className="flex items-center justify-between w-full bg-[#f0f2f5] dark:bg-gray-800 hover:bg-[#e4e6eb] dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Cambiar contraseña
            </span>
            <span className="text-gray-400">›</span>
          </Link>

          {user?.role === 'admin' && (
            <Link
              href="/admin"
              className="flex items-center justify-between w-full bg-[#0084ff]/10 dark:bg-[#0084ff]/15 hover:bg-[#0084ff]/20 text-[#0084ff] rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors"
            >
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Panel de administración
              </span>
              <span className="text-[#0084ff]/60">›</span>
            </Link>
          )}

          <Link
            href="/settings"
            className="flex items-center justify-between w-full bg-[#f0f2f5] dark:bg-gray-800 hover:bg-[#e4e6eb] dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Dispositivos conectados
            </span>
            <span className="text-gray-400">›</span>
          </Link>
        </div>

        {/* Zona de peligro — eliminar cuenta */}
        <div className="mt-6 border-t border-red-200 dark:border-red-900/40 pt-5">
          <button
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="flex items-center justify-center gap-2 w-full bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {deleting ? 'Eliminando...' : 'Eliminar mi cuenta'}
          </button>
        </div>

        {/* Botón de volver */}
        <div className="mt-6 text-center">
          <Link
            href="/chat"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            ← Volver al chat
          </Link>
        </div>
      </div>
    </div>
  );
}
