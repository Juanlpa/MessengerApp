/**
 * ice-servers.ts — Configuración compartida de servidores ICE (STUN/TURN).
 *
 * STUN basta cuando ambos peers están en la misma red o detrás de NAT simple.
 * TURN es OBLIGATORIO cuando los peers están en redes distintas con NAT
 * restrictiva (p.ej. PC en Wi-Fi + celular en datos móviles): sin un TURN que
 * funcione, ICE se queda en "checking" y la llamada nunca conecta ("Reconectando").
 *
 * Fuente de las credenciales TURN (en orden de preferencia):
 *   1. Credenciales dinámicas de Metered, obtenidas vía /api/turn-credentials
 *      (la SECRET KEY vive solo en el servidor). Cargar con loadTurnCredentials()
 *      al iniciar la app.
 *   2. TURN estático por env NEXT_PUBLIC_TURN_URL/USERNAME/CREDENTIAL.
 *   3. TURN público openrelay (inestable) como último recurso.
 */

// Caché en memoria de las credenciales TURN dinámicas (Metered).
let cachedTurnServers: RTCIceServer[] | null = null;

const STUN_ONLY: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Carga credenciales TURN dinámicas desde el backend (Metered) y las cachea.
 * Llamar una vez al iniciar la app (p.ej. en el layout de /chat). Idempotente
 * y silenciosa: si falla, se mantiene el fallback estático.
 */
let loadPromise: Promise<void> | null = null;

export async function loadTurnCredentials(): Promise<void> {
  try {
    const res = await fetch('/api/turn-credentials', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      cachedTurnServers = data.iceServers as RTCIceServer[];
    }
  } catch {
    // Mantener fallback
  }
}

/**
 * Garantiza que las credenciales TURN estén cargadas antes de crear una
 * RTCPeerConnection. Si ya están en caché, retorna al instante; si no, espera
 * a la carga (deduplicada). Llamar justo antes de iniciar/aceptar una llamada.
 */
export async function ensureTurnCredentials(): Promise<void> {
  if (cachedTurnServers && cachedTurnServers.length > 0) return;
  if (!loadPromise) loadPromise = loadTurnCredentials().finally(() => { loadPromise = null; });
  await loadPromise;
}

export function buildIceServers(): RTCIceServer[] {
  // 1. Credenciales dinámicas de Metered (ya incluyen STUN + TURN)
  if (cachedTurnServers && cachedTurnServers.length > 0) {
    return cachedTurnServers;
  }

  // 2. TURN estático por variables de entorno
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL?.trim();
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME?.trim();
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL?.trim();
  if (turnUrl && turnUser && turnCred) {
    return [
      ...STUN_ONLY,
      {
        urls: turnUrl.split(',').map((u) => u.trim()).filter(Boolean),
        username: turnUser,
        credential: turnCred,
      },
    ];
  }

  // 3. Fallback: SOLO STUN. Funciona en la misma red / NAT abierta (conexión
  //    directa). Para que funcione entre redes distintas hay que configurar TURN
  //    (Cloudflare vía /api/turn-credentials, o NEXT_PUBLIC_TURN_* estático).
  return [...STUN_ONLY];
}
