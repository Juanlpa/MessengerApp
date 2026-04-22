import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debug() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Missing env vars');

  const supabase = createClient(url, serviceKey);

  const { data: users, error: uErr } = await supabase.from('users').select('id, username');
  console.log('Users:', users);

  const { data: convs, error: cErr } = await supabase.from('conversations').select('*');
  console.log('Conversations:', convs);

  const { data: parts, error: pErr } = await supabase.from('conversation_participants').select('*');
  console.log('Participants:', parts);
}

debug().catch(console.error);
