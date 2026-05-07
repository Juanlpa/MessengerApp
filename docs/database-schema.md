# Esquema de Base de Datos

Messenger Seguro usa Supabase (PostgreSQL). El esquema se construye mediante migraciones numeradas en `supabase/migrations/`.

---

## Tablas

### `users`
Almacena credenciales y material criptográfico de cada usuario.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador único |
| `email` | `TEXT` UNIQUE | Correo electrónico |
| `username` | `TEXT` UNIQUE | Nombre de usuario público |
| `password_hash` | `TEXT` | Hash PBKDF2 (hex) — nunca plaintext |
| `salt` | `TEXT` | Salt de PBKDF2 (hex) |
| `dh_public_key` | `TEXT` | Clave pública Diffie-Hellman 2048-bit (hex) |
| `last_seen` | `TIMESTAMPTZ` | Última actividad (para presencia) |
| `is_online` | `BOOLEAN` | Estado online actual |
| `created_at` | `TIMESTAMPTZ` | Fecha de registro |

Índices: `email`, `username`.

---

### `conversations`
Representa tanto conversaciones directas (1-a-1) como grupos.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador único |
| `is_group` | `BOOLEAN` | `true` para grupos, `false` para 1-a-1 |
| `name` | `TEXT` | Nombre del grupo (obligatorio si `is_group = true`) |
| `avatar_url` | `TEXT` | URL del avatar del grupo |
| `description` | `TEXT` | Descripción del grupo |
| `created_by` | `UUID` FK → `users` | Creador del grupo |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación |

Restricción: `CHECK (is_group = false OR (is_group = true AND name IS NOT NULL))`.

---

### `conversation_participants`
Une usuarios con conversaciones. Contiene todo el estado personal del participante.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador único |
| `conversation_id` | `UUID` FK → `conversations` | Conversación |
| `user_id` | `UUID` FK → `users` | Participante |
| `encrypted_shared_key` | `TEXT` | Clave compartida E2E cifrada con la clave del usuario (hex) |
| `shared_key_iv` | `TEXT` | IV para descifrar la shared key (hex) |
| `shared_key_mac` | `TEXT` | MAC de la shared key cifrada (hex) |
| `role` | `participant_role` | `'admin'` o `'member'` (solo grupos) |
| `added_by` | `UUID` FK → `users` | Quién agregó al participante |
| `is_archived` | `BOOLEAN` | Si el usuario archivó esta conversación |
| `archived_at` | `TIMESTAMPTZ` | Cuándo fue archivada (por este usuario) |
| `muted_until` | `TIMESTAMPTZ` | Notificaciones silenciadas hasta esta fecha (`NULL` = sin silenciar) |
| `joined_at` | `TIMESTAMPTZ` | Fecha de ingreso |

Restricción UNIQUE: `(conversation_id, user_id)`.

Índices: `user_id`, `conversation_id`, `(conversation_id, role)`, `(user_id, is_archived)`, `muted_until WHERE muted_until IS NOT NULL`.

> **Diseño**: `is_archived` y `muted_until` son estados **personales** — el archivado de un usuario no afecta la vista de otro participante.

---

### `messages`
Mensajes con cifrado de doble capa.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador único |
| `conversation_id` | `UUID` FK → `conversations` | Conversación/grupo |
| `sender_id` | `UUID` FK → `users` | Remitente |
| `ciphertext` | `TEXT` | Ciphertext E2E — Capa 1 (hex) |
| `iv` | `TEXT` | IV del cifrado E2E (hex) |
| `mac_tag` | `TEXT` | MAC tag E2E (hex) |
| `server_ciphertext` | `TEXT` | Ciphertext at-rest — Capa 2 (hex) |
| `server_iv` | `TEXT` | IV at-rest (hex) |
| `server_mac_tag` | `TEXT` | MAC tag at-rest (hex) |
| `message_type` | `TEXT` | `'text'`, `'voice'`, `'image'`, `'file'` |
| `attachment_id` | `UUID` FK → `attachments` | Adjunto asociado (nullable) |
| `created_at` | `TIMESTAMPTZ` | Timestamp del mensaje |

Índices: `(conversation_id, created_at DESC)`, `sender_id`.

---

### `message_status`
Estado de entrega por usuario por mensaje.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador único |
| `message_id` | `UUID` FK → `messages` | Mensaje |
| `user_id` | `UUID` FK → `users` | Receptor |
| `status` | `TEXT` | `'sent'`, `'delivered'`, `'read'` |
| `updated_at` | `TIMESTAMPTZ` | Último cambio de estado |

Restricción UNIQUE: `(message_id, user_id)`.

---

