import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase para uso en el servidor (API Routes, Server Components).
 * Usa service_role key para bypass de RLS cuando es necesario.
 * NUNCA exponer este cliente al browser.
 */
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Faltan variables de entorno del servidor. ' +
      'Verifica NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local'
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
