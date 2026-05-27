/**
 * log-multimedia.ts — Logging de eventos de seguridad para módulo multimedia
 *
 * Integra con tabla security_logs. Registra eventos sin contenido sensible:
 * solo metadata (filename, mime, size). NUNCA loguear texto plano ni claves.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type MultimediaEventType =
  | 'file_uploaded'
  | 'file_downloaded'
  | 'file_type_rejected'
  | 'file_size_exceeded'
  | 'file_executable_rejected'
  | 'file_validation_failed'
  | 'voice_recorded'
  | 'voice_played';

interface LogDetails {
  filename?: string;
  mime_type?: string;
  size_bytes?: number;
  conversation_id?: string;
  attachment_id?: string;
  reason?: string;
  detected_mime?: string;
  declared_mime?: string;
  magic_bytes_hex?: string;
  [key: string]: unknown;
}

/**
 * Registra un evento de seguridad multimedia en la BD.
 * No lanza excepciones — falla silenciosamente para no bloquear flujo principal.
 */
export async function logMultimediaEvent(
  eventType: MultimediaEventType,
  userId: string | null,
  details: LogDetails,
  request?: Request,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    const ipAddress = request?.headers?.get('x-forwarded-for')
      ?? request?.headers?.get('x-real-ip')
      ?? 'unknown';
    const userAgent = request?.headers?.get('user-agent') ?? 'unknown';

    await supabase.from('security_logs').insert({
      user_id: userId,
      event_type: eventType,
      ip_address: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : 'unknown',
      user_agent: userAgent,
      details,
    });
  } catch (err) {
    // No propagar errores de logging — la funcionalidad principal no debe fallar
    console.error('[security_log] Failed to log event:', eventType, err);
  }
}
