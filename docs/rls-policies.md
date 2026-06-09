# Políticas RLS (Row Level Security)

## Arquitectura de seguridad

El sistema usa **dos capas de control de acceso** que funcionan de forma complementaria:

| Capa | Dónde se aplica | Mecanismo |
|---|---|---|
| **Primaria** | API routes (Next.js) | JWT propio + verificaciones explícitas en código |
| **Secundaria** | Supabase (PostgreSQL) | Políticas RLS con `auth.uid()` |

Las API routes utilizan `service_role_key`, que **bypasea RLS**. Esto es intencional: el control real lo hace el middleware JWT. Las políticas RLS son una segunda línea de defensa si alguien accediera directamente a Supabase sin pasar por las rutas de la aplicación.

---

## Políticas por tabla

### `users`

| Operación | Política | Condición |
|---|---|---|
| SELECT | `users_select` | `true` — lectura pública (la API filtra qué campos expone) |
| INSERT | `users_insert` | `true` — controlado por API route con service_role |
| UPDATE | `users_update` | `true` — controlado por API route con service_role |

La API nunca expone `password_hash`, `salt` ni el `email` completo en búsquedas públicas.

---

### `conversations`

| Operación | Política | Condición |
|---|---|---|
| SELECT | `conversations_select` | `true` — filtrado por participación en la API |
| INSERT | `conversations_insert` | `true` — controlado por API route |

---

### `conversation_participants`

| Operación | Política | Condición |
|---|---|---|
| SELECT | `cp_select` | `true` — la API filtra por `user_id` del token JWT |
| INSERT | `cp_insert` | `true` — controlado por API route |

Las API routes que devuelven conversaciones filtran siempre por `user_id = token.sub` antes de consultar Supabase.

---

### `messages`

| Operación | Política | Condición |
|---|---|---|
| SELECT | `messages_select` | `true` — la API verifica participación antes de retornar |
| INSERT | `messages_insert` | `true` — la API verifica que `sender_id = token.sub` |

---

### `message_status`

| Operación | Política | Condición |
|---|---|---|
| SELECT | `message_status_select` | `true` |
| INSERT | `message_status_insert` | `true` |
| UPDATE | `message_status_update` | `true` |

---

### `attachments`

| Operación | Política | Condición |
|---|---|---|
| SELECT | `attachments_select` | `true` |
| INSERT | `attachments_insert` | `true` |
| UPDATE | `attachments_update` | `true` |
| DELETE | `attachments_delete` | `true` |

---

### `friendships`

Esta tabla tiene las políticas RLS **más granulares** del sistema, usando `auth.uid()`:

| Operación | Política | Condición |
|---|---|---|
| SELECT | `friendships_select` | `auth.uid() = requester_id OR auth.uid() = addressee_id` |
| INSERT | `friendships_insert` | `auth.uid() = requester_id` (solo en nombre propio) |
| UPDATE | `friendships_update` | `auth.uid() = addressee_id AND status = 'pending'` (responder) O cualquiera de los dos (bloquear) |
| DELETE | `friendships_delete` | `auth.uid() = requester_id OR auth.uid() = addressee_id` |

---

### `group_keys`

| Operación | Política | Condición |
|---|---|---|
| SELECT | `members_read_group_key` | `EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = group_keys.group_id AND user_id = auth.uid())` |

Solo los miembros activos pueden leer la clave cifrada de su grupo. La clave en claro nunca se almacena en la DB.

---

### `security_logs`

| Operación | Política | Condición |
|---|---|---|
| INSERT | `security_logs_insert` | `true` |
| SELECT | `security_logs_select` | `true` — en producción restringir a roles de auditoría |

---

## Control de acceso a nivel de aplicación

Las verificaciones críticas de acceso viven en las API routes:

### Conversaciones 1-a-1

| Endpoint | Verificación |
|---|---|
| `GET /api/conversations` | Filtra por `user_id = token.sub` en `conversation_participants` |
| `PATCH /api/conversations/[id]/archive` | Verifica membresía del usuario autenticado → 403 si no es participante |
| `PATCH /api/conversations/[id]/mute` | Verifica membresía del usuario autenticado → 403 si no es participante |

### Grupos

| Endpoint | Verificación | No miembro | Miembro sin rol admin |
|---|---|---|---|
| `GET /api/groups/[id]/messages` | Membresía | 403 | ✅ permitido |
| `POST /api/groups/[id]/messages` | Membresía | 403 | ✅ permitido |
| `GET /api/groups/[id]/key` | Membresía | 403 | ✅ permitido |
| `PATCH /api/groups/[id]` (renombrar) | Membresía + rol admin | 404 | 403 |
| `POST /api/groups/[id]/members` (agregar) | Membresía + rol admin | 404 | 403 |
| `DELETE /api/groups/[id]/members/[userId]` | Membresía + rol admin | 404 | 403 |
| `PATCH /api/groups/[id]/members/[userId]/role` | Membresía + rol admin | 404 | 403 |

> **Nota de diseño**: las rutas de administración retornan `404` para no-miembros (en lugar de `403`) para no revelar si el grupo existe. Las rutas de lectura (mensajes, clave) retornan `403` porque la membresía es un requisito explícito documentado.

### Contactos

| Endpoint | Verificación |
|---|---|
| `POST /api/contacts/request` | `requester_id` debe ser `token.sub` |
| `PATCH /api/contacts/[id]/respond` | Solo el `addressee_id` puede responder |
| `DELETE /api/contacts/[id]` | Solo el `requester_id` o `addressee_id` puede eliminar |

---

## Funciones de verificación reutilizables

Definidas en la DB como `SECURITY DEFINER STABLE`:

```sql
-- Verifica participación en una conversación
is_participant(conv_id UUID, uid UUID) → BOOLEAN

-- Verifica rol de admin en un grupo
is_group_admin(conv_id UUID, uid UUID) → BOOLEAN
```

Usadas internamente por RLS o por API routes que invocan SQL directamente.

---

## Flujo de autenticación

```
Request HTTP
     │
     ▼
getUserFromRequest(request)
     │  Lee header Authorization: Bearer <jwt>
     │  Verifica firma con JWT_SECRET
     │  Extrae { sub (user_id), username, email }
     │
     ▼
token válido? ──No──▶ 401 Unauthorized
     │
    Sí
     │
     ▼
Lógica de la ruta (verifica membresía, rol, etc.)
     │
     ▼
getSupabaseAdmin() ──▶ Supabase con service_role_key (bypasea RLS)
```

La clave `service_role_key` nunca se expone al cliente. Solo existe en variables de entorno del servidor.