### `attachments`
Metadatos de archivos cifrados almacenados en Supabase Storage.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador único |
| `message_id` | `UUID` FK → `messages` | Mensaje al que pertenece |
| `conversation_id` | `UUID` FK → `conversations` | Conversación |
| `uploader_id` | `UUID` FK → `users` | Quien subió el archivo |
| `storage_path` | `TEXT` | Ruta del blob cifrado en Storage |
| `iv` | `TEXT` | IV del cifrado AES-256-CBC (hex) |
| `mac_tag` | `TEXT` | HMAC-SHA256 del archivo cifrado (hex) |
| `mime_type` | `TEXT` | Tipo MIME original |
| `original_filename` | `TEXT` | Nombre original del archivo |
| `size_bytes` | `INTEGER` | Tamaño en bytes (máx 25 MB) |
| `thumbnail_path` | `TEXT` | Ruta del thumbnail cifrado (solo imágenes) |
| `thumbnail_iv` | `TEXT` | IV del thumbnail (hex) |
| `thumbnail_mac` | `TEXT` | MAC del thumbnail (hex) |
| `attachment_type` | `TEXT` | `'image'`, `'file'`, `'voice'` |
| `duration_ms` | `INTEGER` | Duración en ms (solo voz) |
| `waveform_data` | `TEXT` | Array de amplitudes serializado (solo voz) |
| `created_at` | `TIMESTAMPTZ` | Fecha de subida |

---

### `friendships`
Solicitudes de amistad entre usuarios.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador único |
| `requester_id` | `UUID` FK → `users` | Quien envió la solicitud |
| `addressee_id` | `UUID` FK → `users` | Destinatario de la solicitud |
| `status` | `friendship_status` | `'pending'`, `'accepted'`, `'rejected'`, `'blocked'` |
| `created_at` | `TIMESTAMPTZ` | Fecha de solicitud |
| `updated_at` | `TIMESTAMPTZ` | Último cambio de estado |

Restricciones: UNIQUE `(requester_id, addressee_id)`, CHECK `requester_id <> addressee_id`.

Índices: `(addressee_id, status)`, `(requester_id, status)`.

---

### `group_keys`
Claves simétricas de grupo con historial de versiones para rotación.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador único |
| `group_id` | `UUID` FK → `conversations` | Grupo propietario |
| `key_version` | `INTEGER` | Número de versión (> 0, incrementa con cada rotación) |
| `encrypted_key` | `TEXT` | Clave de grupo cifrada con `ENCRYPTION_MASTER_KEY` (hex) |
| `iv` | `TEXT` | IV del cifrado at-rest de la clave (hex) |
| `mac` | `TEXT` | MAC de la clave cifrada (hex) |
| `is_active` | `BOOLEAN` | Solo una clave activa por grupo |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación de esta versión |

Índice UNIQUE parcial: `(group_id) WHERE is_active = TRUE` — garantiza una sola clave activa.

---

### `security_logs`
Auditoría de eventos de seguridad.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador único |
| `user_id` | `UUID` FK → `users` | Usuario involucrado (nullable) |
| `event_type` | `TEXT` | Tipo de evento |
| `ip_address` | `TEXT` | IP de origen |
| `user_agent` | `TEXT` | User-Agent del cliente |
| `details` | `JSONB` | Datos adicionales del evento |
| `created_at` | `TIMESTAMPTZ` | Timestamp del evento |

---

## Tipos personalizados

| Tipo | Valores |
|---|---|
| `friendship_status` | `'pending'`, `'accepted'`, `'rejected'`, `'blocked'` |
| `participant_role` | `'admin'`, `'member'` |

---

## Funciones auxiliares

### `is_participant(conv_id UUID, uid UUID) → BOOLEAN`
Retorna `true` si `uid` es participante de `conv_id`. Usada internamente por las API routes.

### `is_group_admin(conv_id UUID, uid UUID) → BOOLEAN`
Retorna `true` si `uid` tiene `role = 'admin'` en `conv_id`.

### `update_last_seen()` (trigger)
Actualiza `users.last_seen` y `users.is_online = TRUE` en cada INSERT en `messages`.

### `create_message_status_entries()` (trigger)
Al insertar un mensaje, crea automáticamente una fila `message_status` con `status = 'sent'` para cada participante receptor.

---

## Historial de migraciones

| Archivo | Contenido |
|---|---|
| `001_prototype_schema.sql` | Esquema base: `users`, `conversations`, `conversation_participants`, `messages`, RLS inicial |
| `002_realtime_status.sql` | `message_status`, presencia (`last_seen`, `is_online`), triggers de status |
| `003_attachments.sql` | `attachments`, `security_logs`, columnas de tipo en `messages` |
| `004_create_friendships.sql` | `friendships`, tipo `friendship_status`, RLS granular con `auth.uid()` |
| `005_extend_groups.sql` | Columnas de grupo en `conversations`, `role` y `added_by` en `conversation_participants`, `is_group_admin()` |
| `006_group_keys.sql` | `group_keys`, índice UNIQUE parcial para clave activa, RLS de solo lectura para miembros |
| `007_archive_mute_conversations.sql` | `is_archived`, `archived_at`, `muted_until` en `conversation_participants` |
