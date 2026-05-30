/**
 * Client-side auth crypto — Flujo criptográfico del cliente
 * 
 * Registro: password → generar salt → PBKDF2 → hash. Generar par DH.
 * Login: email → pedir salt → PBKDF2 → hash.
 */

import { pbkdf2 } from '../crypto/pbkdf2';
import { sha256 } from '../crypto/sha256';
import { toHex, randomBytes } from '../crypto/utils';
import type { DHKeyPair } from '../crypto/dh';

const PBKDF2_ITERATIONS = 100_000;

export interface RegistrationData {
  email: string;
  username: string;
  passwordHash: string;  // hex
  salt: string;          // hex
  dhPublicKey: string;   // hex
}

export interface RegistrationSecrets {
  dhKeyPair: DHKeyPair;
  passwordDerivedKey: Uint8Array; // Para cifrar la DH private key localmente
}

/**
 * Prepara los datos de registro del lado del cliente.
 * 1. Genera salt aleatorio
 * 2. Deriva hash con PBKDF2
 * 3. Genera par de claves DH (en Web Worker para no bloquear main thread)
 * 4. Retorna datos para enviar al servidor + secretos para guardar en memoria
 */
export async function prepareRegistration(
  email: string,
  username: string,
  password: string
): Promise<{ data: RegistrationData; secrets: RegistrationSecrets }> {
  // 1. Generar salt aleatorio (16 bytes = 128 bits)
  const salt = randomBytes(16);
  const saltHex = toHex(salt);

  // 2. PBKDF2 para derivar clave del password
  const passwordDerivedKey = pbkdf2(password, salt, PBKDF2_ITERATIONS, 32);

  // 3. Hash del derived key para enviar al servidor
  // (no enviamos el derived key directamente, enviamos su hash)
  const passwordHash = sha256(passwordDerivedKey);

  // 4. Generar par de claves DH en Web Worker (non-blocking)
  let dhKeyPair: DHKeyPair;
  if (typeof window !== 'undefined') {
    const { generateDHKeyPairAsync } = await import('@/workers/dh-worker-client');
    dhKeyPair = await generateDHKeyPairAsync();
  } else {
    const { generateDHKeyPair } = await import('../crypto/dh');
    dhKeyPair = generateDHKeyPair();
  }

  return {
    data: {
      email,
      username,
      passwordHash: toHex(passwordHash),
      salt: saltHex,
      dhPublicKey: toHex(dhKeyPair.publicKey),
    },
    secrets: {
      dhKeyPair,
      passwordDerivedKey,
    },
  };
}

/**
 * Prepara los datos de login del lado del cliente.
 * 1. Recibe el salt del servidor
 * 2. Recalcula PBKDF2 con el mismo salt
 * 3. Envía el hash al servidor para comparación
 */
export function prepareLogin(
  password: string,
  salt: string
): { passwordHash: string; passwordDerivedKey: Uint8Array } {
  // Importar fromHex
  const { fromHex } = require('../crypto/utils');
  const saltBytes = fromHex(salt);

  // Derivar clave con PBKDF2
  const passwordDerivedKey = pbkdf2(password, saltBytes, PBKDF2_ITERATIONS, 32);

  // Hash para enviar al servidor
  const passwordHash = sha256(passwordDerivedKey);

  return {
    passwordHash: toHex(passwordHash),
    passwordDerivedKey,
  };
}

/**
 * Prepara datos para cambiar contraseña en el cliente.
 * NO envía la contraseña al servidor: deriva hashes localmente.
 *
 * @param currentPassword - contraseña actual (en claro, solo se usa localmente)
 * @param newPassword - nueva contraseña (en claro, solo se usa localmente)
 * @param currentSalt - salt actual del usuario (hex), obtenida del servidor
 *
 * Retorna lo que se enviará al servidor + secrets para actualizar storage local.
 */
export function prepareChangePassword(
  currentPassword: string,
  newPassword: string,
  currentSalt: string
): {
  currentPasswordHash: string;
  newPasswordHash: string;
  newSalt: string;
  newPasswordDerivedKey: Uint8Array;
} {
  const { fromHex } = require('../crypto/utils');

  // Hash de la contraseña actual con la salt actual
  const currentSaltBytes = fromHex(currentSalt);
  const currentDerivedKey = pbkdf2(currentPassword, currentSaltBytes, PBKDF2_ITERATIONS, 32);
  const currentPasswordHash = toHex(sha256(currentDerivedKey));

  // Nueva salt aleatoria
  const newSalt = randomBytes(16);
  const newSaltHex = toHex(newSalt);

  // Hash de la nueva contraseña con la salt nueva
  const newPasswordDerivedKey = pbkdf2(newPassword, newSalt, PBKDF2_ITERATIONS, 32);
  const newPasswordHash = toHex(sha256(newPasswordDerivedKey));

  return {
    currentPasswordHash,
    newPasswordHash,
    newSalt: newSaltHex,
    newPasswordDerivedKey,
  };
}

/**
 * Prepara datos para reset-password (sin contraseña actual; se autoriza con token de email).
 * @param newPassword - nueva contraseña (en claro, solo se usa localmente)
 *
 * Retorna lo que se enviará al servidor junto con el token de reset.
 */
export function prepareResetPassword(newPassword: string): {
  newPasswordHash: string;
  newSalt: string;
  newPasswordDerivedKey: Uint8Array;
} {
  const newSalt = randomBytes(16);
  const newSaltHex = toHex(newSalt);

  const newPasswordDerivedKey = pbkdf2(newPassword, newSalt, PBKDF2_ITERATIONS, 32);
  const newPasswordHash = toHex(sha256(newPasswordDerivedKey));

  return {
    newPasswordHash,
    newSalt: newSaltHex,
    newPasswordDerivedKey,
  };
}
