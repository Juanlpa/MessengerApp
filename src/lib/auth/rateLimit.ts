/**
 * Rate limiting básico por IP usando la tabla login_attempts.
 *
 * Política: máximo 5 intentos fallidos por IP en una ventana de 1 minuto.
 * Si se excede, bloquea hasta que la ventana caduque.
 *
 * Limitación: no protege contra ataques distribuidos (botnet con muchas IPs).
 * Para eso se necesitaría Redis + sliding window por usuario/endpoint.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

const WINDOW_MS = 60_000;
const MAX_FAILED = 5;

export async function checkRateLimit(ip: string): Promise<boolean> {
  if (!ip || ip === 'unknown') return true; // no bloqueamos si no podemos identificar

  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count } = await supabase
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .gte('attempted_at', since);

  return (count ?? 0) < MAX_FAILED;
}

export async function saveAttempt(email: string, ip: string, success: boolean) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('login_attempts').insert({ email, ip, success });
  } catch (error) {
    console.error('saveAttempt error:', error instanceof Error ? error.message : 'unknown');
  }
}
