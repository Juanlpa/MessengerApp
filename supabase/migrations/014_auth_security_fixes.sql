-- ============================================================================
-- MIGRACIÓN 014 — Fixes para Auth + Seguridad (sobre 003_auth_security.sql)
--
-- Objetivos:
--  1. Crear tabla revoked_tokens (faltaba)
--  2. Añadir created_at e index a active_sessions
--  3. Índices en columnas consultadas frecuentemente
--  4. CHECK constraints donde aplica
--  5. RLS deshabilitado (estas tablas solo se acceden vía service_role)
-- ============================================================================

-- 1. Tabla de tokens revocados (blacklist) — la referencia jwtBlacklist.ts
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMPTZ DEFAULT NOW(),
  -- Cuando el JWT expira ya no hace falta tenerlo en blacklist; útil para limpieza
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revoked_tokens_token ON revoked_tokens(token);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user ON revoked_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);

-- 2. active_sessions: añadir created_at si falta
ALTER TABLE active_sessions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_jwt ON active_sessions(jwt_id);

-- 3. password_reset_tokens: índice para búsqueda por hash
CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);

-- 4. security_logs y login_attempts: índices por usuario / ip / tiempo
CREATE INDEX IF NOT EXISTS idx_security_logs_user ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, attempted_at DESC);

-- 5. RLS — estas tablas solo deben tocarse desde el servidor (service_role)
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Sin políticas = nadie puede leer/escribir excepto service_role.
