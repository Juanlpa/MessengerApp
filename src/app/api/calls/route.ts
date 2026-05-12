import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { conversationId, status, durationSeconds, callId } = body;

    const supabase = getSupabaseAdmin();

    if (callId) {
      // Actualizar llamada existente (finalizar)
      const { error } = await supabase
        .from('calls')
        .update({
          status,
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds ?? null,
        })
        .eq('id', callId)
        .eq('initiated_by', user.sub);

      if (error) return NextResponse.json({ error: 'Failed to update call' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // Crear nueva llamada
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
    return NextResponse.json({ callId: data.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
