# Rotación de Claves de Grupo

## Visión general

Cada grupo tiene una clave simétrica AES-256 que se rota automáticamente en cada cambio de membresía. El objetivo es limitar el acceso a mensajes futuros cuando un miembro sale, y a mensajes pasados cuando uno entra.

La implementación vive en `src/lib/groups/key-rotation.ts`.

---

## Modelo de cifrado en grupos

Los mensajes de grupo usan **dos capas de cifrado**:

| Capa | Dónde | Con qué clave | Propósito |
|---|---|---|---|
| Capa 1 (E2E) | Cliente | Clave simétrica de grupo (hex, obtenida de la API) | Solo miembros activos pueden leer |
| Capa 2 (at-rest) | Servidor | `ENCRYPTION_MASTER_KEY` (AES-256-CBC-HMAC) | Protección si la DB es comprometida |

La clave de grupo nunca se almacena en claro — se persiste cifrada con la clave maestra del servidor.

---

## Tabla `group_keys`

```
group_id | key_version | encrypted_key | iv | mac | is_active | created_at
```

- Solo una fila puede tener `is_active = TRUE` por grupo (garantizado por índice UNIQUE parcial).
- Las versiones anteriores se conservan como historial (`is_active = FALSE`).
- `key_version` incrementa con cada rotación: 1 → 2 → 3 → …

---

## Ciclo de vida de una clave

### Creación inicial
Al crear un grupo, se llama `createInitialGroupKey(groupId)`:
1. Genera 32 bytes aleatorios (clave de grupo).
2. La cifra con `ENCRYPTION_MASTER_KEY` → `(encrypted_key, iv, mac)`.
3. Inserta en `group_keys` con `key_version = 1`, `is_active = TRUE`.

### Rotación
Disparada por `rotateGroupKey(groupId)`:
1. Actualiza `is_active = FALSE` en la clave activa actual.
2. Consulta el `key_version` más alto existente → calcula `nextVersion = max + 1`.
3. Genera nueva clave, la cifra, la inserta con `is_active = TRUE`.

### Recuperación para el cliente
`getActiveGroupKey(groupId)` busca la fila con `is_active = TRUE`, la descifra con la clave maestra y retorna `{ keyHex, keyVersion }`.

---

## Cuándo se rota

| Evento | Función llamada | Razón |
|---|---|---|
| Un miembro **entra** al grupo | `rotateOnMemberJoin(groupId)` | El nuevo miembro no debe poder descifrar mensajes anteriores a su ingreso |
| Un miembro **sale** o es **eliminado** | `rotateOnMemberLeave(groupId)` | El ex-miembro no debe poder descifrar mensajes futuros |

Ambas funciones llaman internamente a `rotateGroupKey`.

---

## Flujo completo — envío de mensaje

```
Cliente                              Servidor (API route)
  │                                        │
  ├─ GET /api/groups/[id]/key ────────────▶│
  │                                        ├─ Verifica membresía
  │                                        ├─ getActiveGroupKey() → descifra con MASTER_KEY
  │◀──────────── { key, key_version } ─────┤
  │                                        │
  ├─ Cifra mensaje con key (Capa 1)        │
  ├─ POST /api/groups/[id]/messages ──────▶│
  │  { e2eEncrypted: {ciphertext,iv,mac} } ├─ Verifica membresía
  │                                        ├─ Cifra e2eCiphertext con MASTER_KEY (Capa 2)
  │                                        ├─ INSERT en messages
  │◀──────────── 201 ───────────────────── ┤
```

---

## Flujo completo — lectura de mensajes

```
Cliente                              Servidor
  │                                        │
  ├─ GET /api/groups/[id]/key ────────────▶│  (solo si no tiene la versión activa)
  │◀──────────── { key, key_version } ─────┤
  │                                        │
  ├─ GET /api/groups/[id]/messages ───────▶│
  │                                        ├─ Verifica membresía
  │                                        ├─ Descifra Capa 2 (MASTER_KEY) → obtiene e2eCiphertext
  │◀──────────── [ mensajes ] ─────────────┤
  │                                        │
  ├─ Descifra Capa 1 con key local         │
  ├─ Renderiza mensaje en claro            │
```

---

## Endpoint de clave

`GET /api/groups/[id]/key`

- Requiere JWT válido.
- Verifica que el solicitante sea miembro activo del grupo (`conversation_participants`).
- Retorna `{ key: string (hex), key_version: number }`.
- Retorna `403` si no es miembro, `404` si el grupo no tiene clave asignada.

---

## Variables de entorno requeridas

| Variable | Formato | Descripción |
|---|---|---|
| `ENCRYPTION_MASTER_KEY` | 64 caracteres hex (256 bits) | Clave maestra del servidor para cifrar/descifrar claves de grupo |

Esta variable debe mantenerse fuera del repositorio (`.env.local`) y rotarse si se sospecha compromiso.

---

## Garantías de seguridad

| Propiedad | Estado |
|---|---|
| Forward secrecy parcial (salida de miembro) | ✅ La rotación impide acceso a mensajes futuros |
| Backward secrecy parcial (entrada de miembro) | ✅ La rotación impide acceso a mensajes anteriores |
| Confidencialidad en la DB | ✅ La clave de grupo siempre está cifrada en reposo |
| Aislamiento entre grupos | ✅ Cada grupo tiene su propia secuencia de claves independiente |
| Revocación inmediata | ✅ La rotación ocurre en el mismo request que el cambio de membresía |

> **Limitación**: No se implementa Perfect Forward Secrecy (PFS) completo — los mensajes cifrados con claves anteriores siguen siendo descifrable por quien tenga la `ENCRYPTION_MASTER_KEY` del servidor. PFS completo requeriría cifrado asimétrico por mensaje, fuera del alcance de este prototipo.
