# Plan de Implementación — Clon de Messenger con Triple Cifrado

> **22 fases** · Next.js 14 + TypeScript + Supabase · Cripto desde cero
> Este documento cubre **Fases 0–10**. Las Fases 11–21 están en `implementation_plan_part2.md`.

---

## FASE 0 — Setup inicial del proyecto

**Objetivo:** Proyecto Next.js funcional con todas las dependencias no-cripto instaladas, estructura de carpetas definida, y configuración base.

**Prerrequisitos:** Node.js 18+, cuenta Supabase creada, repo Git inicializado.

**Tareas:**
1. Inicializar Next.js 14 con App Router + TypeScript estricto (`npx create-next-app@latest ./`)
2. Instalar dependencias: tailwindcss, shadcn/ui, zustand, @tanstack/react-query, react-hook-form, zod, @supabase/supabase-js, date-fns, lucide-react
3. Configurar `tsconfig.json` con `strict: true`, `noImplicitAny: true`
4. Crear estructura de carpetas
5. Configurar variables de entorno (`.env.local`) con URL y anon key de Supabase
6. Crear cliente Supabase básico
7. Crear archivo `PROGRESS.md`
8. Configurar ESLint con reglas de seguridad

**Archivos a crear:**
```
src/
├── app/              # App Router pages
├── components/       # UI components
│   ├── ui/          # shadcn components
│   └── shared/      # reusable components
├── lib/
│   ├── crypto/      # módulo criptográfico (Fase 1)
│   ├── supabase/    # cliente y helpers
│   ├── auth/        # autenticación custom
│   └── utils/       # utilidades generales
├── hooks/           # custom React hooks
├── stores/          # Zustand stores
├── types/           # TypeScript types/interfaces
└── constants/       # constantes de la app
.env.local
.env.example
PROGRESS.md
```

**Criterios de aceptación:**
- `npm run dev` levanta sin errores
- TypeScript strict sin warnings
- shadcn/ui funcional (al menos Button importado)
- Cliente Supabase conecta (log en consola)

**Complejidad:** Baja · **Riesgos:** Ninguno significativo

---

## FASE 1 — Módulo criptográfico propio

> **Esta fase se subdivide en 4 sub-fases por su complejidad.**

### FASE 1.1 — SHA-256 + HMAC-SHA-256

**Objetivo:** Implementar SHA-256 desde cero según FIPS 180-4, y HMAC según RFC 2104.

**Prerrequisitos:** Fase 0 completada.

**Tareas:**
1. Implementar SHA-256 con constantes K, funciones Ch/Maj/Σ, padding, schedule, compresión
2. Implementar HMAC-SHA-256 (key padding, ipad/opad XOR, doble hash)
3. Tests unitarios con vectores oficiales NIST y RFC 4231
4. Comentar cada paso del algoritmo en español

**Archivos:**
```
src/lib/crypto/sha256.ts
src/lib/crypto/hmac.ts
src/lib/crypto/__tests__/sha256.test.ts
src/lib/crypto/__tests__/hmac.test.ts
```

**Criterios:** Pasa todos los vectores de test NIST/RFC. Strings, buffers vacíos, multi-bloque.

**Complejidad:** Alta · **Riesgo:** Errores en padding de bits. Se usarán vectores oficiales.

### FASE 1.2 — PBKDF2

**Objetivo:** PBKDF2-HMAC-SHA256 según RFC 8018.

**Prerrequisitos:** Fase 1.1

**Tareas:**
1. Implementar PBKDF2 con iteraciones configurables, salt, dkLen
2. Tests con vectores RFC 7914 sección 11
3. Test de rendimiento (100,000 iteraciones < 5s en navegador)

**Archivos:**
```
src/lib/crypto/pbkdf2.ts
src/lib/crypto/__tests__/pbkdf2.test.ts
```

**Criterios:** Vectores RFC pasan. 100k iteraciones ejecutan sin crash.

**Complejidad:** Media

### FASE 1.3 — AES-256-GCM

**Objetivo:** AES-256 (cifrado de bloque) + modo GCM (autenticado) desde cero.

**Prerrequisitos:** Fase 1.1

**Tareas:**
1. AES-256: S-Box, key expansion, SubBytes, ShiftRows, MixColumns, AddRoundKey, 14 rondas
2. GCM: multiplicación en GF(2^128), GHASH, GCTR, cifrado/descifrado autenticado
3. Tests con vectores NIST SP 800-38D
4. Tests de integridad: modificar ciphertext → descifrado falla

