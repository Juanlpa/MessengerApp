-- ============================================================================
-- MIGRACIÓN 003 — Auth + Seguridad
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts(
 id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 email TEXT,
 ip TEXT,
 success BOOLEAN DEFAULT FALSE,
 attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_logs(
 id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 user_id UUID REFERENCES users(id),
 event_type TEXT NOT NULL,
 ip TEXT,
 user_agent TEXT,
 details_jsonb JSONB,
 created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS active_sessions(
 id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 user_id UUID REFERENCES users(id),
 jwt_id TEXT,
 device TEXT,
 ip TEXT,
 last_seen TIMESTAMPTZ DEFAULT NOW(),
 revoked BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS password_reset_tokens(
 id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 user_id UUID REFERENCES users(id),
 token_hash TEXT,
 expires_at TIMESTAMPTZ,
 used BOOLEAN DEFAULT FALSE,
 created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS private_key_encrypted TEXT;