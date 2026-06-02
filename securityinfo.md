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

### Insertable Streams / Encoded Transform (Chrome/Edge only)
- **Spec:** [W3C WebRTC Encoded Transform](https://www.w3.org/TR/webrtc-encoded-transform/)
- **Algorithm:** AES-GCM 256-bit applied to every encoded **video** frame
- **Scope — video only:** Frame encryption is applied **only to video tracks**. Audio relies on DTLS-SRTP (transport encryption, always on). Reason: layering AES-GCM over SRTP for audio is redundant, and a key-derivation asymmetry between caller and callee left audio undecodable (silent) on voice calls. Video keeps full E2E frame encryption in 1-to-1 calls. (Group calls disable frame encryption entirely — see `GROUP_CALL_FRAME_ENCRYPTION`.)
- **Key derivation:** HKDF (SHA-256) using the ECDH shared key as input keying material and `hourIndex = floor(now / 3 600 000)` as salt — both peers independently derive the same key every hour without additional communication
- **Frame format (video):** `[IV 12 bytes] [AES-GCM ciphertext]`
- **Key rotation:** `setInterval(1h)` updates all active `KeyContainer` objects in-place, so running TransformStreams pick up the new key on the next frame without being recreated
- **Hourly key cache:** Both `useWebRTC` and `MeshManager` cache the derived `CryptoKey` keyed by `hourIndex`; HKDF derivation runs at most once per hour per call session. Cache is invalidated on rejection to allow retry.
- **UI indicator:** `CallModal` shows "E2E Completo" (green shield) on video calls when Insertable Streams is active, and "SRTP Estándar" (yellow) on voice-only calls or when falling back to DTLS-SRTP — honestly reflecting that voice-only media is protected by SRTP, not frame encryption
- **Screen sharing (1-to-1):** Sharing replaces the camera track on the same `RTCRtpSender` via `replaceTrack()`, so the video frame-encryption transform stays attached — the shared screen is E2E-encrypted exactly like the camera, with no SDP renegotiation
- **Files:** `src/lib/webrtc/frame-crypto.ts`, `src/lib/webrtc/insertable-streams.ts`

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
| WebRTC media interception at TURN | Insertable Streams E2E (Chrome) | Firefox/Safari: only DTLS-SRTP; media readable at TURN relay |
| Push notification content leak | Web Push Protocol encrypts payload | Browser vendor's push infrastructure is trusted |
| Replay attack on messages | AES-GCM authentication tag + random IV | No explicit sequence number check |
| Key rotation gap | HKDF hourly rotation | Both peers must rotate simultaneously; clock skew >1h would break audio/video |
| ICE candidate race | Pending queue flushed after setRemoteDescription | None — fully mitigated |
| Rejected Promise in key cache | Cache cleared on HKDF failure, next call retries | None — fully mitigated |
| Forward secrecy | Not implemented — shared key is static per conversation | Would require Double Ratchet (Signal Protocol) |
| Local message exfiltration from device | No plaintext message cache persisted on the client (Layer 3 intentionally omitted — see §7) | None — endpoint stores no message history |
| Voice-call media interception at TURN | DTLS-SRTP (transport) | Audio is not frame-encrypted; readable at a malicious TURN relay. Video uses Insertable Streams E2E (Chrome) |
| TURN server trust | OpenRelay (public) used for NAT traversal | For production: use own Coturn with ephemeral HMAC-SHA1 credentials |

---

## 9. Quick Reference

| What | Algorithm | Where |
|------|-----------|-------|
| Message encryption | AES-GCM 256 | `message-crypto.ts` |
| Key exchange | ECDH P-256 | `ecdh.ts` |
| Storage key | PBKDF2 SHA-256 1k iter | `storage-crypto.ts` |
| Media frame encryption | AES-GCM 256 + HKDF hourly | `frame-crypto.ts` |
| Insertable Streams pipe | W3C Encoded Transform | `insertable-streams.ts` |
| Push encryption | VAPID / Web Push | `web-push.ts` |
| Auth tokens | JWT (custom) | `get-user.ts` |