**Archivos:**
```
src/lib/crypto/aes.ts        # AES-256 block cipher
src/lib/crypto/gcm.ts        # GCM mode
src/lib/crypto/__tests__/aes.test.ts
src/lib/crypto/__tests__/gcm.test.ts
```

**Criterios:** Vectores NIST pasan. Tag authentication falla con datos alterados.

**Complejidad:** Muy Alta · **Riesgo:** GF(2^128) es complejo. Implementar con lookup tables.

### FASE 1.4 — Diffie-Hellman + HKDF + API unificada

**Objetivo:** DH sobre grupo multiplicativo (RFC 3526 grupo 14, 2048-bit), HKDF (RFC 5869), y exportar API limpia.

**Prerrequisitos:** Fases 1.1–1.3

**Tareas:**
1. Implementar aritmética modular BigInt para DH (modPow, generación de par de claves, cómputo de shared secret)
2. HKDF-SHA256: extract + expand
3. Crear `index.ts` que exporta API unificada del módulo cripto
4. Tests con vectores RFC 5869 para HKDF
5. Test de integración: DH key exchange entre dos "clientes" simulados → AES-GCM encrypt/decrypt exitoso

**Archivos:**
```
src/lib/crypto/dh.ts
src/lib/crypto/hkdf.ts
src/lib/crypto/index.ts      # API pública unificada
src/lib/crypto/__tests__/dh.test.ts
src/lib/crypto/__tests__/hkdf.test.ts
src/lib/crypto/__tests__/integration.test.ts
```

**Criterios:** HKDF pasa vectores RFC. DH genera shared secret idéntico en ambos lados. E2E: DH → HKDF → AES-GCM → decrypt exitoso.

**Complejidad:** Alta

**Decisiones a consultar:**
> ¿Usar grupo DH de 2048-bit (RFC 3526 grupo 14) o implementar ECDH sobre Curve25519? DH clásico es más sencillo de implementar desde cero. ECDH es más seguro y eficiente pero la aritmética de curvas elípticas es significativamente más compleja. **Recomiendo DH clásico por tiempo.**

---

## FASE 2 — Esquema de BD + RLS

**Objetivo:** Crear todas las tablas en Supabase con RLS, índices y migraciones versionadas.

**Prerrequisitos:** Fase 0 (Supabase configurado)

**Tareas:**
1. Escribir migración SQL con las 16 tablas definidas en el spec
2. Crear políticas RLS para cada tabla
3. Crear índices para rendimiento
4. Crear funciones SQL auxiliares (ej: `is_participant()`)
5. Ejecutar migración en Supabase
6. Documentar esquema en `docs/database.md`

**Archivos:**
```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_indexes.sql
supabase/migrations/004_functions.sql
docs/database.md
```

**Criterios:** Tablas creadas en Supabase. RLS activa. Un usuario no puede leer datos de otro (test manual con dos API keys).

**Complejidad:** Media-Alta · **Riesgo:** Políticas RLS recursivas (ya vi en tu proyecto anterior). Usar funciones `security definer`.

---

## FASE 3 — Autenticación custom

### FASE 3.1 — Registro + Login backend

**Objetivo:** API routes para registro y login usando cripto propia + JWT manual.

**Prerrequisitos:** Fases 1 y 2

**Tareas:**
1. Implementar generación/verificación JWT con HMAC-SHA256 propio (header.payload.signature)
2. API Route `POST /api/auth/register`: recibir hash+salt+keys, insertar en users
3. API Route `POST /api/auth/salt`: dado email, retornar salt (para que cliente compute PBKDF2)
4. API Route `POST /api/auth/login`: recibir email+hash, comparar, emitir JWT
5. Middleware de verificación JWT para rutas protegidas
6. Rate limiting en login (tabla `login_attempts`)
7. Crear `src/lib/auth/jwt.ts` con sign/verify propios

**Archivos:**
```
src/lib/auth/jwt.ts
src/app/api/auth/register/route.ts
src/app/api/auth/salt/route.ts
src/app/api/auth/login/route.ts
src/middleware.ts
src/lib/auth/rate-limiter.ts
src/lib/auth/__tests__/jwt.test.ts
```

**Criterios:** Registro crea usuario. Login retorna JWT válido. JWT expirado es rechazado. 6to intento en 1 min → 429.

