# Clon de Messenger con Triple Cifrado 🔒

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![OWASP ZAP](https://img.shields.io/badge/OWASP_ZAP-00549E?style=for-the-badge&logo=owasp&logoColor=white)
![Licencia Académica](https://img.shields.io/badge/Licencia-Acad%C3%A9mica-blue?style=for-the-badge)

Proyecto académico para la materia "Seguridad en Desarrollo de Software". Consiste en un clon funcional de Facebook Messenger enfocado estrictamente en seguridad, criptografía end-to-end (E2E) y prevención sistemática de vulnerabilidades.

## Repartición de tareas por integrante

### Joel Espinoza — Auth y Seguridad Defensiva

**Rama de integración:** `integration/auth-security`

**Áreas de código:**
- `src/lib/auth/`
- `src/app/auth/`
- `src/app/settings/`
- `src/app/api/auth/`
- `next.config.mjs`

**Tareas asignadas:**

| Tarea | Rama feature | Requerimiento |
|-------|--------------|---------------|
| Recuperación de password | `feature/auth-password-recovery` | Req 3 |
| Rate limiting y anti-bruteforce | `feature/auth-rate-limiting` | Seguridad |
| Headers de seguridad (CSP, HSTS) | `feature/auth-security-headers` | Seguridad |
| Auditoría y logging centralizados | `feature/auth-audit-logging` | Seguridad |
| Gestión de sesiones y revocación | `feature/auth-sessions-management` | Extra |
| Temas modo claro/oscuro | `feature/auth-themes` | Req 20 |
| Configurar OWASP ZAP | `feature/security-owasp-zap` | Análisis |
| Documentación de seguridad | `docs/security-cryptography` | Docs |

**Estimación:** 28-35 horas

**Responsabilidades transversales:**
- Coordinador de OWASP ZAP scans
- Define el schema de `security_logs` y la función `logSecurityEvent()` que usa todo el equipo
- Review obligatorio de todo código criptográfico

### Juan López — Contactos, Grupos y Archivado

**Rama de integración:** `integration/contacts-groups`

**Áreas de código:**
- `src/app/api/contacts/`
- `src/app/api/conversations/`
- `src/components/groups/`
- `src/components/contacts/`
- `supabase/migrations/`

**Tareas asignadas:**

| Tarea | Rama feature | Requerimiento |
|-------|--------------|---------------|
| Gestión de contactos completa | `feature/contacts-requests-api` | Req 4 |
| Creación y gestión de grupos | `feature/groups-creation-management` | Req 11 |
| Rotación de claves de grupo | `feature/groups-key-rotation` | Seguridad |
| Mensajería grupal integrada | `feature/groups-messaging` | Req 12 |
| Archivar y silenciar conversaciones | `feature/conversations-archive-mute` | Req 18 |
| Tests de RLS | `feature/contacts-groups-tests` | Seguridad |
| Sanitización de inputs | `feature/contacts-groups-sanitization` | Seguridad |
| Documentación ER de BD | `docs/database-schema` | Docs |

**Estimación:** 28-34 horas

**Responsabilidades transversales:**
- Mantiene el esquema de BD en `supabase/migrations/`
- Documenta las políticas RLS
- Tests de aislamiento entre usuarios

### Raúl Ortiz — Mensajería, Interacciones y Búsqueda

**Rama de integración:** `integration/messaging`

**Áreas de código:**
- `src/lib/storage/indexed-db.ts`
- `src/app/api/messages/`
- `src/app/api/reactions/`
- `src/app/api/users/search/`
- `src/components/chat/`
- `src/components/search/`

**Tareas asignadas:**

| Tarea | Rama feature | Requerimiento |
|-------|--------------|---------------|
| Reacciones emoji | `feature/messages-reactions` | Req 9 |
| Responder y reenviar mensajes | `feature/messages-reply-forward` | Req 9, 16 |
| Editar y eliminar mensajes | `feature/messages-edit-delete` | Req 9 |
| Búsqueda local con IndexedDB | `feature/search-local-indexeddb` | Req 21 |
| UI de resultados de búsqueda | `feature/search-ui-results` | Req 21 |
| Búsqueda de contactos en servidor | `feature/search-contacts-server` | Req 21 |
| Autodestrucción de mensajes (TTL) | `feature/messages-autodestruct` | Extra |
| Paginación cursor-based | `feature/messages-pagination` | Req 7 |
| Tests de mensajería | `feature/messaging-tests` | Seguridad |
| Diagramas de secuencia | `docs/messaging-sequence-diagrams` | Docs |

**Estimación:** 26-32 horas

**Responsabilidades transversales:**
- Dueño del flujo de triple cifrado de mensajes
- Asegura que el texto plano NUNCA toque BD, logs, console.log ni red

### Christopher Paucar — Multimedia Cifrada

**Rama de integración:** `integration/multimedia`

**Áreas de código:**
- `src/lib/crypto/file-encrypt.ts`
- `src/app/api/attachments/`
- `src/components/chat/Attachment*`
- `src/components/chat/VoicePlayer.tsx`
- `src/hooks/useAttachments.ts`
- `src/hooks/useVoiceRecorder.ts`

**Tareas asignadas:**

| Tarea | Rama feature | Requerimiento |
|-------|--------------|---------------|
| Subida de imágenes cifradas | `feature/attachments-image-upload` | Req 10 |
| Subida de archivos cifrados | `feature/attachments-file-upload` | Req 10 |
| Thumbnails cifrados | `feature/attachments-thumbnails` | Req 10 |
| Visor fullscreen de imágenes | `feature/attachments-image-viewer` | Req 10 |
| Grabación de mensajes de voz | `feature/voice-messages-record` | Req 15 |
| Reproductor custom de voz | `feature/voice-messages-player` | Req 15 |
| Validación real de MIME types | `feature/multimedia-mime-validation` | Seguridad |
| Logs de auditoría multimedia | `feature/multimedia-audit-logs` | Seguridad |
| Tests de multimedia | `feature/multimedia-tests` | Seguridad |
| Documentación multimedia | `docs/multimedia-encryption` | Docs |

**Estimación:** 26-34 horas

**Responsabilidades transversales:**
- Dueño del cifrado de archivos y audio
- Validación de tipos de archivo con magic numbers (no solo extensión)
- Prevención de subida de ejecutables

### Jade Ramírez — Llamadas, Push y Pentesting

**Rama de integración:** `integration/calls-push`

**Áreas de código:**
- `src/lib/webrtc/`
- `src/components/calls/`
- `src/hooks/useVoiceCall.ts`
- `src/hooks/useVideoCall.ts`
- `src/hooks/useGroupCall.ts`
- `public/sw.js`
- `src/lib/push/`
- `src/app/api/notifications/`
- `src/app/api/calls/`

**Tareas asignadas:**

| Tarea | Rama feature | Requerimiento |
|-------|--------------|---------------|
| Llamadas 1-a-1 completas | `feature/calls-one-to-one-complete` | Req 13, 14 |
| Cifrado E2E con Insertable Streams | `feature/calls-insertable-streams` | Seguridad |
| Llamadas grupales en topología mesh | `feature/calls-group-mesh` | Extensión |
| Detección de speaker activo | `feature/calls-active-speaker-detection` | UX |
| Service Worker para Web Push | `feature/push-service-worker` | Req 19 |
| API de notificaciones push | `feature/push-notifications-api` | Req 19 |
| Análisis con Burp Suite | `feature/security-burp-suite` | Análisis |
| Documentación de llamadas | `docs/calls-webrtc` | Docs |

**Estimación:** 32-42 horas (la carga más grande)

**Responsabilidades transversales:**
- Coordinadora de Burp Suite para pentesting manual
- Testing de llamadas con 2 máquinas en redes distintas
- Documentación de limitaciones de WebRTC por navegador

## Cronograma general

**Semana 1 — Cerrar lo base pendiente**
Cada uno trabaja las primeras 2-3 tareas de su lista.

**Semana 2 — Features avanzadas**
Llamadas grupales, push, búsqueda local, mensajes de voz.

**Semana 3 — Seguridad defensiva y testing**
OWASP ZAP, Burp Suite, tests, documentación.

**Últimos días — Pulido y defensa**
Testing manual E2E, videos de respaldo, ensayo de defensa.

---

> Este README sirve como referencia viva del proyecto. Se actualiza al cierre de cada fase. Última actualización: 2026-04-23
