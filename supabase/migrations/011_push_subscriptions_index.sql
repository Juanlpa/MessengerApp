-- Índice simple en user_id para acelerar lookup de suscripciones push por usuario.
-- El índice compuesto UNIQUE(user_id, endpoint) existe pero es menos eficiente
-- para queries que solo filtran por user_id (sin conocer el endpoint).
-- Usado en: GET /api/notifications/send y POST /api/conversations/[id]/messages
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);
