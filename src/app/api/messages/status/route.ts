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
    const { messageId, messageIds, conversationId, status, deliverAllPending } = body;

    const supabase = getSupabaseAdmin();

    // --- Acción especial: marcar como "entregados" TODOS los mensajes recibidos
    // que aún no tienen ningún estado para este usuario. Se llama al conectarse
    // a la app, para que los mensajes que llegaron mientras estaba offline pasen
    // a ✓✓ (entregado) aunque no abra cada chat — comportamiento tipo WhatsApp.
    if (deliverAllPending) {
      // 1. Conversaciones del usuario
      const { data: parts } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.sub);
      const convIds = (parts ?? []).map((p: { conversation_id: string }) => p.conversation_id);
      if (convIds.length === 0) return NextResponse.json({ success: true, delivered: 0 });

      // 2. Mensajes recibidos (de otros) en esas conversaciones
      const { data: msgs } = await supabase
        .from('messages')
        .select('id')
        .in('conversation_id', convIds)
        .neq('sender_id', user.sub);
      const msgIds = (msgs ?? []).map((m: { id: string }) => m.id);
      if (msgIds.length === 0) return NextResponse.json({ success: true, delivered: 0 });

      // 3. Estados ya existentes del usuario para esos mensajes (no tocarlos)
      const { data: existing } = await supabase
        .from('message_status')
        .select('message_id')
        .eq('user_id', user.sub)
        .in('message_id', msgIds);
      const hasStatus = new Set((existing ?? []).map((e: { message_id: string }) => e.message_id));

      // 4. Solo los que NO tienen estado → marcarlos entregados (no degrada read)
      const toDeliver = msgIds.filter((id: string) => !hasStatus.has(id));
      if (toDeliver.length > 0) {
        const rows = toDeliver.map((mid: string) => ({
          message_id: mid,
          user_id: user.sub,
          status: 'delivered',
          updated_at: new Date().toISOString(),
        }));
        await supabase.from('message_status').upsert(rows, { onConflict: 'message_id,user_id' });
      }
      return NextResponse.json({ success: true, delivered: toDeliver.length });
    }

    if (!status || !['delivered', 'read'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (Array.isArray(messageIds) && messageIds.length > 0) {
      // Batch: varios messageIds de un solo envío
      const upserts = (messageIds as string[]).map((mid) => ({
        message_id: mid,
        user_id: user.sub,
        status,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('message_status')
        .upsert(upserts, { onConflict: 'message_id,user_id' });
      if (error) {
        console.error('Batch update message status error:', error);
        return NextResponse.json({ error: 'Failed to update statuses' }, { status: 500 });
      }
    } else if (messageId) {
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
