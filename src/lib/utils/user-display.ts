/**
 * user-display.ts — Formateo del nombre de usuario para la UI.
 *
 * Las cuentas eliminadas se anonimizan con username `deleted_<id8>` (ver la baja
 * de cuenta en /api/users/me y la eliminación por admin). En la interfaz no
 * queremos mostrar ese identificador crudo, sino una etiqueta legible.
 */

const DELETED_PREFIX = 'deleted_';

/** True si el username corresponde a una cuenta eliminada/anonimizada. */
export function isDeletedUser(username?: string | null): boolean {
  return !!username && username.startsWith(DELETED_PREFIX);
}

/**
 * Devuelve el nombre a mostrar: "Cuenta eliminada" para cuentas anonimizadas,
 * o el username real en caso contrario.
 */
export function displayUsername(username?: string | null): string {
  if (!username) return 'Usuario';
  if (isDeletedUser(username)) return 'Cuenta eliminada';
  return username;
}
