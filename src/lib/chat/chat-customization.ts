/**
 * chat-customization.ts — Paletas para personalizar la apariencia por chat.
 *
 * Colores de burbuja: todos son tonos -600 (saturados/oscuros) para que el
 * texto BLANCO encima siempre tenga contraste legible (WCAG AA aprox.).
 * Fondos: pares light/dark sutiles para no competir con las burbujas.
 */

export interface BubbleColor {
  id: string;
  name: string;
  /** color de la burbuja propia (texto siempre blanco encima) */
  hex: string;
}

export interface ChatBackground {
  id: string;
  name: string;
  /** color de fondo del área de mensajes en modo claro */
  light: string;
  /** color de fondo del área de mensajes en modo oscuro */
  dark: string;
}

// Burbuja propia. El primero (azul) es el default histórico de la app.
export const BUBBLE_COLORS: BubbleColor[] = [
  { id: 'blue',   name: 'Azul',     hex: '#0084ff' },
  { id: 'green',  name: 'Verde',    hex: '#059669' },
  { id: 'teal',   name: 'Turquesa', hex: '#0d9488' },
  { id: 'cyan',   name: 'Cian',     hex: '#0891b2' },
  { id: 'indigo', name: 'Índigo',   hex: '#4f46e5' },
  { id: 'violet', name: 'Violeta',  hex: '#7c3aed' },
  { id: 'pink',   name: 'Rosa',     hex: '#db2777' },
  { id: 'red',    name: 'Rojo',     hex: '#dc2626' },
  { id: 'orange', name: 'Naranja',  hex: '#ea580c' },
  { id: 'slate',  name: 'Grafito',  hex: '#475569' },
];

// Fondo del área de mensajes. "default" usa los colores base de la app.
export const CHAT_BACKGROUNDS: ChatBackground[] = [
  { id: 'default', name: 'Por defecto', light: '#ffffff', dark: '#111827' },
  { id: 'warm',    name: 'Cálido',      light: '#fdf6ec', dark: '#1c1917' },
  { id: 'cool',    name: 'Frío',        light: '#eef2ff', dark: '#0f172a' },
  { id: 'mint',    name: 'Menta',       light: '#f0fdf4', dark: '#0c1f17' },
  { id: 'rose',    name: 'Rosado',      light: '#fdf2f8', dark: '#1f1420' },
  { id: 'graphite',name: 'Pizarra',     light: '#f1f5f9', dark: '#0b1220' },
];

export const DEFAULT_BUBBLE_COLOR = BUBBLE_COLORS[0];
export const DEFAULT_CHAT_BACKGROUND = CHAT_BACKGROUNDS[0];

export function getBubbleColorById(id: string | null | undefined): BubbleColor {
  return BUBBLE_COLORS.find((c) => c.id === id) ?? DEFAULT_BUBBLE_COLOR;
}

export function getChatBackgroundById(id: string | null | undefined): ChatBackground {
  return CHAT_BACKGROUNDS.find((b) => b.id === id) ?? DEFAULT_CHAT_BACKGROUND;
}
