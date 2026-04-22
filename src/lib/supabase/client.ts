import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Verifica tu archivo .env.local'
  );
}

/**
 * Cliente Supabase para uso en el lado del cliente (browser).
 * NO usar para operaciones que requieran service_role key.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
