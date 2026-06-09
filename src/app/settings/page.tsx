'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface SessionRow {
  id: string;
  device: string | null;
  ip: string | null;
  last_seen: string;
}

function deviceLabel(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const lower = ua.toLowerCase();
  let browser = 'Navegador';
  if (lower.includes('edg/')) browser = 'Edge';
  else if (lower.includes('chrome/')) browser = 'Chrome';
  else if (lower.includes('firefox/')) browser = 'Firefox';
  else if (lower.includes('safari/')) browser = 'Safari';

  let os = '';
  if (lower.includes('windows')) os = 'Windows';
  else if (lower.includes('mac os')) os = 'macOS';
  else if (lower.includes('android')) os = 'Android';
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS';
  else if (lower.includes('linux')) os = 'Linux';

  return os ? `${browser} en ${os}` : browser;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export default function SettingsPage() {
  const token = useAuthStore((s) => s.token);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [message, setMessage] = useState('');

  // Notificaciones del sistema (push)
  const { requestAndSubscribe, isSupported: pushSupported } = usePushNotifications();
  const [pushPerm, setPushPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    setPushPerm(pushSupported ? Notification.permission : 'unsupported');
  }, [pushSupported]);
  const enablePush = async () => {
    setPushBusy(true);
    try {
      await requestAndSubscribe();
      setPushPerm(Notification.permission);
    } finally {
      setPushBusy(false);
    }
  };

  const loadSessions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {
      // ignorar — settings no debe romper la app
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function closeOthers() {
    if (!token || revoking) return;
    if (!confirm('¿Cerrar sesión en todos los demás dispositivos?')) return;

    setRevoking(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/revoke-other-sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessage('Otras sesiones cerradas.');
        await loadSessions();
      } else {
        setMessage('No se pudo cerrar las otras sesiones.');
      }
    } catch {
      setMessage('Error de conexión.');
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-gray-950 flex flex-col items-center p-4 font-sans">
      <div className="w-full max-w-2xl mt-8">
        {/* Encabezado */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Configuración
          </h1>
          <Link
            href="/chat"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
          >
            ← Volver al chat
          </Link>
        </div>

        {/* Seguridad */}
        <div className="bg-white dark:bg-gray-900 border border-[#e4e6eb] dark:border-gray-800 rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Seguridad
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Gestiona tu contraseña y dispositivos.
          </p>

          <Link
            href="/profile/change-password"
            className="flex items-center justify-between w-full bg-[#f0f2f5] dark:bg-gray-800 hover:bg-[#e4e6eb] dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm font-medium transition-colors"
          >
            <span className="flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Cambiar contraseña
            </span>
            <span className="text-gray-400">›</span>
          </Link>
        </div>

        {/* Notificaciones */}
        <div className="bg-white dark:bg-gray-900 border border-[#e4e6eb] dark:border-gray-800 rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Notificaciones
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Recibe avisos de mensajes nuevos aunque la app esté en segundo plano.
          </p>

          {pushPerm === 'unsupported' ? (
            <p className="text-sm text-gray-400">Tu navegador no soporta notificaciones push.</p>
          ) : pushPerm === 'granted' ? (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
              Notificaciones activadas
            </div>
          ) : pushPerm === 'denied' ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Notificaciones bloqueadas. Actívalas desde la configuración del navegador (icono 🔒 en la barra de direcciones).
            </p>
          ) : (
            <button
              onClick={enablePush}
              disabled={pushBusy}
              className="flex items-center gap-2 bg-[#0084ff] hover:bg-[#0073e6] text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {pushBusy ? 'Activando...' : 'Activar notificaciones'}
            </button>
          )}
        </div>

        {/* Dispositivos conectados */}
        <div className="bg-white dark:bg-gray-900 border border-[#e4e6eb] dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Dispositivos conectados
            </h2>
            {sessions.length > 1 && (
              <button
                onClick={closeOthers}
                disabled={revoking}
                className="text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-50"
              >
                {revoking ? 'Cerrando...' : 'Cerrar otras sesiones'}
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Sesiones activas en tu cuenta.
          </p>

          {loading ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-400">
              No hay sesiones registradas. (Sigue activa la actual, pero no estaba en la BD — esto se normalizará en tu próximo login.)
            </p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start justify-between bg-[#f0f2f5] dark:bg-gray-800 rounded-lg px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {deviceLabel(s.device)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {s.ip || 'IP desconocida'} · {timeAgo(s.last_seen)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {message && (
            <p className="text-sm mt-4 text-center text-gray-600 dark:text-gray-300">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
