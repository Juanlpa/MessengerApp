-- ============================================================================
-- PROTOTIPO — Esquema de BD Mínimo para Demo
-- Messenger Clone con Cifrado E2E
-- ============================================================================
-- Tablas: users, conversations, conversation_participants, messages
-- RLS activo en todas las tablas.
-- ============================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABLA: users
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,           -- PBKDF2 hash (hex) — NUNCA plaintext
  salt          TEXT NOT NULL,           -- Salt usado para PBKDF2 (hex)
  dh_public_key TEXT NOT NULL,           -- Clave pública DH (hex, 2048-bit)
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ============================================================================
-- 2. TABLA: conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- 3. TABLA: conversation_participants
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_participants (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id      UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_shared_key TEXT NOT NULL,    -- Clave compartida E2E cifrada con clave del usuario (hex)
  shared_key_iv        TEXT NOT NULL,    -- IV para descifrar la shared key (hex)
  shared_key_mac       TEXT NOT NULL,    -- MAC de la shared key cifrada (hex)
  joined_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_cp_conversation ON conversation_participants(conversation_id);

-- ============================================================================
-- 4. TABLA: messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Capa 1: Cifrado E2E (cliente)
  ciphertext        TEXT NOT NULL,       -- Ciphertext E2E (hex)
  iv                TEXT NOT NULL,       -- IV de cifrado E2E (hex)
  mac_tag           TEXT NOT NULL,       -- MAC tag E2E (hex)
  -- Capa 2: Cifrado at-rest (servidor)
  server_ciphertext TEXT NOT NULL,       -- Ciphertext at-rest (hex)
  server_iv         TEXT NOT NULL,       -- IV at-rest (hex)
  server_mac_tag    TEXT NOT NULL,       -- MAC tag at-rest (hex)
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- ============================================================================
-- 5. FUNCIÓN AUXILIAR: verificar si un usuario es participante de una conversación
-- ============================================================================
CREATE OR REPLACE FUNCTION is_participant(conv_id UUID, uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conv_id AND user_id = uid
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- ---- users ----
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer campos públicos (id, username, dh_public_key) para búsqueda
-- Pero solo el propio usuario puede ver su email completo, password_hash, salt
CREATE POLICY users_select ON users
  FOR SELECT
  USING (true);  -- Lectura pública (la API filtra qué campos exponer)

-- Solo el sistema (service_role) puede insertar/actualizar usuarios
-- Las API routes usan service_role_key, no anon_key
CREATE POLICY users_insert ON users
  FOR INSERT
  WITH CHECK (true);  -- Controlado por API route con service_role

CREATE POLICY users_update ON users
  FOR UPDATE
  USING (true)
  WITH CHECK (true);  -- Controlado por API route con service_role

-- ---- conversations ----
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON conversations
  FOR SELECT
  USING (true);  -- Filtrado por participación en API

CREATE POLICY conversations_insert ON conversations
  FOR INSERT
  WITH CHECK (true);  -- Controlado por API route

-- ---- conversation_participants ----
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY cp_select ON conversation_participants
  FOR SELECT
  USING (true);  -- API filtra por user_id

CREATE POLICY cp_insert ON conversation_participants
  FOR INSERT
  WITH CHECK (true);

-- ---- messages ----
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON messages
  FOR SELECT
  USING (true);  -- API verifica participación antes de retornar

CREATE POLICY messages_insert ON messages
  FOR INSERT
  WITH CHECK (true);  -- API verifica sender_id = auth user

-- ============================================================================
-- NOTA SOBRE RLS EN EL PROTOTIPO:
-- ============================================================================
-- En el prototipo usamos service_role_key en las API routes de Next.js,
-- lo cual bypasea RLS. Las políticas están activas como infraestructura
-- para cuando migremos a autenticación directa con Supabase Auth.
-- La seguridad real la aplica el middleware JWT + las API routes.
-- Post-presentación: migrar a Supabase Auth con RLS granular por auth.uid().
-- ============================================================================
