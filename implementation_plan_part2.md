# Plan de Implementación — Parte 2: Fases 11–21

> Continuación de `implementation_plan.md`

---

## FASE 11 — Adjuntos cifrados (imágenes/archivos)

**Objetivo:** Subir imágenes y archivos cifrados E2E a Supabase Storage.

**Prerrequisitos:** Fase 6.2

**Tareas:**
1. Cliente cifra archivo con AES-256-GCM (shared key) antes de subir
2. Subir blob cifrado a Supabase Storage (bucket privado)
3. Guardar metadatos en tabla `attachments` (storage_path, IV, auth_tag, mime_type, filename)
4. Al descargar: obtener blob, descifrar, mostrar/descargar
5. Validación: max 25MB, tipos permitidos (imágenes, PDF, docs)
6. UI: botón clip → selector de archivo, preview de imagen, progress bar
7. Thumbnails: generar thumbnail cifrado por separado para previsualización

**Archivos:**
```
src/app/api/attachments/upload/route.ts
src/app/api/attachments/[id]/route.ts
src/lib/crypto/file-encrypt.ts
src/components/chat/AttachmentButton.tsx
src/components/chat/AttachmentPreview.tsx
src/components/chat/ImageViewer.tsx
src/hooks/useAttachments.ts
```

**Criterios:** Archivo en Storage es ilegible sin clave. Descifrado local muestra archivo original. Archivos >25MB rechazados.

**Complejidad:** Media-Alta

---

## FASE 12 — Mensajes de voz

**Objetivo:** Grabar audio con MediaRecorder, cifrar, enviar, reproducir en el chat.

**Prerrequisitos:** Fase 11 (reutiliza cifrado de archivos)

**Tareas:**
1. Grabar con `MediaRecorder` API (format: webm/opus)
2. Al terminar grabación, cifrar blob con shared key → subir a Storage
3. Enviar mensaje tipo `voice` con referencia al attachment
4. Reproductor custom: waveform visual, play/pause, duración, velocidad 1x/1.5x/2x
5. UI: botón micrófono que cambia a "grabando" con timer

**Archivos:**
```
src/hooks/useVoiceRecorder.ts
src/components/chat/VoiceRecordButton.tsx
src/components/chat/VoicePlayer.tsx
```

**Criterios:** Grabar → enviar → reproducir funciona E2E cifrado. Waveform visible.

**Complejidad:** Media

---

## FASE 13 — Llamadas de voz 1-a-1 (WebRTC)

**Objetivo:** Llamadas de audio P2P con señalización vía Supabase Realtime Broadcast.

**Prerrequisitos:** Fase 7 (Realtime)

**Tareas:**
1. Señalización: intercambio offer/answer/ICE candidates vía Broadcast channel
2. `RTCPeerConnection` con servidores STUN (Google) + TURN (Open Relay)
3. Obtener audio con `getUserMedia({ audio: true })`
4. Estados: llamando → timbrando → conectada → finalizada / rechazada
5. UI: pantalla de llamada (avatar grande, duración, botones mute/colgar)
6. Notificación de llamada entrante (banner o modal)
7. Registro en tabla `calls` + `call_participants`

**Archivos:**
```
src/lib/webrtc/peer-connection.ts
src/lib/webrtc/signaling.ts
src/hooks/useVoiceCall.ts
src/components/calls/CallScreen.tsx
src/components/calls/IncomingCallModal.tsx
src/components/calls/CallControls.tsx
src/app/api/calls/route.ts
```

**Criterios:** Llamada A→B conecta. Audio bidireccional. Mute funciona. Colgar limpia recursos. TURN funciona detrás de NAT restrictivo.

**Complejidad:** Alta

---

## FASE 14 — Videollamadas 1-a-1 + Insertable Streams

### FASE 14.1 — Video básico sin cifrado de media

**Objetivo:** Agregar video al WebRTC existente.

**Prerrequisitos:** Fase 13

**Tareas:**
1. `getUserMedia({ video: true, audio: true })`
2. Video remoto a pantalla completa, local en picture-in-picture (esquina)
3. Controles: toggle cámara, toggle mute, colgar
4. Adaptar señalización para renegociación video on/off

