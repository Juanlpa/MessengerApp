# PROGRESS — Messenger Clone con Triple Cifrado E2E

> Proyecto: Materia Seguridad en Desarrollo de Software  
> Stack: Next.js 15 + TypeScript + Supabase + Cripto desde cero  
> Rama activa: `integration/contacts-groups`  
> Última actualización: 2026-04-27

---

## Estado General

| Fases completadas | Fases parciales | Fases pendientes |
|:-----------------:|:---------------:|:----------------:|
| 10 | 4 | 8 |

**Progreso estimado: ~55% del proyecto completo**

---

## FASE 0 — Setup inicial ✅ COMPLETA

- Next.js 15 + TypeScript strict + Tailwind CSS 4 + shadcn/ui
- Estructura de carpetas definida (`src/app/`, `src/lib/`, `src/hooks/`, `src/stores/`, etc.)
- ESLint + `eslint-plugin-security` configurado
- Jest + Testing Library configurado
- GitHub Actions CI (`ci.yml`) operativo: lint → tsc → test → npm audit
- Variables de entorno documentadas en `.env.example`
- Cliente Supabase configurado (client, server, admin)

---

## FASE 1 — Módulo criptográfico propio ✅ COMPLETA

> **Todo el cripto implementado desde cero, sin librerías externas de cripto.**

### 1.1 — SHA-256 + HMAC-SHA-256 ✅
- `src/lib/crypto/sha256.ts` — SHA-256 según FIPS 180-4 (212 líneas)
- `src/lib/crypto/hmac.ts` — HMAC-SHA-256 según RFC 2104 (65 líneas)
- Tests con vectores NIST/RFC: `src/lib/crypto/__tests__/sha256.test.ts`, `hmac.test.ts`

### 1.2 — PBKDF2 ✅
- `src/lib/crypto/pbkdf2.ts` — PBKDF2-HMAC-SHA256 según RFC 8018 (87 líneas)
- Tests con vectores RFC 7914: `src/lib/crypto/__tests__/pbkdf2.test.ts`

### 1.3 — AES-256 + Cifrado autenticado ✅
- `src/lib/crypto/aes.ts` — AES-256 block cipher (150 líneas)
- `src/lib/crypto/aes-cbc.ts` — Modo CBC (115 líneas)
- `src/lib/crypto/encrypt.ts` — AES-CBC-HMAC (cifrado autenticado, 115 líneas)
- Tests: `src/lib/crypto/__tests__/aes.test.ts`, `encrypt.test.ts`

### 1.4 — Diffie-Hellman + HKDF + API unificada ✅
- `src/lib/crypto/dh.ts` — DH sobre RFC 3526 Grupo 14 (2048-bit MODP) (85 líneas)
- `src/lib/crypto/hkdf.ts` — HKDF-SHA256 según RFC 5869 (71 líneas)
- `src/lib/crypto/index.ts` — API pública unificada (42 líneas)
- `src/lib/crypto/utils.ts` — utilidades (hex, bytes, random) (198 líneas)
- Tests: `dh.test.ts`, `hkdf.test.ts`, `integration.test.ts`

---

## FASE 2 — Esquema de BD + RLS ✅ COMPLETA (esquema prototipo)

> Nota: Se implementó un esquema de prototipo con las tablas esenciales. El esquema completo de 16 tablas del plan se expandirá en fases posteriores.

- `supabase/migrations/001_prototype_schema.sql` — 4 tablas: `users`, `conversations`, `conversation_participants`, `messages`
- `supabase/migrations/002_realtime_status.sql` — columna `status` + configuración Realtime
- RLS activo en todas las tablas
- Índices en columnas críticas
- `conversation_participants` almacena `encrypted_shared_key`, `shared_key_iv`, `shared_key_mac`

**Tablas pendientes para fases futuras:** `friendships`, `reactions`, `attachments`, `calls`, `call_participants`, `security_logs`, `push_subscriptions`, `user_preferences`

---

## FASE 3 — Autenticación custom ✅ COMPLETA

### 3.1 — Backend ✅
- `src/lib/auth/jwt.ts` — JWT con HMAC-SHA256 propio (sign/verify)
- `src/app/api/auth/register/route.ts` — Recibe hash+salt+DH keys, inserta usuario
- `src/app/api/auth/salt/route.ts` — Retorna salt dado email (para PBKDF2 del cliente)
- `src/app/api/auth/login/route.ts` — Verifica hash PBKDF2, emite JWT
- `src/app/api/auth/me/route.ts` — Retorna usuario autenticado
- `src/middleware.ts` — Verificación JWT en rutas protegidas
- Rate limiting en login vía `login_attempts`
- Tests: `src/lib/auth/__tests__/jwt.test.ts`

