'use client';

/**
 * NotificationPrompt — banner suave para activar notificaciones push.
 *
 * Solo aparece si: el navegador soporta push, el permiso está en 'default'
 * (ni concedido ni bloqueado) y el usuario no lo ha descartado antes.
 * El permiso se pide con un gesto del usuario (botón), como exigen los navegadores.
 */

import { useEffect, useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const DISMISS_KEY = 'notif_prompt_dismissed';

export function NotificationPrompt() {
  const { requestAndSubscribe, isSupported } = usePushNotifications();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupported) return;
    const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    if (!dismissed && Notification.permission === 'default') setShow(true);
  }, [isSupported]);

  if (!show) return null;

  const enable = async () => {
    setBusy(true);
    try {
      await requestAndSubscribe();
    } finally {
      setBusy(false);
      setShow(false);
      localStorage.setItem(DISMISS_KEY, '1');
    }
  };

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,420px)] bg-white dark:bg-gray-800 border border-[#e4e6eb] dark:border-gray-700 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-[#0084ff]/15 text-[#0084ff] flex items-center justify-center flex-shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#050505] dark:text-white">Activa las notificaciones</p>
        <p className="text-[12px] text-[#65676b] dark:text-gray-400">Entérate de mensajes nuevos al instante.</p>
      </div>
      <button
        onClick={enable}
        disabled={busy}
        className="text-[13px] font-medium bg-[#0084ff] hover:bg-[#0073e6] text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 flex-shrink-0"
      >
        {busy ? '...' : 'Activar'}
      </button>
      <button onClick={dismiss} className="text-[#65676b] hover:text-[#050505] dark:hover:text-white flex-shrink-0" title="Ahora no">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}
