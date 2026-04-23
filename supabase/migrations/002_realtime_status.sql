-- ============================================================================
-- MIGRACIÓN 002 — Soporte Realtime: estados de mensaje + presencia
-- ============================================================================

-- 1. Agregar columna de tipo de mensaje para extensiones futuras
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text' NOT NULL;

-- 2. Tabla: message_status (estados de entrega por usuario)
-- Cada participante tiene su propio estado para cada mensaje
CREATE TABLE IF NOT EXISTS message_status (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_status_message ON message_status(message_id);
CREATE INDEX IF NOT EXISTS idx_message_status_user ON message_status(user_id);

-- 3. Agregar campos de presencia al usuario
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE;

-- 4. RLS para message_status
ALTER TABLE message_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_status_select ON message_status
  FOR SELECT USING (true);

CREATE POLICY message_status_insert ON message_status
  FOR INSERT WITH CHECK (true);

CREATE POLICY message_status_update ON message_status
  FOR UPDATE USING (true) WITH CHECK (true);

-- 5. Habilitar Realtime en las tablas relevantes
-- NOTA: Esto se configura en el Dashboard de Supabase > Database > Replication
-- Activar las tablas: messages, message_status, conversation_participants
-- Para Broadcast y Presence no se necesita configuración de BD

-- 6. Función para actualizar last_seen automáticamente
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET last_seen = NOW(), is_online = TRUE WHERE id = NEW.sender_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: actualizar last_seen al enviar mensaje
DROP TRIGGER IF EXISTS trigger_update_last_seen ON messages;
CREATE TRIGGER trigger_update_last_seen
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_last_seen();

-- 7. Función para crear status entries automáticamente al insertar un mensaje
CREATE OR REPLACE FUNCTION create_message_status_entries()
RETURNS TRIGGER AS $$
BEGIN
  -- Crear una entrada de estado para cada participante de la conversación
  -- excepto el remitente (cuyo status es implícitamente 'sent')
  INSERT INTO message_status (message_id, user_id, status)
  SELECT NEW.id, cp.user_id, 'sent'
  FROM conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id != NEW.sender_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_message_status ON messages;
CREATE TRIGGER trigger_create_message_status
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION create_message_status_entries();
