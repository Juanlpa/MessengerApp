-- ============================================================================
-- MIGRACIÓN 015 — Gestión de usuarios (roles y activación)
-- ============================================================================
-- Añade soporte para:
--   - role: 'user' (por defecto) | 'admin'  → operaciones críticas solo admin
--   - is_active: cuentas pueden desactivarse (login bloqueado) sin borrar datos
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Validar valores de role
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

-- Índice para listar/filtrar por rol
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Designar el primer administrador (ajustar el id según el entorno):
-- UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
