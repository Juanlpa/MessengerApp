/**
 * Helper: extraer usuario del JWT en API routes.
 *
 * - getUserFromRequest: verificación rápida (NO consulta DB). Útil cuando la
 *   ruta solo necesita el userId y no hay riesgo crítico (lectura barata).
 * - getUserFromRequestStrict: verificación + consulta a la blacklist de tokens
 *   revocados. Úsalo en endpoints sensibles (cambio de password, revoke
 *   sessions, eliminación de datos, etc).
 */

import { verifyJWT, type JWTPayload } from './jwt';
import { isRevoked } from './jwtBlacklist';

export function getUserFromRequest(request: Request): JWTPayload | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    return verifyJWT(authHeader.slice(7));
  } catch {
    return null;
  }
}

/**
 * Extrae el token raw del header (sin verificar firma).
 * Útil cuando necesitas el token string para pasarlo a revokeJWT().
 */
export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/**
 * Verificación estricta: firma + expiración + blacklist de revocados.
 * Devuelve null si el token es inválido O fue revocado.
 *
 * Úsalo en endpoints que mutan estado sensible.
 */
export async function getUserFromRequestStrict(
  request: Request
): Promise<JWTPayload | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  let payload: JWTPayload;
  try {
    payload = verifyJWT(token);
  } catch {
    return null;
  }

  // Consulta a la blacklist — si el token fue revocado, rechazar
  if (await isRevoked(token)) return null;

  return payload;
}
