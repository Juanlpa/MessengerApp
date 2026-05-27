'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCallStore } from '@/stores/call-store';
import { useAuthStore } from '@/stores/auth-store';
import { startRingtone, stopRingtone } from '@/lib/audio/ringtone';
import { supabase } from '@/lib/supabase/client';

export function IncomingCallBanner() {
  const router = useRouter();
  const { incomingCall, clearIncomingCall } = useCallStore();
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    if (incomingCall) {
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [incomingCall]);

  if (!incomingCall) return null;

  const handleAccept = () => {
    router.push(`/chat/${incomingCall.conversationId}`);
    clearIncomingCall();
  };

  const handleReject = () => {
    if (user?.id) {
      // Notify the caller so they see "Llamada rechazada" immediately instead of waiting 30s
      const ch = supabase.channel(`call_${incomingCall.conversationId}`);
      const timeout = setTimeout(() => {
        supabase.removeChannel(ch);
      }, 3000);
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.send({
            type: 'broadcast',
            event: 'signal',
            payload: { type: 'reject', senderId: user.id },
          });
          setTimeout(() => {
            clearTimeout(timeout);
            supabase.removeChannel(ch);
          }, 500);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          supabase.removeChannel(ch);
        }
      });
    }
    clearIncomingCall();
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-[#e4e6eb] rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4 min-w-[320px]">
      {/* Avatar */}
      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white text-lg font-semibold flex-shrink-0">
        {incomingCall.callerName[0]?.toUpperCase() || '?'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[#050505] font-semibold text-[15px] truncate">{incomingCall.callerName}</p>
        <p className="text-[#65676b] text-[13px]">
          {incomingCall.isAudioOnly ? '📞 Llamada de voz' : '🎥 Videollamada'}
        </p>
      </div>

      {/* Botones */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Rechazar — teléfono rotado (colgar) */}
        <button
          onClick={handleReject}
          className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
          title="Rechazar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style={{ transform: 'rotate(135deg)' }}>
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          </svg>
        </button>
        {/* Aceptar — teléfono normal (contestar) */}
        <button
          onClick={handleAccept}
          className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors"
          title="Aceptar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
