/**
 * sanitize.ts — Limpieza de inputs de usuario para prevenir XSS.
 *
 * NOTA: Módulo mínimo creado para las rutas de grupos.
 * Coordinar con Joel (dominio: seguridad) para extender si necesita
 * lógica más avanzada (allowlists, entidades HTML, etc.).
 */

/** Elimina etiquetas HTML y el contenido de tags peligrosos (script, style) */
export function stripHtml(input: string): string {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
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