**Archivos:**
```
src/hooks/useVideoCall.ts
src/components/calls/VideoCallScreen.tsx
src/components/calls/PictureInPicture.tsx
```

**Criterios:** Video bidireccional funciona. Toggle cámara on/off. PiP del video local.

**Complejidad:** Media

### FASE 14.2 — Cifrado E2E de media con Insertable Streams

**Objetivo:** Cifrar frames de audio/video con AES-GCM propio usando Insertable Streams (WebRTC Encoded Transform).

**Prerrequisitos:** Fase 14.1

**Tareas:**
1. Usar `RTCRtpSender.createEncodedStreams()` / `RTCRtpReceiver.createEncodedStreams()`
2. En el transform: cifrar cada frame con AES-GCM (shared key de la conversación + counter como IV)
3. En el receiver transform: descifrar cada frame
4. Manejar key rotation si la llamada dura >1 hora
5. Fallback graceful si el navegador no soporta Insertable Streams

**Archivos:**
```
src/lib/webrtc/insertable-streams.ts
src/lib/webrtc/frame-crypto.ts
```

**Criterios:** Con Insertable Streams: el servidor TURN no puede decodificar media (verificar con Wireshark). Sin soporte: llamada funciona sin cifrado E2E de media (solo SRTP estándar).

**Complejidad:** Muy Alta · **Riesgo:** Insertable Streams es relativamente nuevo. Solo Chromium lo soporta bien. Documentar limitación.

---

## FASE 15 — Llamadas grupales mesh

**Objetivo:** Llamadas de audio (hasta 8) y video (hasta 4) en topología mesh.

**Prerrequisitos:** Fase 14

**Tareas:**
1. Crear N-1 `RTCPeerConnection` por participante (mesh completo)
2. Señalización: broadcast offer/answer a todos los participantes
3. UI grid: 2x2 para video, lista para audio-only
4. Borde verde en quien habla (detectar actividad de audio con Web Audio API `AnalyserNode`)
5. Límites: max 4 video, max 8 audio. Alertar si se excede.
6. Insertable Streams para cada peer connection (clave de grupo)

**Archivos:**
```
src/lib/webrtc/mesh-manager.ts
src/hooks/useGroupCall.ts
src/components/calls/GroupCallScreen.tsx
src/components/calls/ParticipantGrid.tsx
src/components/calls/ActiveSpeakerDetector.tsx
```

**Criterios:** 3 participantes en video funciona. Indicador de speaker activo. Cifrado E2E en cada peer.

**Complejidad:** Muy Alta

---

## FASE 16 — Archivar/silenciar conversaciones

**Objetivo:** Archivar y silenciar conversaciones.

**Prerrequisitos:** Fase 7

**Tareas:**
1. `PATCH /api/conversations/[id]/archive` — toggle `is_archived` en participants
2. `PATCH /api/conversations/[id]/mute` — set `is_muted_until` en participants
3. UI: deslizar o menú contextual en lista de chats
4. Sección "Archivados" colapsable al final de la lista
5. Chats silenciados: sin notificación, icono de campana tachada

**Archivos:**
```
src/app/api/conversations/[id]/archive/route.ts
src/app/api/conversations/[id]/mute/route.ts
src/components/chat/ConversationActions.tsx
src/components/layout/ArchivedSection.tsx
```

**Criterios:** Archivar mueve a sección colapsada. Silenciar suprime notificaciones.

**Complejidad:** Baja

---

## FASE 17 — Temas y personalización

**Objetivo:** Modo claro/oscuro, colores de chat personalizables.

**Prerrequisitos:** Fase 4

**Tareas:**
1. CSS variables para tema claro y oscuro
2. Toggle en settings, persistir en `user_preferences`
3. Selector de color de chat (8-10 opciones predefinidas) por conversación
4. Aplicar color a burbujas propias en esa conversación
5. Modo oscuro por defecto en llamadas

**Archivos:**
```
src/app/globals.css                    # (modificar — CSS variables)
src/stores/theme-store.ts
src/components/settings/ThemeSelector.tsx
src/components/settings/ChatColorPicker.tsx
src/app/settings/page.tsx              # (modificar)
```

