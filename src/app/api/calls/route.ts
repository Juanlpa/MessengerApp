import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { conversationId, status, durationSeconds, callId, action } = body;

    const supabase = getSupabaseAdmin();

    // Receptor acepta la llamada → registrar su participación
    if (action === 'join' && callId) {
      const { error } = await supabase
        .from('call_participants')
        .upsert({ call_id: callId, user_id: user.sub }, { onConflict: 'call_id,user_id' });

      if (error) return NextResponse.json({ error: 'Failed to join call' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (callId) {
      // Verify user is either initiator or participant before allowing update
      const { data: access } = await supabase
        .from('calls')
        .select('id, initiated_by')
        .eq('id', callId)
        .single();

      const { data: participant } = await supabase
        .from('call_participants')
        .select('id')
        .eq('call_id', callId)
        .eq('user_id', user.sub)
        .maybeSingle();

      if (!access || (access.initiated_by !== user.sub && !participant)) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      const { error } = await supabase
        .from('calls')
        .update({
          status,
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds ?? null,
        })
        .eq('id', callId);

      if (error) return NextResponse.json({ error: 'Failed to update call' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // Crear nueva llamada e insertar al iniciador en call_participants
    const { data, error } = await supabase
      .from('calls')
      .insert({
        conversation_id: conversationId,
        initiated_by: user.sub,
        status: status ?? 'initiated',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: 'Failed to create call' }, { status: 500 });

    await supabase
      .from('call_participants')
      .insert({ call_id: data.id, user_id: user.sub });

    return NextResponse.json({ callId: data.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
