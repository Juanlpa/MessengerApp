# Burp Suite Community — Reporte de Pentesting Manual

> Herramienta: Burp Suite Community Edition  
> Tipo: Pentesting manual (DAST)  
> Estado: Pendiente — ejecutar en Fase 20

---

## Configuración del Entorno

### Setup del proxy
1. Abrir Burp Suite Community Edition
2. Proxy → Options → listener en `127.0.0.1:8080`
3. Configurar navegador (Firefox recomendado): proxy HTTP en `127.0.0.1:8080`
4. Instalar certificado de Burp en el navegador para HTTPS

### Target
- App local: `http://localhost:3000`
- Scope: `localhost:3000`

---

## Checklist de Pruebas

### Autenticación
- [ ] Replay attack en token JWT — verificar expiración
- [ ] Fuerza bruta en `/api/auth/login` — verificar rate limiting (max 5 intentos/min)
- [ ] Login con password en texto plano — verificar que el cliente siempre envía hash PBKDF2
- [ ] Bypass de middleware JWT — acceder a `/api/*` sin Authorization header
- [ ] Manipulación del payload JWT (cambiar `userId`) — verificar firma HMAC

### Cifrado E2E
- [ ] Interceptar POST `/api/conversations/[id]/messages` — verificar que el body contiene solo ciphertext
- [ ] Modificar ciphertext en tránsito — verificar que el cliente detecta fallo de autenticación
- [ ] Verificar que la shared key nunca viaja en texto plano en ningún request

### Row Level Security (RLS)
- [ ] Autenticado como Usuario A, acceder a mensajes de conversación de Usuario B — debe retornar 403/404
- [ ] Intentar POST a conversación donde el usuario no es participante
- [ ] Manipular `conversationId` en URL para acceder a conversaciones ajenas

### Inputs y XSS
- [ ] Fuzzing en todos los campos de formulario con payloads XSS
- [ ] Inyección en parámetros de query string (`?q=`, `?cursor=`)
- [ ] Content-Type manipulation en uploads (si están implementados)

### Headers de Seguridad
- [ ] Verificar presencia de: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- [ ] Verificar que cookies tienen flags: httpOnly, Secure, SameSite=Strict

---

## Hallazgos

> Completar después de ejecutar el pentesting manual en Fase 20.

| ID | Severidad | Descripción | Endpoint | Estado |
|----|-----------|-------------|----------|--------|
| — | — | Pendiente de ejecutar | — | — |

---

## Resultado Final

- [ ] Pruebas de autenticación ejecutadas
- [ ] Pruebas de cifrado ejecutadas
- [ ] Pruebas de RLS ejecutadas
- [ ] Pruebas de inputs ejecutadas
- [ ] Headers verificados
- [ ] 0 issues críticos sin resolver
