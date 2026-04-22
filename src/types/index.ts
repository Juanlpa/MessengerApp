// Tipos globales del proyecto Messenger Clone
// Definiciones de interfaces y types compartidos

/** Estado de una solicitud de amistad */
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

/** Rol de un participante en una conversación */
export type ParticipantRole = 'admin' | 'member';

/** Tipo de mensaje */
export type MessageType = 'text' | 'voice' | 'image' | 'file';

/** Estado de entrega de un mensaje */
export type MessageDeliveryStatus = 'sent' | 'delivered' | 'read';

/** Tipo de llamada */
export type CallType = 'audio' | 'video';

/** Estado de una llamada */
export type CallStatus = 'ringing' | 'connected' | 'ended' | 'rejected' | 'missed';

/** Tema de la aplicación */
export type ThemeMode = 'light' | 'dark';

/** Evento de seguridad para auditoría */
export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'password_change'
  | 'password_reset'
  | 'key_rotation'
  | 'account_created'
  | 'account_deleted';

/** Usuario base (datos públicos, sin info sensible) */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  public_key: string;
  last_seen: string | null;
  created_at: string;
}

/** Datos de sesión del usuario autenticado */
export interface AuthSession {
  user: PublicUser;
  jwt: string;
  /** Clave privada DH descifrada — solo existe en memoria */
  privateKey: string;
  /** Clave de cifrado local derivada del password — solo existe en memoria */
  localEncryptionKey: Uint8Array;
}

/** Conversación */
export interface Conversation {
  id: string;
  is_group: boolean;
  name: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  /** Datos calculados del lado del cliente */
  last_message_preview?: string;
  last_message_at?: string;
  unread_count?: number;
}

/** Mensaje descifrado (como se muestra en pantalla) */
export interface DecryptedMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  /** Metadatos del adjunto si aplica */
  attachment?: {
    filename: string;
    mime_type: string;
    size_bytes: number;
    url?: string;
  };
}

/** Mensaje cifrado (como viene del servidor) */
export interface EncryptedMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  ciphertext_e2e: string;
  iv_e2e: string;
  auth_tag_e2e: string;
  message_type: MessageType;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}
