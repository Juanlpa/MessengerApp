-- 006_group_keys.sql
-- Tabla de claves simétricas de grupo con soporte de rotación.
--
-- Cada fila representa una versión de la clave de un grupo.
-- Solo una clave puede estar activa por grupo en todo momento (unique partial index).
-- La rotación se dispara al agregar o eliminar miembros:
--   - Salida de miembro (crítico): impide que el ex-miembro descifre mensajes futuros.
--   - Entrada de miembro: el nuevo miembro solo obtiene la clave a partir de su ingreso.
--
-- La clave en bruto nunca se almacena; se cifra con ENCRYPTION_MASTER_KEY (AES-256-CBC-HMAC)
-- antes de persistirla (Capa 2: cifrado en reposo del servidor).

CREATE TABLE IF NOT EXISTS group_keys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  key_version   INTEGER     NOT NULL CHECK (key_version > 0),
  encrypted_key TEXT        NOT NULL,
  iv            TEXT        NOT NULL,
  mac           TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solo una clave activa por grupo
CREATE UNIQUE INDEX idx_group_keys_one_active
  ON group_keys(group_id) WHERE (is_active = TRUE);

-- Historial de versiones por grupo (más reciente primero)
CREATE INDEX idx_group_keys_history
  ON group_keys(group_id, key_version DESC);

-- RLS — segunda capa de defensa (la primaria es la verificación en el API route).
-- Nota: el cliente admin (service_role) omite RLS; estas políticas aplican
-- a conexiones directas con JWT de usuario.
ALTER TABLE group_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_group_key" ON group_keys
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = group_keys.group_id
        AND cp.user_id = auth.uid()
    )
  );
