/**
 * Cliente Supabase con Service Role Key — para API Routes
 * Bypasea RLS. Solo usar en server-side (API routes).
 */

import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Singleton
let adminClient: any = null;

export function getSupabaseAdmin(): any {
  if (!adminClient) {
    adminClient = getAdminClient();
  }
  return adminClient;
}