**Complejidad:** Alta

### FASE 3.2 — UI de registro/login + flujo cliente

**Objetivo:** Páginas de registro y login con flujo criptográfico completo del lado del cliente.

**Prerrequisitos:** Fase 3.1

**Tareas:**
1. Página `/auth/register` con formulario (email, username, password, confirmar password)
2. Página `/auth/login` con formulario
3. Lógica cliente: generar salt → PBKDF2 → generar DH keys → cifrar private key → enviar
4. Store Zustand para sesión (user, JWT, private key en memoria)
5. Página `/auth/forgot-password` (enviar email con token temporal)
6. Página `/auth/reset-password` (nueva password, re-cifrar private key)
7. Validación con Zod + React Hook Form

**Archivos:**
```
src/app/auth/register/page.tsx
src/app/auth/login/page.tsx
src/app/auth/forgot-password/page.tsx
src/app/auth/reset-password/page.tsx
src/stores/auth-store.ts
src/hooks/useAuth.ts
src/lib/auth/client-auth.ts    # lógica cripto del cliente
```

**Criterios:** Registro completo funciona E2E. Login funciona. Password nunca viaja en texto plano (verificar en Network tab). JWT se almacena en httpOnly cookie.

**Complejidad:** Alta

---

## FASE 4 — Layout base + navegación

**Objetivo:** Shell visual estilo Messenger: sidebar con lista de chats, panel de conversación, routing.

**Prerrequisitos:** Fase 3.2 (auth funcional para proteger rutas)