**Criterios:** Toggle funciona. Persistido en BD. Color de chat personalizable.

**Complejidad:** Baja

---

## FASE 18 — Notificaciones push

**Objetivo:** Web Push con Service Worker nativo.

**Prerrequisitos:** Fase 7

**Tareas:**
1. Generar VAPID keys (con getRandomValues — keys para push protocol)
2. Service Worker: escuchar evento `push`, mostrar notificación nativa
3. Suscripción: `PushManager.subscribe()` → guardar en `push_subscriptions`
4. API Route `POST /api/notifications/send` — enviar push al receptor usando web-push protocol
5. Click en notificación → abrir chat correspondiente
6. No enviar si conversación silenciada

**Archivos:**
```
public/sw.js                           # Service Worker
src/hooks/usePushNotifications.ts
src/app/api/notifications/subscribe/route.ts
src/app/api/notifications/send/route.ts
src/lib/push/web-push.ts
```

**Criterios:** Notificación aparece cuando app está en background. Click abre el chat.

**Complejidad:** Media-Alta

**Decisión a consultar:**
> Web Push requiere enviar un payload cifrado al push service (RFC 8291). Esto implica ECDH P-256 + HKDF + AES-128-GCM según la spec. ¿Implementamos este cifrado también desde cero o usamos una excepción para `web-push` npm (que no es una librería de cripto general sino del protocolo push)? **Recomiendo excepción para `web-push` ya que es protocol-level, no cripto de aplicación.**

---

## FASE 19 — Seguridad: headers, rate limiting, hardening

**Objetivo:** Headers HTTP de seguridad, rate limiting generalizado, logs de auditoría.

**Prerrequisitos:** Todas las fases funcionales anteriores

**Tareas:**
1. Headers en `next.config.js`: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
2. Rate limiting generalizado: mensajes (30/min), API calls (100/min), uploads (10/min)
3. CSRF token en formularios (doble submit cookie pattern)
4. Sanitización de inputs en todas las API routes (Zod en server-side)
5. Logs de auditoría: login, logout, password change, key rotation → `security_logs`
6. Cookie settings: `httpOnly`, `secure`, `sameSite: strict`, `path: /`
7. Revisar todos los `dangerouslySetInnerHTML` — deben ser 0

**Archivos:**
```
next.config.js                         # (modificar)
src/middleware.ts                       # (modificar — agregar rate limiting global)
src/lib/security/csrf.ts
src/lib/security/rate-limiter.ts       # (extender)
src/lib/security/audit-log.ts
src/lib/security/sanitize.ts
```

**Criterios:** Headers verificables con securityheaders.com (A+ o A). Rate limiting funcional. 0 XSS posibles. Logs registrando eventos.

**Complejidad:** Media

---

## FASE 20 — Tests, OWASP ZAP, Burp Suite, npm audit

**Objetivo:** Cobertura de tests ≥60%, 0 vulnerabilidades high/critical en análisis de seguridad.

**Prerrequisitos:** Todas las fases funcionales

**Tareas:**
1. Verificar cobertura de tests unitarios del módulo cripto (Fase 1)
2. Tests unitarios para API routes (auth, messages, contacts, conversations)
3. Tests de integración para flujo E2E de triple cifrado
4. Tests de componentes React con Testing Library
5. Instalar y correr OWASP ZAP Community:
   - Baseline scan contra la app corriendo localmente
   - Documentar hallazgos en `docs/owasp-report.md`
   - Corregir todas las vulnerabilidades high/critical
   - Re-scan para confirmar corrección
6. Correr Burp Suite Community (manual):
   - Configurar proxy en navegador
   - Interceptar y analizar tráfico de la app
   - Probar manipulación de requests, replay attacks, fuzzing
   - Intentar bypasses de RLS y auth
   - Documentar hallazgos en `docs/burpsuite-report.md`
7. Correr `npm audit` → resolver todas las vulnerabilidades high/critical
8. Generar reporte de cobertura con Jest

