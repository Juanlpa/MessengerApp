/**
 * JWT propio — Firmado con HMAC-SHA256 manual
 * 
 * Formato: header.payload.signature (base64url cada parte)
 * Header: { "alg": "HS256", "typ": "JWT" }
 * Signature: HMAC-SHA256(secret, header.payload)
 */

import { hmacSHA256 } from '../crypto/hmac';
import { toBase64Url, fromBase64Url, stringToBytes, constantTimeEqual } from '../crypto/utils';

export interface JWTPayload {
  sub: string;        // user ID
  email: string;
  username: string;
  iat: number;        // issued at (unix timestamp)
  exp: number;        // expiration (unix timestamp)
}

const HEADER = { alg: 'HS256', typ: 'JWT' };

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return stringToBytes(secret);
}

/**
 * Firma un JWT con HMAC-SHA256 propio.
 * @param payload - Datos del token
 * @returns Token JWT (string)
 */
export function signJWT(payload: JWTPayload): string {
  const secret = getSecret();

  // Codificar header y payload en base64url
  const headerB64 = toBase64Url(stringToBytes(JSON.stringify(HEADER)));
  const payloadB64 = toBase64Url(stringToBytes(JSON.stringify(payload)));

  // Firmar: HMAC-SHA256(secret, header.payload)
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = hmacSHA256(secret, stringToBytes(signingInput));
  const signatureB64 = toBase64Url(signature);

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Verifica y decodifica un JWT.
 * @param token - Token JWT (string)
 * @returns Payload decodificado
 * @throws Error si token inválido, firma incorrecta, o expirado
 */
export function verifyJWT(token: string): JWTPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const secret = getSecret();

  // Verificar firma
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSignature = hmacSHA256(secret, stringToBytes(signingInput));
  const actualSignature = fromBase64Url(signatureB64);

  if (!constantTimeEqual(expectedSignature, actualSignature)) {
    throw new Error('Invalid JWT signature');
  }

  // Decodificar payload
  const payloadBytes = fromBase64Url(payloadB64);
  const payloadStr = new TextDecoder().decode(payloadBytes);
  const payload: JWTPayload = JSON.parse(payloadStr);

  // Verificar expiración
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('JWT expired');
  }

  return payload;
}

/**
 * Crea un payload JWT para un usuario.
 * Token válido por 24 horas.
 */
export function createJWTPayload(user: { id: string; email: string; username: string }): JWTPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: user.id,
    email: user.email,
    username: user.username,
    iat: now,
    exp: now + 24 * 60 * 60, // 24 horas
  };
}
