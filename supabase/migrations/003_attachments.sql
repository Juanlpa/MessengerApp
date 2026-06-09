-- ============================================================================
-- MIGRACIÓN 003 — Tabla de adjuntos cifrados + extensión de messages
-- Messenger Clone con Cifrado E2E
-- ============================================================================
-- Soporte para: imágenes, archivos, mensajes de voz
-- Todos los blobs en Storage están cifrados con AES-256-CBC + HMAC-SHA256
-- ============================================================================

-- Extender messages para soportar tipos de mensaje y referencia a adjuntos
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_id UUID;

-- ============================================================================
-- TABLA: attachments — Metadatos de archivos cifrados en Storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS attachments (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id        UUID REFERENCES messages(id) ON DELETE SET NULL,
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  uploader_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Ubicación del blob cifrado en Supabase Storage
  storage_path      TEXT NOT NULL,

  -- Parámetros criptográficos del archivo principal
  iv                TEXT NOT NULL,           -- IV del cifrado AES-256-CBC (hex)
  mac_tag           TEXT NOT NULL,           -- HMAC-SHA256 tag (hex)

  -- Metadata del archivo original (antes de cifrar)
  mime_type         TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400), -- max 25MB

  -- Thumbnail cifrado (solo para imágenes)
  thumbnail_path    TEXT,
  thumbnail_iv      TEXT,
  thumbnail_mac     TEXT,

  -- Clasificación del adjunto
  attachment_type   TEXT NOT NULL DEFAULT 'file'
                    CHECK (attachment_type IN ('image', 'file', 'voice')),

  -- Duración en ms (solo para mensajes de voz)
  duration_ms       INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),

  -- Waveform data serializado (solo para voz — array de amplitudes)
  waveform_data     TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_conversation ON attachments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploader ON attachments(uploader_id);

-- RLS — controlado por API routes con service_role
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY attachments_select ON attachments
  FOR SELECT USING (true);

CREATE POLICY attachments_insert ON attachments
  FOR INSERT WITH CHECK (true);

CREATE POLICY attachments_update ON attachments
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY attachments_delete ON attachments
  FOR DELETE USING (true);

-- ============================================================================
-- TABLA: security_logs — Auditoría de eventos de seguridad
-- (Creada aquí si Joel aún no la tiene — compatible con su diseño)
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  details     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_security_logs_user ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_event ON security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at DESC);

ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY security_logs_insert ON security_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY security_logs_select ON security_logs
  FOR SELECT USING (true);

-- Agregar FK de attachment_id en messages
ALTER TABLE messages
  ADD CONSTRAINT fk_messages_attachment
  FOREIGN KEY (attachment_id) REFERENCES attachments(id)
  ON DELETE SET NULL;
