/**
 * forward.ts — Marcado de mensajes reenviados.
 *
 * Como los mensajes van cifrados E2E, el servidor no puede saber si un mensaje
 * fue reenviado. En su lugar, el cliente antepone un MARCADOR invisible al texto
 * antes de cifrar. Al descifrar, detecta el marcador, lo retira del texto visible
 * y muestra un indicador "reenvio un mensaje".
 *
 * Compatibilidad: tambien reconoce el marcador antiguo "[Reenviado] ".
 */

// Caracter de control invisible (SOH, U+0001). El usuario nunca lo escribe,
// asi no colisiona con texto real ni se ve si no se retira.
export const FORWARD_MARKER = '';
const LEGACY_MARKER = '[Reenviado] ';

/** Antepone el marcador de reenvio al texto que se va a cifrar. */
export function addForwardMarker(text: string): string {
  return `${FORWARD_MARKER}${text}`;
}

/** Indica si el texto descifrado corresponde a un mensaje reenviado. */
export function isForwarded(text: string | undefined | null): boolean {
  if (!text) return false;
  return text.startsWith(FORWARD_MARKER) || text.startsWith(LEGACY_MARKER);
}

/** Devuelve el texto sin el marcador de reenvio (para mostrar en la burbuja). */
export function stripForwardMarker(text: string | undefined | null): string {
  if (!text) return '';
  if (text.startsWith(FORWARD_MARKER)) return text.slice(FORWARD_MARKER.length);
  if (text.startsWith(LEGACY_MARKER)) return text.slice(LEGACY_MARKER.length);
  return text;
}
