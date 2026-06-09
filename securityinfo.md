# Security Architecture — Messenger Seguro

## 1. Message Encryption (E2E)

### Key Exchange
- **Algorithm:** ECDH P-256 (`crypto.subtle.generateKey`)
- **Flow:** Each user generates an ECDH key pair on first login. The public key is stored in `users.public_key`. When a conversation is opened, both parties derive a shared secret via `crypto.subtle.deriveBits(ECDH, theirPublicKey)`.
- **Shared key:** The 32-byte ECDH shared secret is stored encrypted in `conversation_participants.encrypted_shared_key`, using the user's own storage key (PBKDF2-derived from `user.id + 'storage-salt'`).
- **Files:** `src/lib/crypto/ecdh.ts`, `src/lib/crypto/storage-crypto.ts`

### Message Encryption
- **Algorithm:** AES-GCM 256-bit with a random 12-byte IV per message
- **Format stored in DB:** `{ ciphertext: base64, iv: base64, mac: base64 }` in `messages.e2e_payload`
- **Files:** `src/lib/crypto/message-crypto.ts`

### Key Derivation (storage)
- **Algorithm:** PBKDF2 (SHA-256, 1 000 iterations) — derives a 32-byte key from `userId + 'storage-salt'`
- Used to wrap/unwrap the ECDH shared key stored locally in `sessionStorage`
- `page.tsx` caches the derived storage key in a `useRef` so PBKDF2 runs at most once per session

---

## 2. Media Encryption — WebRTC Calls

### DTLS-SRTP (baseline, all browsers)
- WebRTC mandates DTLS for key exchange and SRTP for media. Provides transport encryption but NOT end-to-end: media is decrypted at TURN relays.
- **TURN server used:** `openrelay.metered.ca` (fallback for NAT traversal)

