/**
 * mime-validator.ts — Validación de MIME por magic numbers + sanitización
 *
 * Seguridad: Verifica el tipo real del archivo leyendo sus primeros bytes,
 * no confiando en la extensión del nombre. Rechaza ejecutables aunque
 * cambien su extensión a .jpg u otro tipo permitido.
 *
 * Refs: https://en.wikipedia.org/wiki/List_of_file_signatures
 */

// ─── Magic Numbers ──────────────────────────────────────────────────

interface MagicSignature {
  mime: string;
  bytes: number[];
  offset?: number;
  /** Para RIFF-based formats, bytes adicionales a verificar */
  extraBytes?: { offset: number; bytes: number[] };
}

const MAGIC_SIGNATURES: MagicSignature[] = [
  // Imágenes
  { mime: 'image/jpeg',  bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png',   bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { mime: 'image/webp',  bytes: [0x52, 0x49, 0x46, 0x46], extraBytes: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
  // PDF
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  // Office Open XML (docx, xlsx, pptx — todos son ZIP)
  { mime: 'application/zip', bytes: [0x50, 0x4B, 0x03, 0x04] },
  // WebM/Matroska (para mensajes de voz)
  { mime: 'audio/webm', bytes: [0x1A, 0x45, 0xDF, 0xA3] },
  // OGG (fallback de audio en algunos navegadores)
  { mime: 'audio/ogg', bytes: [0x4F, 0x67, 0x67, 0x53] },
];

// Firmas de ejecutables a rechazar
const EXECUTABLE_SIGNATURES: { name: string; bytes: number[] }[] = [
  { name: 'ELF (Linux executable)',   bytes: [0x7F, 0x45, 0x4C, 0x46] },
  { name: 'PE/EXE (Windows)',         bytes: [0x4D, 0x5A] },
  { name: 'Shebang script (#!)',      bytes: [0x23, 0x21] },
  { name: 'Java class',               bytes: [0xCA, 0xFE, 0xBA, 0xBE] },
  { name: 'Mach-O (macOS)',           bytes: [0xFE, 0xED, 0xFA, 0xCE] },
  { name: 'Mach-O 64-bit',            bytes: [0xFE, 0xED, 0xFA, 0xCF] },
];

// Extensiones de ejecutables a rechazar siempre
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.vbs',
  '.wsf', '.sh', '.bash', '.csh', '.ksh', '.js', '.jsx',
  '.ts', '.tsx', '.py', '.rb', '.pl', '.php', '.jar',
  '.class', '.dll', '.so', '.dylib', '.app', '.deb', '.rpm',
  '.scr', '.pif', '.hta', '.reg', '.inf', '.msc',
]);

// MIME types permitidos
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/zip', // docx/xlsx son ZIP
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/webm',   // mensajes de voz
  'audio/ogg',    // fallback de voz
]);

// ─── API Pública ────────────────────────────────────────────────────

/**
 * Detecta el MIME type real de un archivo por sus magic bytes.
 * @param bytes - Primeros bytes del archivo (mínimo 16)
 * @returns MIME type detectado o null si no se reconoce
 */
export function detectMimeType(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;

  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (bytes.length < offset + sig.bytes.length) continue;

    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (bytes[offset + i] !== sig.bytes[i]) { match = false; break; }
    }

    if (match && sig.extraBytes) {
      const ex = sig.extraBytes;
      if (bytes.length < ex.offset + ex.bytes.length) { match = false; }
      else {
        for (let i = 0; i < ex.bytes.length; i++) {
          if (bytes[ex.offset + i] !== ex.bytes[i]) { match = false; break; }
        }
      }
    }

    if (match) return sig.mime;
  }

  return null;
}

/**
 * Verifica si el MIME type está en la whitelist de tipos permitidos.
 */
export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime);
}

/**
 * Detecta si los bytes corresponden a un ejecutable conocido.
 * @returns Nombre del tipo de ejecutable o null si es seguro
 */
export function detectExecutable(bytes: Uint8Array): string | null {
  for (const sig of EXECUTABLE_SIGNATURES) {
    if (bytes.length < sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (bytes[i] !== sig.bytes[i]) { match = false; break; }
    }
    if (match) return sig.name;
  }
  return null;
}

/**
 * Verifica si la extensión del archivo está bloqueada.
 */
export function isBlockedExtension(filename: string): boolean {
  const ext = getExtension(filename);
  return BLOCKED_EXTENSIONS.has(ext);
}

/**
 * Sanitiza un nombre de archivo para prevenir path traversal y caracteres peligrosos.
 *
 * - Elimina path traversal (../, ..\, rutas absolutas)
 * - Solo permite alfanuméricos, guiones, guiones bajos, puntos
 * - Limita longitud a 200 caracteres
 * - Preserva la extensión original
 */
export function sanitizeFilename(name: string): string {
  // Remover path components
  let sanitized = name.replace(/^.*[/\\]/, '');
  // Remover path traversal
  sanitized = sanitized.replace(/\.\./g, '');
  // Solo caracteres seguros
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Colapsar underscores múltiples
  sanitized = sanitized.replace(/_+/g, '_');
  // Remover puntos iniciales (hidden files)
  sanitized = sanitized.replace(/^\.+/, '');
  // Limitar longitud preservando extensión
  if (sanitized.length > 200) {
    const ext = getExtension(sanitized);
    const base = sanitized.slice(0, 200 - ext.length);
    sanitized = base + ext;
  }
  // Fallback si queda vacío
  if (!sanitized || sanitized === '_') {
    sanitized = 'unnamed_file';
  }
  return sanitized;
}

/**
 * Validación completa de un archivo antes de cifrar y subir.
 * @returns null si es válido, o string con el motivo de rechazo
 */
export function validateFile(
  bytes: Uint8Array,
  filename: string,
  declaredMime: string,
): string | null {
  // 1. Verificar tamaño
  if (bytes.length > 25 * 1024 * 1024) {
    return `File exceeds 25 MB limit (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`;
  }

  // 2. Verificar extensión bloqueada
  if (isBlockedExtension(filename)) {
    return `File type ${getExtension(filename)} is not allowed`;
  }

  // 3. Detectar ejecutable por magic bytes
  const execType = detectExecutable(bytes);
  if (execType) {
    return `Executable detected: ${execType}`;
  }

  // 4. Verificar MIME type por magic bytes
  const detectedMime = detectMimeType(bytes);
  if (detectedMime && !isAllowedMimeType(detectedMime)) {
    return `Detected file type ${detectedMime} is not allowed`;
  }

  // 5. Verificar MIME declarado
  if (!isAllowedMimeType(declaredMime) && declaredMime !== 'audio/webm' && declaredMime !== 'audio/ogg') {
    return `File type ${declaredMime} is not allowed`;
  }

  return null;
}

/**
 * Determina el tipo de adjunto basado en el MIME.
 */
export function getAttachmentType(mime: string): 'image' | 'voice' | 'file' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'voice';
  return 'file';
}

// ─── Helpers ────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
}
