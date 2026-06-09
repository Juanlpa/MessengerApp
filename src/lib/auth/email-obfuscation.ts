/**
 * email-obfuscation.ts — Ofuscación del email en las peticiones de auth.
 *
 * ⚠️ Esto NO es seguridad real: la clave está en el cliente (extraíble del JS).
 * Solo evita que el email se vea en claro a simple vista en herramientas como
 * Burp/ZAP. La protección real del transporte es TLS (HTTPS). El email es el
 * identificador de login, no un secreto como la contraseña (esa nunca viaja).
 *
 * Usa las primitivas propias (AES-CBC + HMAC). Retrocompatible: si el valor no
 * está ofuscado (texto plano), `deobfuscateEmail` lo devuelve tal cual.
 */

import { encryptAesCbcHmac, decryptAesCbcHmac } from '@/lib/crypto/encrypt';
import { fromHex, stringToBytes, bytesToString } from '@/lib/crypto/utils';

// Clave de ofuscación fija (32 bytes). No es secreta: es solo para ofuscar.
const OBF_KEY = fromHex('a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90');
const PREFIX = 'obf.';

/** Ofusca un email → "obf.<iv>.<ciphertext>.<mac>" (hex). */
export function obfuscateEmail(email: string): string {
  try {
    const enc = encryptAesCbcHmac(stringToBytes(email), OBF_KEY);
    return `${PREFIX}${enc.iv}.${enc.ciphertext}.${enc.mac}`;
  } catch {
    return email; // fallback: enviar en claro si algo falla
  }
}

/** Revierte la ofuscación. Si no está ofuscado, devuelve el valor tal cual. */
export function deobfuscateEmail(value: string): string {
  if (!value || !value.startsWith(PREFIX)) return value; // texto plano (compat)
  try {
    const [iv, ciphertext, mac] = value.slice(PREFIX.length).split('.');
    if (!iv || !ciphertext || !mac) return value;
    return bytesToString(decryptAesCbcHmac({ iv, ciphertext, mac }, OBF_KEY));
  } catch {
    return value;
  }
}
