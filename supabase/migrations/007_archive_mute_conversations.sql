-- 007_archive_mute_conversations.sql
-- Agrega soporte de archivado y silenciamiento por participante.
--
-- Diseño:
--   - is_archived / archived_at — cada usuario puede archivar cualquier conversación
--     de forma independiente. El archivado es personal (no afecta a otros participantes).
--   - muted_until — silenciar notificaciones hasta cierta fecha (NULL = sin silenciar).
--     Jade (dominio: push) puede leer muted_until para suprimir notificaciones push.
--
-- Los campos viven en conversation_participants (no en conversations) porque el archivado
-- y silenciado son preferencias personales, no estados globales de la conversación.

ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS muted_until  TIMESTAMPTZ;

-- Índice para filtrar conversaciones activas (caso más frecuente en el GET)
CREATE INDEX IF NOT EXISTS idx_cp_archived
  ON conversation_participants(user_id, is_archived);

-- Índice para que el sistema de push consulte eficientemente quién tiene silenciado qué
CREATE INDEX IF NOT EXISTS idx_cp_muted
  ON conversation_participants(muted_until)
  WHERE muted_until IS NOT NULL;
