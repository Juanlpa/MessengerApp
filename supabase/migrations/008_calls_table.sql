-- ============================================================================
-- MIGRACIÓN 008: Historial de llamadas
-- ============================================================================

CREATE TABLE IF NOT EXISTS calls (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  initiated_by     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ended_at         TIMESTAMPTZ,
  duration_seconds INT,
  status           TEXT NOT NULL DEFAULT 'initiated'
                   CHECK (status IN ('initiated','connected','missed','rejected','ended'))
);

CREATE INDEX IF NOT EXISTS idx_calls_conversation ON calls(conversation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_initiated_by ON calls(initiated_by);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY calls_select ON calls
  FOR SELECT USING (true);

CREATE POLICY calls_insert ON calls
  FOR INSERT WITH CHECK (true);

CREATE POLICY calls_update ON calls
  FOR UPDATE USING (true) WITH CHECK (true);