**Tareas:**
1. Layout principal: sidebar izquierda (320px) + panel derecho
2. Header con avatar usuario, búsqueda, botón nuevo chat
3. Lista de conversaciones (placeholder vacío por ahora)
4. Panel de conversación vacío con mensaje "Selecciona un chat"
5. Rutas: `/chat`, `/chat/[conversationId]`, `/settings`
6. Componente `ProtectedRoute` que redirige a login si no hay JWT
7. Responsive: en mobile, sidebar ocupa 100%, conversación es otra vista
8. Aplicar estilos Messenger (#378ADD, bordes redondeados, etc.)

**Archivos:**
```
src/app/chat/layout.tsx
src/app/chat/page.tsx
src/app/chat/[conversationId]/page.tsx
src/app/settings/page.tsx
src/components/layout/Sidebar.tsx
src/components/layout/ChatPanel.tsx
src/components/layout/Header.tsx
src/components/shared/Avatar.tsx         # con color generado por hash de user_id
src/components/shared/OnlineIndicator.tsx
```

**Criterios:** Layout visual similar a Messenger. Responsive. Redirige a login si no autenticado.

**Complejidad:** Media

---

## FASE 5 — Gestión de contactos

**Objetivo:** Enviar solicitudes de amistad, aceptar/rechazar, listar contactos, eliminar.

**Prerrequisitos:** Fases 2 y 4

**Tareas:**
1. API Route `POST /api/contacts/request` — enviar solicitud
2. API Route `PATCH /api/contacts/respond` — aceptar/rechazar
3. API Route `GET /api/contacts` — listar amigos
4. API Route `DELETE /api/contacts/[id]` — eliminar
5. API Route `GET /api/users/search?q=` — buscar usuarios por username
6. UI: modal de búsqueda de usuarios, lista de contactos en sidebar
7. UI: notificación de solicitud pendiente, botones aceptar/rechazar
8. Suscripción Realtime a cambios en `friendships` del usuario

**Archivos:**
```
src/app/api/contacts/request/route.ts
src/app/api/contacts/respond/route.ts
src/app/api/contacts/route.ts
src/app/api/contacts/[id]/route.ts
src/app/api/users/search/route.ts
src/components/contacts/ContactList.tsx
src/components/contacts/ContactRequest.tsx
src/components/contacts/SearchUsersModal.tsx
src/hooks/useContacts.ts
```

**Criterios:** Flujo completo funciona. RLS impide ver solicitudes ajenas.

**Complejidad:** Media

---

## FASE 6 — Conversaciones 1-a-1 con triple cifrado

### FASE 6.1 — Creación de conversación + intercambio DH

**Objetivo:** Crear conversación 1-a-1, ejecutar DH key agreement, almacenar clave compartida cifrada.

**Prerrequisitos:** Fases 1 y 5

**Tareas:**
1. API Route `POST /api/conversations` — crear conversación + participant records
2. Lógica cliente: al crear conversación con user B, tomar public_key_B de la BD, computar DH shared secret, derivar AES key con HKDF
3. Cifrar la shared key con la clave local de cada participante y guardar en `conversation_keys`
4. Al abrir conversación existente, cargar `conversation_keys`, descifrar shared key en memoria

**Archivos:**
```
src/app/api/conversations/route.ts
src/lib/crypto/key-exchange.ts   # orquesta DH + HKDF + cifrado de shared key
src/hooks/useConversation.ts
src/stores/keys-store.ts         # shared keys en memoria (nunca persistir en claro)
```

**Criterios:** Shared key derivada idéntica en ambos lados (test). Stored encrypted en BD. Clave nunca en claro en BD.

**Complejidad:** Alta

### FASE 6.2 — Envío y recepción de mensajes con triple cifrado

**Objetivo:** Flujo completo: escribir mensaje → Cifrado E2E → Cifrado at-rest en servidor → Descifrado at-rest → Descifrado E2E → mostrar. Cache local con cifrado PBKDF2.

**Prerrequisitos:** Fase 6.1

**Tareas:**
1. **Capa 1 (E2E):** Cliente cifra con AES-256-GCM usando shared key + IV aleatorio
2. **Capa 2 (At-Rest):** API Route `/api/messages/send` aplica segunda capa AES-GCM con clave maestra del sistema
3. Guardar en BD: doble ciphertext + ambos IVs + ambos auth tags
4. **Descifrado Capa 2:** API Route `/api/messages/[conversationId]` quita capa del servidor antes de enviar
5. **Descifrado Capa 1:** Cliente descifra E2E con shared key
6. **Capa 3 (Local):** Guardar en IndexedDB cifrado con clave derivada del password (PBKDF2)
7. UI: input de mensaje, burbujas de chat (azul propias, gris recibidas), timestamps

**Archivos:**
```
src/app/api/messages/send/route.ts
src/app/api/messages/[conversationId]/route.ts
src/lib/crypto/triple-encrypt.ts    # orquesta las 3 capas
src/lib/storage/indexed-db.ts       # cache local cifrado
src/components/chat/MessageInput.tsx
src/components/chat/MessageBubble.tsx
src/components/chat/ChatView.tsx
src/hooks/useMessages.ts
```

**Criterios:** Mensaje enviado por A aparece descifrado en B. BD contiene solo ciphertext. IndexedDB contiene ciphertext. Network tab muestra solo ciphertext. Modificar ciphertext en BD → descifrado falla (integridad).

**Complejidad:** Muy Alta

---

## FASE 7 — Realtime

**Objetivo:** Mensajes en tiempo real, estados de mensaje, presencia online, indicador "escribiendo...".

**Prerrequisitos:** Fase 6.2

**Tareas:**
1. Suscripción Supabase Realtime a inserts en `messages` filtrado por conversación
2. Al recibir mensaje, descifrar y mostrar en tiempo real
3. Estados: `sent` al insertar, `delivered` cuando receptor recibe, `read` cuando abre el chat
4. API Route `PATCH /api/messages/status` — actualizar estado
5. UI: ✓ (enviado), ✓✓ (entregado), ✓✓ azul (leído)
6. Supabase Realtime Presence para online/offline
7. Supabase Realtime Broadcast para "escribiendo..."
8. UI: punto verde en avatar si online, "Escribiendo..." en header del chat

**Archivos:**
```
src/hooks/useRealtimeMessages.ts
src/hooks/usePresence.ts
src/hooks/useTypingIndicator.ts
src/app/api/messages/status/route.ts
src/components/chat/MessageStatus.tsx
src/components/chat/TypingIndicator.tsx
```

**Criterios:** Mensaje aparece en <1s sin refrescar. Estados actualizan en tiempo real. Presencia funciona.

**Complejidad:** Media-Alta

---

## FASE 8 — Historial paginado + búsqueda

**Objetivo:** Scroll infinito con cursor-based pagination y búsqueda full-text.

**Prerrequisitos:** Fase 7

**Tareas:**
1. API Route `GET /api/messages/[conversationId]?cursor=&limit=30` — paginación por cursor (created_at)
2. Scroll infinito: cargar más al llegar al tope
3. Crear columna `tsvector` en messages (sobre texto plano — **decisión a consultar**)
4. API Route `GET /api/search?q=&type=messages|contacts`
5. UI: barra de búsqueda global, resultados con preview y navegación al mensaje

**Archivos:**
```
src/app/api/messages/[conversationId]/route.ts  # (modificar, agregar paginación)
src/app/api/search/route.ts
src/hooks/useInfiniteMessages.ts
src/components/search/SearchBar.tsx
src/components/search/SearchResults.tsx
```

**Criterios:** Carga 30 mensajes, scroll carga 30 más. Búsqueda retorna resultados relevantes.

**Complejidad:** Media

**Decisión a consultar:**
> La búsqueda full-text requiere texto plano en el servidor. Pero los mensajes están cifrados E2E. **Opciones:** (A) Búsqueda solo local sobre IndexedDB descifrado. (B) Indexar palabras clave con hash (búsqueda ciega). (C) Aceptar que el servidor indexa solo metadatos (fecha, tipo, sender). **Recomiendo opción A para mantener E2E puro.**

---

## FASE 9 — Interacciones

**Objetivo:** Reacciones emoji, responder/citar mensajes, reenviar, editar y eliminar.

**Prerrequisitos:** Fase 7

**Tareas:**
1. API Route `POST /api/reactions` — agregar reacción (emoji limitado a un set)
2. API Route `DELETE /api/reactions` — quitar reacción
3. Responder: campo `reply_to_id` en mensaje, UI muestra quote del mensaje original
4. Reenviar: copiar mensaje a otra conversación (re-cifrar con clave de destino)
5. Editar: actualizar ciphertext + `edited_at`, solo autor, ventana de 15 min
6. Eliminar: soft delete (`deleted_at`), muestra "Mensaje eliminado"
7. UI: menú contextual (long press / right click) en cada mensaje

**Archivos:**
```
src/app/api/reactions/route.ts
src/app/api/messages/edit/route.ts
src/app/api/messages/delete/route.ts
src/app/api/messages/forward/route.ts
src/components/chat/MessageContextMenu.tsx
src/components/chat/ReplyPreview.tsx
src/components/chat/ReactionPicker.tsx
src/components/chat/ReactionDisplay.tsx
```

**Criterios:** Cada interacción funciona E2E. Solo autor puede editar/eliminar. Reacciones visibles en tiempo real.

**Complejidad:** Media

---

## FASE 10 — Grupos

### FASE 10.1 — Gestión de grupos

**Objetivo:** Crear grupos, agregar/quitar miembros, roles admin/member, editar nombre/avatar.

**Prerrequisitos:** Fases 5 y 6.1

**Tareas:**
1. API Route `POST /api/conversations` — extender para `is_group: true`
2. API Route `PATCH /api/conversations/[id]` — editar nombre, avatar
3. API Route `POST /api/conversations/[id]/members` — agregar miembro
4. API Route `DELETE /api/conversations/[id]/members/[userId]` — quitar
5. API Route `PATCH /api/conversations/[id]/members/[userId]` — cambiar rol
6. Al agregar miembro: generar nueva shared key del grupo, re-cifrar para todos
7. UI: modal de creación de grupo, panel de info del grupo, lista de miembros

**Archivos:**
```
src/app/api/conversations/[id]/route.ts
src/app/api/conversations/[id]/members/route.ts
src/app/api/conversations/[id]/members/[userId]/route.ts
src/components/groups/CreateGroupModal.tsx
src/components/groups/GroupInfo.tsx
src/components/groups/MemberList.tsx
src/lib/crypto/group-key-exchange.ts
```

**Criterios:** Grupo creado con N miembros. Todos comparten misma clave. Admin puede quitar miembros. Miembro quitado no puede descifrar mensajes nuevos (key rotation).

**Complejidad:** Alta

### FASE 10.2 — Mensajería grupal

**Objetivo:** Mensajes de grupo con triple cifrado usando clave compartida del grupo.

**Prerrequisitos:** Fase 10.1

**Tareas:**
1. Reutilizar flujo de Fase 6.2 pero con clave de grupo en vez de 1-a-1
2. Realtime para N participantes simultáneos
3. UI: mismas burbujas pero con nombre del sender encima

**Archivos:** Modificaciones a archivos existentes de Fase 6 y 7.

**Criterios:** Mensaje enviado por A aparece descifrado en B, C, D... del grupo.

**Complejidad:** Media

---

> **Continúa en `implementation_plan_part2.md` → Fases 11–21**
