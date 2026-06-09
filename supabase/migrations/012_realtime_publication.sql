-- ============================================================================
-- MIGRACIÓN 012 — Habilitar Realtime en message_status y friendships
-- ============================================================================
--
-- Bug detectado (2026-05-26): las palomitas de "entregado" y "leído" no se
-- actualizaban en el emisor porque la tabla `message_status` NO estaba
-- incluida en la publication `supabase_realtime`. Sin esto, los UPDATEs
-- en esa tabla no emiten eventos `postgres_changes` y el listener en
-- `useRealtimeMessages.ts` nunca se dispara para el emisor.
--
-- También se incluye `friendships` para que `usePendingRequests` reciba
-- notificación en tiempo real cuando llega una nueva solicitud de amistad.
--
-- IMPORTANT: ALTER PUBLICATION es idempotente solo dentro de un mismo cluster.
-- Usamos un DO block que detecta si la tabla ya está agregada y omite si sí.
-- ============================================================================

DO $$
BEGIN
  -- message_status
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_status;
  END IF;

  -- friendships
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
  END IF;
END $$;
