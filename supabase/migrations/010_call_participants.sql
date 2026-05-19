CREATE TABLE IF NOT EXISTS call_participants (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id   UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at   TIMESTAMPTZ,
  UNIQUE(call_id, user_id)
);
