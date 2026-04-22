// Constantes globales de la aplicación

/** Colores del diseño — estilo Facebook Messenger */
export const COLORS = {
  PRIMARY: '#378ADD',
  PRIMARY_DARK: '#2B6DB4',
  PRIMARY_LIGHT: '#5BA3E6',
  BUBBLE_OWN: '#378ADD',
  BUBBLE_OTHER: '#F1EFE8',
  BUBBLE_OWN_TEXT: '#FFFFFF',
  BUBBLE_OTHER_TEXT: '#1A1A1A',
  ONLINE: '#31A24C',
  OFFLINE: '#B0B3B8',
  DANGER: '#E4405F',
  WARNING: '#F5A623',
  SUCCESS: '#31A24C',
  BACKGROUND_LIGHT: '#FFFFFF',
  BACKGROUND_DARK: '#1A1A2E',
  SURFACE_LIGHT: '#F0F2F5',
  SURFACE_DARK: '#242442',
} as const;

/** Configuración de seguridad */
export const SECURITY = {
  /** Iteraciones PBKDF2 para derivación de clave */
  PBKDF2_ITERATIONS: 100_000,
  /** Tamaño del salt en bytes */
  SALT_SIZE: 32,
  /** Tamaño del IV para AES-GCM en bytes */
  IV_SIZE: 12,
  /** Tamaño de clave AES en bytes (256 bits) */
  AES_KEY_SIZE: 32,
  /** Tamaño del auth tag GCM en bytes */
  GCM_TAG_SIZE: 16,
  /** Expiración del JWT en segundos (24 horas) */
  JWT_EXPIRY_SECONDS: 86400,
  /** Máximo intentos de login por minuto por IP */
  MAX_LOGIN_ATTEMPTS_PER_MINUTE: 5,
  /** Máximo mensajes por minuto por usuario */
  MAX_MESSAGES_PER_MINUTE: 30,
  /** Máximo llamadas API por minuto */
  MAX_API_CALLS_PER_MINUTE: 100,
  /** Máximo uploads por minuto */
  MAX_UPLOADS_PER_MINUTE: 10,
} as const;

/** Configuración de archivos adjuntos */
export const ATTACHMENTS = {
  /** Tamaño máximo de archivo en bytes (25 MB) */
  MAX_FILE_SIZE: 25 * 1024 * 1024,
  /** Tipos MIME permitidos para imágenes */
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const,
  /** Tipos MIME permitidos para documentos */
  ALLOWED_DOC_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const,
} as const;

/** Configuración de llamadas */
export const CALLS = {
  /** Máximo participantes en videollamada grupal */
  MAX_VIDEO_PARTICIPANTS: 4,
  /** Máximo participantes en llamada de audio grupal */
  MAX_AUDIO_PARTICIPANTS: 8,
  /** Servidores STUN */
  STUN_SERVERS: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
  ] as const,
  /** Servidor TURN (Open Relay Project) */
  TURN_SERVER: {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
} as const;

/** Configuración de UI */
export const UI = {
  /** Mensajes por página para paginación */
  MESSAGES_PER_PAGE: 30,
  /** Border radius de burbujas de chat */
  BUBBLE_BORDER_RADIUS: 18,
  /** Duración máxima de mensaje de voz en segundos */
  MAX_VOICE_DURATION: 300,
} as const;
