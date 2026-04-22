/**
 * Helper: extraer usuario del JWT en API routes
 */

import { verifyJWT, type JWTPayload } from './jwt';

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
