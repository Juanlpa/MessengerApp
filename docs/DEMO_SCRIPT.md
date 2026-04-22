# Guion de Demostración: Prototipo Vertical Mínimo E2E

Este documento sirve como guía paso a paso para la presentación del prototipo de Messenger con arquitectura de triple cifrado.

## Objetivos Demostrados
1. **Registro Seguro:** Derivación de claves en cliente (PBKDF2) y hash de contraseñas.
2. **Intercambio de Claves (DH):** Generación de claves Diffie-Hellman y derivación de *shared secret*.
3. **Cifrado E2E + At-Rest:** Cifrado doble de mensajes (AES-256-GCM) y almacenamiento seguro en Supabase.
4. **Descifrado Transparente:** El receptor recupera el mensaje original sin exponer claves al servidor.

---

## Preparación antes de la Demo

1. Levantar el proyecto localmente (`npm run dev`).
2. Abrir **dos ventanas de navegador** (una normal y una en modo incógnito) para simular dos usuarios distintos (Alice y Bob).
3. Abrir la consola de desarrollo (F12) en ambas ventanas, en la pestaña "Network" (Red) para mostrar los payloads cifrados.
4. Abrir el panel de control de Supabase (Tabla `messages` y tabla `users`) para demostrar el almacenamiento *at-rest*.

---

## Paso 1: Registro de Usuarios y Derivación de Claves

**Acción:**
1. En la ventana 1, registrar a **Alice** (ej. `alice@example.com`).
2. En la ventana 2, registrar a **Bob** (ej. `bob@example.com`).

**Puntos a explicar a la audiencia:**
- *“Durante el registro, el navegador del usuario genera un `salt` y aplica **PBKDF2** para crear una clave derivada de la contraseña. La contraseña en texto plano **nunca** se envía al servidor.”*
- *“Simultáneamente, se genera un par de claves **Diffie-Hellman** para este usuario. La clave pública se comparte, pero la privada se cifra localmente antes de guardarse en la base de datos.”*

**Demostración técnica:**
- Mostrar en la pestaña Network la petición `POST /api/auth/register`. Destacar que el campo password contiene un hash/clave cifrada, no texto plano.

---

## Paso 2: Creación de Conversación e Intercambio de Claves

**Acción:**
1. Como Alice, iniciar una nueva conversación buscando a Bob.

**Puntos a explicar a la audiencia:**
- *“Al iniciar el chat, Alice descarga la clave pública de Bob. Utilizando su propia clave privada, el sistema ejecuta el algoritmo **Diffie-Hellman** para calcular un secreto compartido.”*
- *“Este secreto pasa por **HKDF** para derivar la clave simétrica maestra (AES-256) exclusiva para esta conversación. Todo esto ocurre en la memoria del navegador de Alice.”*

---

## Paso 3: Envío de Mensaje con Triple Cifrado

**Acción:**
1. Como Alice, escribir y enviar un mensaje a Bob: `"Hola Bob, este es un mensaje ultrasecreto."`

**Puntos a explicar a la audiencia:**
- *“El mensaje se cifra inmediatamente en el navegador de Alice usando **AES-256-GCM** y la clave compartida (Cifrado Capa 1: E2E).”*
- *“Al llegar al servidor, se le aplica una segunda capa de cifrado usando la clave maestra del servidor antes de insertarlo en la base de datos (Cifrado Capa 2: At-Rest).”*

**Demostración técnica:**
- **Network Tab:** Mostrar la petición `POST` del mensaje. El payload es un string incomprensible (ciphertext en Base64 o Hex).
- **Supabase Dashboard:** Mostrar la tabla `messages`. El campo de contenido es solo ruido criptográfico. Ni siquiera un administrador de BD puede leer `"Hola Bob"`.

---

## Paso 4: Recepción y Descifrado

**Acción:**
1. En la ventana 2 (Bob), refrescar la página o entrar a la conversación con Alice. (Recordar limitación del prototipo: no hay *realtime*).

**Puntos a explicar a la audiencia:**
- *“Bob descarga su clave privada (descifrándola con su clave derivada de contraseña). Con ella y la clave pública de Alice, computa **exactamente el mismo secreto compartido** (magia de Diffie-Hellman).”*
- *“El servidor entrega el mensaje a Bob quitando la capa 2 (At-Rest). Bob recibe el ciphertext E2E.”*
- *“El navegador de Bob utiliza la clave compartida para descifrar el mensaje y mostrar el texto plano en pantalla.”*

**Demostración técnica:**
- Mostrar cómo Bob ve perfectamente `"Hola Bob, este es un mensaje ultrasecreto."` a pesar de que en la BD y en la red todo viajó cifrado.

---

## Conclusión de la Demo

**Puntos clave a resumir:**
- **Zero-Knowledge:** El servidor nunca conoció el texto original ni las claves para descifrarlo.
- **Defensa en profundidad:** Incluso si un atacante compromete la base de datos (Supabase), solo obtiene datos inútiles.
- **Nativo:** Se implementó usando aritmética pura en Typescript, sin librerías externas que rompan las reglas académicas impuestas.

> *Fin del prototipo. El desarrollo continuará en las próximas fases para habilitar Tiempo Real, Almacenamiento Local (IndexedDB) y Mensajería Grupal.*
