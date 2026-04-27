-- ============================================================================
-- MIGRACIÓN 004 — Tabla friendships (solicitudes de amistad)
-- ============================================================================

-- Tipo enum para el estado de la solicitud
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'rejected', 'blocked');

-- ============================================================================
-- TABLA: friendships
-- ============================================================================
CREATE TABLE IF NOT EXISTS friendships (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        friendship_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Evita solicitudes duplicadas en cualquier dirección
  CONSTRAINT friendships_unique_pair UNIQUE (requester_id, addressee_id),
  -- Un usuario no se puede enviar solicitud a sí mismo
  CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id)
);

-- Índice principal para buscar friendships de un usuario (como addressee)
CREATE INDEX IF NOT EXISTS idx_friendships_addressee_status
  ON friendships(addressee_id, status);

-- Índice para buscar solicitudes enviadas por un usuario
CREATE INDEX IF NOT EXISTS idx_friendships_requester_status
  ON friendships(requester_id, status);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_friendships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_friendships_updated_at
  BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION update_friendships_updated_at();

-- ============================================================================
-- POLÍTICAS RLS
-- ============================================================================
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Nota: usamos auth.uid() de Supabase Auth para las políticas RLS.
-- Las API routes usan el service role key (bypasea RLS) y verifican
-- la identidad manualmente vía JWT propio. Las políticas RLS son una
-- segunda capa de defensa si alguien accede directamente a Supabase.

-- SELECT: un usuario solo puede ver sus propias friendships
CREATE POLICY friendships_select ON friendships
  FOR SELECT
  USING (
    auth.uid() = requester_id OR auth.uid() = addressee_id
  );

-- INSERT: solo puede crear solicitudes en su propio nombre
CREATE POLICY friendships_insert ON friendships
  FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
  );

-- UPDATE: solo el addressee puede actualizar una solicitud pendiente
-- (para aceptar o rechazar). O cualquiera puede bloquear al otro.
CREATE POLICY friendships_update ON friendships
  FOR UPDATE
  USING (
    -- El destinatario responde solicitudes pendientes
    (auth.uid() = addressee_id AND status = 'pending')
    -- Cualquiera de los dos puede bloquear
    OR (auth.uid() = requester_id OR auth.uid() = addressee_id)
  );

-- DELETE: cualquiera de los dos puede eliminar la friendship
CREATE POLICY friendships_delete ON friendships
  FOR DELETE
  USING (
    auth.uid() = requester_id OR auth.uid() = addressee_id
  );
