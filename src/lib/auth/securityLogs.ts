import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function logSecurityEvent(
  type: string,
  userId: string | null,
  details: any
) {

  try {

    const supabase =
      getSupabaseAdmin();

    await supabase
      .from('security_logs')
      .insert({

        event_type: type,

        user_id: userId,

        ip: details.ip || null,

        user_agent:
          details.userAgent || null,

        details_jsonb:
          details

      });

  }
  catch(error){

    console.error(
      'Security log error:',
      error
    );

  }

}