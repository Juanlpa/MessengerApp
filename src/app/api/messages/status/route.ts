/**
 * PATCH /api/messages/status — Actualizar estado de mensaje (delivered/read)
 * 
 * Body: { messageId, status } para un mensaje individual
 * O:    { conversationId, status } para marcar todos los de una conversación
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserFromRequest } from '@/lib/auth/get-user';

export async function PATCH(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { messageId, conversationId, status } = body;

    if (!status || !['delivered', 'read'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (messageId) {
      // Actualizar un mensaje individual
      const { error } = await supabase
        .from('message_status')
        .upsert({
          message_id: messageId,
          user_id: user.sub,
          status,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'message_id,user_id',
        });

      if (error) {
        console.error('Update message status error:', error);
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
      }
    } else if (conversationId) {
      // Marcar todos los mensajes de la conversación como leídos
      // Solo los que no son del propio usuario y no están ya marcados como 'read'
      const { data: messages } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .neq('sender_id', user.sub);

      if (messages && messages.length > 0) {
        const messageIds = messages.map((m: { id: string }) => m.id);
        
        // Upsert en batch: crear o actualizar estado para cada mensaje
        const upserts = messageIds.map((mid: string) => ({
          message_id: mid,
          user_id: user.sub,
          status,
          updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('message_status')
          .upsert(upserts, { onConflict: 'message_id,user_id' });

        if (error) {
          console.error('Bulk update message status error:', error);
          return NextResponse.json({ error: 'Failed to update statuses' }, { status: 500 });
        }
      }
    } else {
      return NextResponse.json({ error: 'messageId or conversationId required' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Message status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
