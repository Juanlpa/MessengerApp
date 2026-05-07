/**
 * sanitize.ts — Limpieza de inputs de usuario para prevenir XSS e inyección.
 *
 * NOTA: Coordinar con Joel (dominio: seguridad) para lógica avanzada
 * (allowlists, entidades HTML, CSP).
 */

/** Elimina etiquetas HTML y el contenido de tags peligrosos (script, style). */
export function stripHtml(input: string): string {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

/**
 * Devuelve true si el string contiene caracteres HTML peligrosos residuales.
 * Usar como refine() en schemas Zod para doble verificación post-sanitización.
 */
export function hasHtmlChars(input: string): boolean {
  return /[<>"'&]/.test(input);
}

/**
 * Sanitiza un nombre de grupo: elimina HTML y colapsa espacios múltiples.
 * Máximo 50 caracteres después de sanitizar.
 */
export function sanitizeGroupName(input: string): string {
  return stripHtml(input).replace(/\s+/g, ' ').slice(0, 50);
}

/**
 * Sanitiza una descripción: elimina HTML y colapsa espacios múltiples.
 * Máximo 200 caracteres después de sanitizar.
 */
export function sanitizeDescription(input: string): string {
  return stripHtml(input).replace(/\s+/g, ' ').slice(0, 200);
}

/**
 * Sanitiza una query de búsqueda de usuarios.
 * Solo permite caracteres válidos en usernames ([a-zA-Z0-9_]).
 * Máximo 30 caracteres (límite superior de un username válido).
 */
export function sanitizeSearchQuery(input: string): string {
  return input.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
}
