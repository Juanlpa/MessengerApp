-- ============================================================================
-- MIGRACIÓN 005 — Extender conversations y participants para grupos
-- ============================================================================

-- Enum para roles de participantes en grupos
CREATE TYPE participant_role AS ENUM ('admin', 'member');

-- ============================================================================
-- Extender tabla conversations con campos de grupo
-- ============================================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_group     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS name         TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT,
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES users(id) ON DELETE SET NULL;

-- Restricción: los grupos deben tener nombre
ALTER TABLE conversations
  ADD CONSTRAINT groups_require_name
    CHECK (is_group = false OR (is_group = true AND name IS NOT NULL));

-- Índice para listar grupos de un usuario eficientemente
CREATE INDEX IF NOT EXISTS idx_conversations_is_group
  ON conversations(is_group, created_at DESC);

-- ============================================================================
-- Extender tabla conversation_participants con rol y quién los agregó
-- ============================================================================
ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS role      participant_role NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS added_by  UUID REFERENCES users(id) ON DELETE SET NULL;

-- Índice para buscar admins de un grupo rápidamente
CREATE INDEX IF NOT EXISTS idx_cp_role
  ON conversation_participants(conversation_id, role);

-- ============================================================================
-- Función auxiliar: verificar si un usuario es admin de una conversación
-- ============================================================================
CREATE OR REPLACE FUNCTION is_group_admin(conv_id UUID, uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conv_id
      AND user_id = uid
      AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