### Insertable Streams / Encoded Transform (implementado, actualmente DESACTIVADO)
- **Spec:** [W3C WebRTC Encoded Transform](https://www.w3.org/TR/webrtc-encoded-transform/)
- **Qué hace:** cifra cada frame de medios con **AES-GCM 256** por encima de SRTP, usando una clave derivada por **HKDF** con `hourIndex = floor(now / 3 600 000)` como salt (ambos peers derivan la misma clave cada hora sin comunicación extra). El `KeyContainer` permite rotar la clave sin recrear los TransformStreams.
- **Estado actual — DESACTIVADO en todas las llamadas** (`VIDEO_FRAME_ENCRYPTION = false` en 1-a-1, `GROUP_CALL_FRAME_ENCRYPTION = false` en grupos; el audio nunca lo usó). **Motivo:** el cifrado de frames sobre SRTP es **redundante** (SRTP ya cifra el transporte de extremo a extremo entre peers, el TURN solo reenvía paquetes opacos) y provocaba **congelamiento intermitente del decodificador** (si un frame no se descifra a tiempo, el codec pierde sincronía y no se recupera sin keyframe). Se priorizó la **fiabilidad del medio**. El código se conserva y puede reactivarse con el flag.
- **Protección efectiva del medio:** **DTLS-SRTP**, obligatorio en WebRTC. En topología P2P/mesh el SRTP va de extremo a extremo entre los participantes.
- **UI indicator:** `CallModal` muestra **"SRTP Estándar"** (cifrado de transporte). Mostraría "E2E Completo" solo si se reactivara el cifrado de frames.
- **Screen sharing (1-a-1):** se sustituye el track de cámara por el de pantalla en el mismo `RTCRtpSender` vía `replaceTrack()` → mismo nivel de cifrado (SRTP) sin renegociar SDP.
- **Files:** `src/lib/webrtc/frame-crypto.ts`, `src/lib/webrtc/insertable-streams.ts` (lógica disponible, desactivada por flag)

---

## 3. Transport Security

- All API calls use HTTPS (enforced by Vercel/hosting layer)
- Supabase Realtime Broadcast channels use WSS (TLS 1.3)
- JWT tokens are short-lived and verified server-side in every API route via `src/lib/auth/get-user.ts`

---

## 4. Push Notifications

- **Standard:** Web Push Protocol (RFC 8291 / RFC 8292)
- **Key type:** VAPID (Voluntary Application Server Identification) — ECDH P-256 + HKDF + AES-GCM content encryption
- **Library:** `web-push` npm package handles VAPID signing and payload encryption
- Push payloads are encrypted by the browser vendor's push service; the server never sees plaintext notification content
- Subscriptions stored in `push_subscriptions` table; expired subscriptions are pruned on delivery failure
- Service Worker (`public/sw.js`) handles `push` and `notificationclick` events; JSON parse errors are caught to prevent silent handler failure
- **Files:** `src/lib/push/web-push.ts`, `public/sw.js`, `src/app/api/notifications/`

---

## 5. Call History & Participant Tracking

- **Table `calls`:** Records call lifecycle (initiated → connected → ended/missed/rejected)
- **Table `call_participants`:** One row per user per call; `joined_at` / `left_at` timestamps; used for authorization checks (receiver can update call status)
- Status values in DB: `initiated`, `connected`, `missed`, `rejected`, `ended`
- **Files:** `supabase/migrations/008_calls_table.sql`, `supabase/migrations/010_call_participants.sql`, `src/app/api/calls/route.ts`

---

## 6. WebRTC Reliability — ICE Candidate Handling

- ICE candidates that arrive before `setRemoteDescription` completes are queued in `pendingCandidatesRef` and flushed immediately after the remote description is set
- This prevents silent candidate drops on fast networks where ICE candidates overtake the offer/answer exchange
- Applies to both the receiver (offer path) and the offerer (answer path)

---

## 7. Client-Side Storage & the "Layer 3" Local Cache Decision

The original design contemplated a **three-layer encryption model**:
1. **Layer 1 — E2E:** AES-GCM with the per-conversation shared key (client-side).
2. **Layer 2 — At-rest:** A second AES-GCM layer applied server-side with `ENCRYPTION_MASTER_KEY` before storing in the database.
3. **Layer 3 — Local cache:** An encrypted IndexedDB cache of decrypted messages on the client.

**Decision: Layer 3 is intentionally NOT implemented.** Messages are not persisted in plaintext or ciphertext on the client; they are fetched from the server and decrypted in memory on demand.

**Rationale (security-first):**
- **Smaller attack surface.** Persisting decrypted (or locally re-encrypted) message history on the device creates a new at-rest target. On a shared/compromised machine, an encrypted IndexedDB store is only as strong as the wrapping key — and that key (`storageKey`) is **PBKDF2 over the public `userId`**, i.e. derivable by anyone who knows the user id. It would provide obfuscation, not real confidentiality.
- **No confidentiality benefit.** Because the local wrapping key is derivable from public data, a Layer-3 cache would not raise the security bar; it would only add complexity (cache invalidation, key rotation, eviction) and risk.
- **Layers 1 and 2 are unaffected.** Full E2E (Layer 1) and server at-rest (Layer 2) remain in place. What *is* persisted client-side is minimal and non-sensitive: the JWT and the ECDH **shared key wrapped with `storageKey`** in `sessionStorage` (cleared when the tab closes), plus UI preferences (per-chat colors/background) in `localStorage`.

**Trade-off accepted:** no offline message history; every chat open re-fetches from the server. For a security-focused messenger this is the desirable default (data minimization on the endpoint).

**Files:** `src/lib/crypto/storage-crypto.ts` (shared-key wrapping), `src/hooks/useAuth.ts` (session storage).

---

## 8. Threat Model & Known Limitations

| Threat | Mitigation | Gap |
|--------|-----------|-----|
| Message interception in transit | AES-GCM E2E + TLS | None for in-transit |
| Compromise of Supabase DB | Messages stored encrypted; shared keys encrypted with user-derived key | If attacker has user session token AND DB access, they can decrypt |
| WebRTC media interception at TURN | DTLS-SRTP (transport, end-to-end between peers; TURN relays opaque SRTP packets) | Frame-level E2E (Insertable Streams) implemented but disabled for reliability |
| Push notification content leak | Web Push Protocol encrypts payload | Browser vendor's push infrastructure is trusted |
| Replay attack on messages | AES-GCM authentication tag + random IV | No explicit sequence number check |
| Key rotation gap | HKDF hourly rotation | Both peers must rotate simultaneously; clock skew >1h would break audio/video |
| ICE candidate race | Pending queue flushed after setRemoteDescription | None — fully mitigated |
| Rejected Promise in key cache | Cache cleared on HKDF failure, next call retries | None — fully mitigated |
| Forward secrecy | Not implemented — shared key is static per conversation | Would require Double Ratchet (Signal Protocol) |
| Local message exfiltration from device | No plaintext message cache persisted on the client (Layer 3 intentionally omitted — see §7) | None — endpoint stores no message history |
| TURN server trust | Cloudflare TURN; credenciales temporales generadas server-side (`/api/turn-credentials`), el API token nunca llega al navegador. TURN solo reenvía SRTP cifrado | Se confía en la infraestructura de Cloudflare para el relay (no puede leer el medio: va cifrado por SRTP) |

---

## 9. HTTP Security Headers & CSP (hallazgos OWASP ZAP)

Configurados en `next.config.ts`:
`Content-Security-Policy`, `Strict-Transport-Security` (HSTS), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin`, `X-XSS-Protection`.

### CSP endurecido en producción
La CSP es **consciente del entorno** (`isProd`): en dev se mantiene flexible (HMR/túneles
necesitan `unsafe-eval` y orígenes amplios); en **producción se endurece**:
- **`script-src`:** se elimina `'unsafe-eval'` (el build de Next no lo requiere).
- **`img-src`:** `'self' data: blob:` — se quita el comodín `https:` (las imágenes son blobs propios).
- **`connect-src`:** `'self' <supabase-https> <supabase-wss>` — solo el origen de Supabase
  (REST + Realtime), en vez de los comodines `https:`/`wss:`. El TURN de WebRTC no usa
  fetch/WebSocket, así que no necesita entrada en `connect-src`.

### Hallazgos aceptados (con justificación)
- **`script-src`/`style-src 'unsafe-inline'`:** lo requiere **Next.js/React** (scripts de
  hidratación y estilos inyectados por Tailwind/styled-jsx). El "arreglo" correcto es una CSP
  basada en **nonces + `strict-dynamic`**, que en App Router es compleja y frágil; se acepta
  como limitación conocida del framework. Riesgo XSS mitigado además por: no usar
  `dangerouslySetInnerHTML`, escape por defecto de React, y sanitización de entradas.
- **`Access-Control-Allow-Origin: *` en `/_next/static/*`:** lo añade **Vercel** a los assets
  estáticos públicos (JS/CSS inmutables, sin credenciales ni datos sensibles). Es el
  comportamiento estándar de la CDN y no expone APIs autenticadas (esas van por `/api/*` con
  JWT y mismo origen). Riesgo bajo, aceptado.

---

## 10. Quick Reference

| What | Algorithm | Where |
|------|-----------|-------|
| Message encryption | AES-GCM 256 | `message-crypto.ts` |
| Key exchange | ECDH P-256 | `ecdh.ts` |
| Storage key | PBKDF2 SHA-256 1k iter | `storage-crypto.ts` |
| Media frame encryption | AES-GCM 256 + HKDF hourly | `frame-crypto.ts` |
| Insertable Streams pipe | W3C Encoded Transform | `insertable-streams.ts` |
| Push encryption | VAPID / Web Push | `web-push.ts` |
| Auth tokens | JWT (custom) | `get-user.ts` |