**Archivos:**
```
jest.config.ts
src/**/__tests__/                      # todos los test files
docs/owasp-report.md                   # resultados OWASP ZAP baseline scan
docs/burpsuite-report.md               # resultados Burp Suite (manual)
docs/security-report.md               # resumen ejecutivo de seguridad
docs/test-coverage.md
```

**Criterios:** `npm test` pasa. Cobertura ≥60%. OWASP ZAP: 0 vulnerabilidades high/critical. Burp Suite: sin issues críticos documentados. npm audit: 0 high/critical.

**Complejidad:** Alta

---

## FASE 21 — Documentación y defensa

**Objetivo:** Documentación técnica completa para la defensa del proyecto.

**Prerrequisitos:** Todo lo anterior

**Tareas:**
1. `README.md` completo (setup, arquitectura, stack, seguridad)
2. Diagrama de arquitectura (Mermaid): flujo de triple cifrado
3. Diagrama de secuencia: registro, login, envío de mensaje, llamada
4. Diagrama ER de la base de datos
5. Documento de seguridad: amenazas mitigadas, decisiones de diseño, limitaciones
6. Guión de defensa: qué mostrar en vivo, en qué orden, qué preguntas anticipar
7. Manual de usuario básico
8. Actualizar `PROGRESS.md` final

**Archivos:**
```
README.md
docs/architecture.md
docs/security-design.md
docs/database-diagram.md
docs/sequence-diagrams.md
docs/defense-script.md
docs/user-manual.md
PROGRESS.md                           # (actualización final)
```

**Criterios:** Documentación completa, diagramas renderizables, guión listo.

**Complejidad:** Media

---

## Resumen de complejidad y tiempos estimados

| Fase | Nombre | Complejidad | Est. horas |
|------|--------|-------------|------------|
| 0 | Setup | Baja | 1-2 |
| 1.1 | SHA-256 + HMAC | Alta | 4-6 |
| 1.2 | PBKDF2 | Media | 2-3 |
| 1.3 | AES-256-GCM | Muy Alta | 8-12 |
| 1.4 | DH + HKDF | Alta | 4-6 |
| 2 | BD + RLS | Media-Alta | 3-4 |
| 3.1 | Auth backend | Alta | 4-6 |
| 3.2 | Auth UI | Alta | 4-6 |
| 4 | Layout | Media | 3-4 |
| 5 | Contactos | Media | 3-4 |
| 6.1 | DH key exchange | Alta | 3-4 |
| 6.2 | Triple cifrado msgs | Muy Alta | 6-8 |
| 7 | Realtime | Media-Alta | 4-5 |
| 8 | Historial + búsqueda | Media | 3-4 |
| 9 | Interacciones | Media | 3-4 |
| 10.1 | Gestión de grupos | Alta | 4-5 |
| 10.2 | Mensajería grupal | Media | 2-3 |
| 11 | Adjuntos cifrados | Media-Alta | 4-5 |
| 12 | Mensajes de voz | Media | 3-4 |
| 13 | Llamadas voz | Alta | 5-6 |
| 14.1 | Video básico | Media | 3-4 |
| 14.2 | Insertable Streams | Muy Alta | 5-7 |
| 15 | Llamadas grupales | Muy Alta | 6-8 |
| 16 | Archivar/silenciar | Baja | 1-2 |
| 17 | Temas | Baja | 2-3 |
| 18 | Push notifications | Media-Alta | 4-5 |
| 19 | Hardening seguridad | Media | 3-4 |
| 20 | Tests + auditoría | Alta | 6-8 |
| 21 | Documentación | Media | 4-6 |
| **Total** | | | **~110-150h** |

---

## Decisiones pendientes (necesito tu input)

1. **DH clásico vs ECDH:** ¿DH 2048-bit (más fácil implementar) o ECDH Curve25519 (más moderno, más complejo)?
2. **Búsqueda full-text:** ¿Solo local (IndexedDB) para mantener E2E puro, o indexar metadatos en servidor?
3. **Web Push cifrado:** ¿Excepción para librería `web-push` (es protocolo, no cripto de app) o implementar RFC 8291 desde cero?
4. **Recuperación de password:** Si el usuario olvida su password, pierde su clave privada DH cifrada. ¿Aceptar esta limitación (como Signal) o implementar recovery key?
