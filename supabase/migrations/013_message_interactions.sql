-- ============================================================================
-- MIGRACIÓN 003 — Interacciones de mensajes
-- Reacciones, respuestas/citas, edición y eliminación suave
-- ============================================================================

-- ── Columnas nuevas en messages ──────────────────────────────────────────────

-- Referencia al mensaje que se está citando/respondiendo
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Timestamp de última edición (NULL = nunca editado)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Eliminación suave: el registro permanece pero el contenido se vacía
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Tabla: message_reactions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  emoji      TEXT NOT NULL CHECK (char_length(emoji) <= 8),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user    ON message_reactions(user_id);

-- RLS
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY reactions_select ON message_reactions FOR SELECT USING (true);
CREATE POLICY reactions_insert ON message_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY reactions_delete ON message_reactions FOR DELETE USING (true);

-- ── Índice adicional en messages ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
