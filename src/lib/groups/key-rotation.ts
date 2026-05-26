/**
 * key-rotation.ts — Gestión de claves simétricas de grupo.
 *
 * Protocolo:
 *   - La clave de grupo es un bloque AES-256 (32 bytes) aleatorio generado en el servidor.
 *   - Se almacena cifrada con ENCRYPTION_MASTER_KEY (Capa 2: cifrado en reposo).
 *   - Se rota en cada cambio de membresía para mantener forward/backward secrecy parcial:
 *       · Salida de miembro → clave nueva (el ex-miembro no puede leer mensajes futuros).
 *       · Entrada de miembro → clave nueva (el nuevo miembro no puede leer mensajes previos).
 *   - Los clientes solicitan la clave activa vía GET /api/groups/[id]/key y la usan
 *     localmente para cifrar/descifrar mensajes (Capa 1 cliente).
 *
 * IMPORTANTE: No usa librerías externas de criptografía.
 * Toda la lógica criptográfica proviene de src/lib/crypto/.
 */

import { encryptAesCbcHmac, decryptAesCbcHmac, type EncryptedData } from '@/lib/crypto/encrypt';
import { randomBytes, toHex, fromHex } from '@/lib/crypto/utils';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ─── Clave maestra del servidor ───────────────────────────────────────────────

function getMasterKey(): Uint8Array {
  const hex = process.env.ENCRYPTION_MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_MASTER_KEY must be 64 hex chars (256 bits)');
  }
  return fromHex(hex);
}

// ─── Primitivas puras (sin I/O) ───────────────────────────────────────────────

/** Genera 32 bytes aleatorios para usar como clave de grupo. */
export function generateGroupKey(): Uint8Array {
  return randomBytes(32);
}

/** Cifra una clave de grupo con la clave maestra del servidor. */
export function encryptGroupKey(rawKey: Uint8Array): EncryptedData {
  return encryptAesCbcHmac(rawKey, getMasterKey());
}

/** Descifra una clave de grupo previamente cifrada con la clave maestra. */
export function decryptGroupKey(data: EncryptedData): Uint8Array {
  return decryptAesCbcHmac(data, getMasterKey());
}

// ─── Operaciones con persistencia ────────────────────────────────────────────

/**
 * Persiste la clave inicial de un grupo recién creado.
 * Debe llamarse una sola vez, justo después de insertar el grupo en la DB.
 * @returns key_version (siempre 1 para la clave inicial)
 */
export async function createInitialGroupKey(groupId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const rawKey = generateGroupKey();
  const { iv, ciphertext, mac } = encryptGroupKey(rawKey);

  const { data, error } = await supabase
    .from('group_keys')
    .insert({
      group_id: groupId,
      key_version: 1,
      encrypted_key: ciphertext,
      iv,
      mac,
      is_active: true,
    })
    .select('key_version')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create initial group key: ${error?.message}`);
  }

  return (data as { key_version: number }).key_version;
}

/**
 * Rota la clave del grupo: desactiva la clave actual e inserta una nueva.
 * Operación atómica desde el punto de vista de la aplicación:
 *   1. Desactivar clave(s) activas del grupo.
 *   2. Calcular versión siguiente (max + 1).
 *   3. Generar y almacenar nueva clave activa.
 *
 * @returns nueva key_version
 */
export async function rotateGroupKey(groupId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  // Paso 1: Desactivar clave activa actual
  await supabase
    .from('group_keys')
    .update({ is_active: false })
    .eq('group_id', groupId)
    .eq('is_active', true);

  // Paso 2: Calcular versión siguiente
  const { data: latest } = await supabase
    .from('group_keys')
    .select('key_version')
    .eq('group_id', groupId)
    .order('key_version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (((latest as { key_version: number } | null)?.key_version) ?? 0) + 1;

  // Paso 3: Generar y almacenar nueva clave
  const rawKey = generateGroupKey();
  const { iv, ciphertext, mac } = encryptGroupKey(rawKey);

  const { data, error } = await supabase
    .from('group_keys')
    .insert({
      group_id: groupId,
      key_version: nextVersion,
      encrypted_key: ciphertext,
      iv,
      mac,
      is_active: true,
    })
    .select('key_version')
    .single();

  if (error || !data) {
    throw new Error(`Failed to rotate group key: ${error?.message}`);
  }

  return (data as { key_version: number }).key_version;
}

/**
 * Obtiene la clave activa del grupo en formato hex (para entregar al cliente).
 * Retorna null si el grupo aún no tiene clave asignada.
 */
export async function getActiveGroupKey(
  groupId: string
): Promise<{ keyHex: string; keyVersion: number } | null> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from('group_keys')
    .select('encrypted_key, iv, mac, key_version')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .single();

  if (!data) return null;

  const row = data as { encrypted_key: string; iv: string; mac: string; key_version: number };
  const rawKey = decryptGroupKey({
    iv: row.iv,
    ciphertext: row.encrypted_key,
    mac: row.mac,
  });

  return { keyHex: toHex(rawKey), keyVersion: row.key_version };
}

// ─── Triggers de rotación ─────────────────────────────────────────────────────

/**
 * Rota la clave cuando un nuevo miembro se une al grupo.
 * Garantía: el nuevo miembro no puede descifrar mensajes anteriores a su ingreso.
 */
export async function rotateOnMemberJoin(groupId: string): Promise<void> {
  await rotateGroupKey(groupId);
}

/**
 * Rota la clave cuando un miembro abandona o es eliminado del grupo.
 * CRÍTICO: impide que el ex-miembro descifre mensajes futuros.
 */
export async function rotateOnMemberLeave(groupId: string): Promise<void> {
  await rotateGroupKey(groupId);
}