### 3.2 — UI + flujo cliente ✅
- `src/app/auth/register/page.tsx` — Formulario con flujo cripto completo en cliente
- `src/app/auth/login/page.tsx` — Login con PBKDF2 del lado cliente
- `src/lib/auth/client-auth.ts` — Orquesta: salt → PBKDF2 → DH keys → cifrado → envío
- `src/stores/auth-store.ts` — Zustand: user, JWT, private key en memoria
- `src/hooks/useAuth.ts` — Hook de autenticación
- Validación con Zod + React Hook Form
- Estilos dark mode estilo Messenger

---

## FASE 4 — Layout base + navegación ✅ COMPLETA

- `src/app/chat/layout.tsx` — Layout protegido con sidebar
- `src/app/chat/page.tsx` — Página raíz del chat (lista de conversaciones)
- `src/app/chat/[conversationId]/page.tsx` — Vista de conversación
- `src/components/ui/` — Componentes shadcn/ui (avatar, badge, button, dialog, dropdown, input, scroll-area, separator, tooltip)
- Rutas `/chat`, `/chat/[id]`, `/auth/login`, `/auth/register`
- Responsive + estilos dark mode estilo Messenger (#378ADD)

---

## FASE 5 — Gestión de contactos ✅ COMPLETA

**Implementado (rama integration/contacts-groups):**
- `supabase/migrations/004_create_friendships.sql` — Tabla `friendships` con RLS completo
- `src/lib/validation/contacts-schemas.ts` — Schemas Zod (SendRequest, RespondRequest)
- `src/app/api/contacts/request/route.ts` — POST: enviar solicitud
- `src/app/api/contacts/[id]/respond/route.ts` — PATCH: aceptar/rechazar (solo addressee)
- `src/app/api/contacts/route.ts` — GET: listar amigos aceptados
- `src/app/api/contacts/pending/route.ts` — GET: solicitudes recibidas pendientes
- `src/app/api/contacts/sent/route.ts` — GET: solicitudes enviadas
- `src/app/api/contacts/[id]/route.ts` — DELETE: eliminar contacto
- `src/hooks/useContacts.ts` — Hooks: useContacts, usePendingRequests, useSentRequests, useSendRequest, useRespondRequest, useDeleteContact
- `src/components/contacts/ContactCard.tsx` — Tarjeta de contacto con avatar generado por hash
- `src/components/contacts/PendingRequests.tsx` — Solicitudes pendientes con aceptar/rechazar
- `src/components/contacts/SendRequestModal.tsx` — Modal de búsqueda + envío de solicitud
- `src/components/contacts/ContactsList.tsx` — Lista de contactos con tabs (Amigos / Solicitudes)
- Realtime: suscripción a nuevas solicitudes vía Supabase Realtime
- `src/__tests__/api/contacts.test.ts` — 13 tests de API routes
- `src/__tests__/rls/friendships-rls.test.ts` — 6 tests de aislamiento RLS

**Tests:** 21/21 pasando · TypeScript: 0 errores · npm audit: 0 high/critical

---

## FASE 6 — Conversaciones 1-a-1 con triple cifrado ✅ COMPLETA

### 6.1 — DH Key Exchange ✅
- `src/lib/crypto/key-exchange.ts` — Orquesta DH + HKDF para derivar shared key
- `src/app/api/conversations/route.ts` — Crear conversación + participant records con shared key cifrada
- `src/stores/keys-store.ts` — (integrado en auth-store) shared keys en memoria

### 6.2 — Triple cifrado de mensajes ✅
- `src/lib/crypto/message-crypto.ts` — Capa 1 E2E (AES-CBC-HMAC con shared key) + Capa 2 at-rest (clave maestra del servidor)
- `src/app/api/conversations/[id]/messages/route.ts` — GET quita Capa 2 antes de enviar, POST aplica Capa 2 al guardar
- `src/app/api/conversations/[id]/messages/single/route.ts` — Mensaje individual
- Capa 3 (local/IndexedDB): integrada en cliente (aún sin IndexedDB dedicado, usa memoria)
- `src/components/chat/` — MessageStatus, TypingIndicator, OnlineIndicator

**Flujo verificado:** Mensaje enviado por A aparece descifrado en B. BD contiene solo ciphertext.

---

## FASE 7 — Realtime ✅ COMPLETA

- `src/hooks/useRealtimeMessages.ts` — Suscripción a inserts en `messages` por conversación (192 líneas)
- `src/hooks/usePresence.ts` — Online/offline con Supabase Realtime Presence (113 líneas)
- `src/hooks/useTypingIndicator.ts` — "Escribiendo..." con Supabase Realtime Broadcast (132 líneas)
- `src/app/api/messages/status/route.ts` — Actualizar estado sent/delivered/read (81 líneas)
- `src/components/chat/MessageStatus.tsx` — UI de ✓ / ✓✓ / ✓✓ azul

---

## FASE 8 — Historial paginado + búsqueda ⚠️ PARCIAL

**Implementado:**
- Paginación por cursor en `GET /api/conversations/[id]/messages?cursor=&limit=30`

**Pendiente:**
- Scroll infinito en UI (cargar más al hacer scroll al tope)
- `GET /api/search?q=` — búsqueda (opción recomendada: solo local sobre IndexedDB)
- Componentes `SearchBar`, `SearchResults`

---

## FASE 9 — Interacciones ❌ PENDIENTE

Reacciones, responder/citar, reenviar, editar, eliminar mensajes.

---

## FASE 10 — Grupos ❌ PENDIENTE

Grupos con cifrado de clave compartida para N miembros, roles admin/member.

---

## FASE 11 — Adjuntos cifrados ❌ PENDIENTE

Subir imágenes/archivos cifrados E2E a Supabase Storage.

---

## FASE 12 — Mensajes de voz ❌ PENDIENTE

MediaRecorder → cifrar → enviar → reproductor custom.

---

## FASE 13 — Llamadas de voz 1-a-1 ⚠️ PARCIAL (incluido en Fase 14)

Implementado junto con videollamadas en `useWebRTC.ts`.

---

## FASE 14 — Videollamadas 1-a-1 ⚠️ PARCIAL

### 14.1 — Video básico ✅
- `src/hooks/useWebRTC.ts` — RTCPeerConnection + señalización vía Supabase Broadcast (238 líneas)
  - Estados: idle → calling → receiving → connected
  - Audio + video bidireccional
  - Servidores STUN de Google
  - Mute / colgar
- `src/components/chat/CallModal.tsx` — UI de videollamada con PiP

**Commit de verificación:** `c5f8aa9 videollamada funcionando`

### 14.2 — Insertable Streams (cifrado de media) ❌ PENDIENTE
- `src/lib/webrtc/insertable-streams.ts` — no implementado
- `src/lib/webrtc/frame-crypto.ts` — no implementado

---

## FASE 15 — Llamadas grupales mesh ❌ PENDIENTE

---

## FASE 16 — Archivar/silenciar conversaciones ❌ PENDIENTE

---

## FASE 17 — Temas y personalización ❌ PENDIENTE

---

## FASE 18 — Notificaciones push ❌ PENDIENTE

---

## FASE 19 — Seguridad: headers, rate limiting, hardening ❌ PENDIENTE

Headers CSP/HSTS, rate limiting generalizado, CSRF, sanitización, logs de auditoría.

---

## FASE 20 — Tests, OWASP ZAP, Burp Suite, npm audit ⚠️ PARCIAL

**Implementado:**
- Tests unitarios del módulo cripto (Fases 1.1–1.4):
  - `sha256.test.ts`, `hmac.test.ts`, `pbkdf2.test.ts`, `aes.test.ts`, `encrypt.test.ts`, `dh.test.ts`, `hkdf.test.ts`, `integration.test.ts`
- Test JWT: `src/lib/auth/__tests__/jwt.test.ts`
- CI corre `npm test --coverage` en cada push

**Pendiente:**
- Tests de API routes (auth, messages, conversations)
- Tests de componentes React con Testing Library
- Cobertura ≥60% (pendiente de medir)
- OWASP ZAP baseline scan → `docs/owasp-report.md`
- Burp Suite pentesting manual → `docs/burpsuite-report.md`
- `npm audit` sin vulnerabilidades high/critical

---

## FASE 21 — Documentación y defensa ⚠️ PARCIAL

**Implementado:**
- `docs/DEMO_SCRIPT.md` — guión básico de demo

**Pendiente:**
- `README.md` completo con arquitectura y setup
- Diagramas (arquitectura, secuencia, ER) en Mermaid
- `docs/security-design.md`, `docs/database-diagram.md`, `docs/sequence-diagrams.md`
- `docs/defense-script.md` — guión de defensa final
- `docs/user-manual.md`

---

## Cambio de herramientas de análisis de seguridad

**Fecha:** 2026-04-23  
**Decisión:** Se reemplazó SonarQube por OWASP ZAP + Burp Suite como herramientas de análisis de seguridad, según especificación del profesor de la materia.

- **OWASP ZAP Community Edition:** análisis dinámico automatizado (DAST) — en local y en CI (`.github/workflows/security.yml`)
- **Burp Suite Community Edition:** pentesting manual (interceptar tráfico, replay attacks, fuzzing, bypass de RLS)
- **npm audit:** vulnerabilidades de dependencias (sin cambios)

**Razón:** La materia es "Seguridad en Desarrollo de Software". OWASP ZAP es análisis dinámico (encuentra vulnerabilidades en runtime), más alineado con el espíritu de la materia que SonarQube (análisis estático). Burp Suite complementa con pruebas manuales de penetración.

---

## Próximas tareas (orden sugerido)

1. **Fase 5 completa** — rutas de contactos + tabla `friendships`
2. **Fase 8 completa** — scroll infinito + búsqueda local
3. **Fase 9** — interacciones (reacciones, editar, eliminar)
4. **Fase 10** — grupos
5. **Fase 19** — hardening (headers, CSRF, rate limiting)
6. **Fase 20** — tests completos + OWASP ZAP + Burp Suite
7. **Fase 21** — documentación final
