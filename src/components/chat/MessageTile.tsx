'use client';

import { memo } from 'react';
import { MessageStatus } from '@/components/chat/MessageStatus';
import { MessageReactions } from '@/components/chat/MessageReactions';
import { QuotedMessage } from '@/components/chat/QuotedMessage';
import { AttachmentPreview } from '@/components/chat/AttachmentPreview';
import { VoicePlayer } from '@/components/chat/VoicePlayer';
import { cleanAttachmentText } from '@/lib/crypto/message-crypto';

export interface MessageData {
  id: string;
  senderId: string;
  text?: string;
  e2e?: { ciphertext: string; iv: string; mac: string } | null;
  createdAt: string;
  error?: string;
  status?: 'sent' | 'delivered' | 'read';
  isDeleted?: boolean;
  replyToId?: string | null;
  editedAt?: string | null;
  reactions?: { emoji: string; userIds: string[] }[];
  messageType?: 'text' | 'voice' | 'image' | 'file';
  attachment?: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    attachmentType: 'image' | 'voice' | 'file';
    durationMs?: number | null;
    waveformData?: number[];
  } | null;
}

interface MessageTileProps {
  msg: MessageData;
  isMe: boolean;
  isLastInGroup: boolean;
  replySource: MessageData | null;
  otherUsername: string;
  currentUserId: string;
  isEditing: boolean;
  editText: string;
  onSetReplyTo: (msg: MessageData) => void;
  onForward: (msg: MessageData) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onStartEdit: (msg: MessageData) => void;
  onSubmitEdit: () => void;
  onSetEditText: (text: string) => void;
  onCancelEdit: () => void;
  onDeleteMessage: (messageId: string) => void;
  // Attachment callbacks (develop)
  onViewImage: (id: string) => void;
  onLoadThumbnail: (id: string) => Promise<{ blobUrl: string } | null>;
  onDownload: (id: string) => Promise<void>;
  onLoadAudio: (id: string) => Promise<{ blobUrl: string } | null>;
}

function MessageTileInner({
  msg,
  isMe,
  isLastInGroup,
  replySource,
  otherUsername,
  currentUserId,
  isEditing,
  editText,
  onSetReplyTo,
  onForward,
  onToggleReaction,
  onStartEdit,
  onSubmitEdit,
  onSetEditText,
  onCancelEdit,
  onDeleteMessage,
  // Attachment callbacks
  onViewImage,
  onLoadThumbnail,
  onDownload,
  onLoadAudio,
}: MessageTileProps) {
  const hasAttachment = msg.attachment && msg.messageType !== 'text';

  return (
    <div
      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isLastInGroup ? 'mb-3' : 'mb-0.5'} group`}
    >
      {/* Mensaje citado */}
      {replySource && (
        <QuotedMessage
          text={replySource.isDeleted ? 'Mensaje eliminado' : cleanAttachmentText(replySource.text || '')}
          senderName={replySource.senderId === currentUserId ? 'Tú' : otherUsername}
          isMe={isMe}
        />
      )}

      <div className="flex items-end gap-1 max-w-[75%]">
        {/* Acciones hover — solo mensajes no eliminados */}
        {!msg.isDeleted && (
          <div className={`hidden group-hover:flex items-center gap-0.5 mb-1 ${isMe ? 'order-first' : 'order-last'}`}>
            {/* Responder */}
            <button
              onClick={() => onSetReplyTo(msg)}
              className="p-1 rounded-full hover:bg-[#e4e6eb] text-[#65676b]"
              title="Responder"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 17 4 12 9 7" /><line x1="20" y1="12" x2="4" y2="12" />
              </svg>
            </button>
            {/* Reenviar */}
            <button
              onClick={() => onForward(msg)}
              className="p-1 rounded-full hover:bg-[#e4e6eb] text-[#65676b]"
              title="Reenviar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>
              </svg>
            </button>
            {/* Reacciones */}
            {(['👍', '❤️', '😂'] as const).map(emoji => (
              <button
                key={emoji}
                onClick={() => onToggleReaction(msg.id, emoji)}
                className="p-1 rounded-full hover:bg-[#e4e6eb] text-[#65676b] text-[12px]"
                title={emoji}
              >{emoji}</button>
            ))}
            {/* Editar / Eliminar — solo propios */}
            {isMe && (
              <>
                <button
                  onClick={() => onStartEdit(msg)}
                  className="p-1 rounded-full hover:bg-[#e4e6eb] text-[#65676b]"
                  title="Editar"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  onClick={() => onDeleteMessage(msg.id)}
                  className="p-1 rounded-full hover:bg-[#e4e6eb] text-[#e02424]"
                  title="Eliminar"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                  </svg>
                </button>
              </>
            )}
          </div>
        )}

        {/* Burbuja */}
        {isEditing ? (
          <div className="flex items-center gap-2 w-full">
            <input
              autoFocus
              value={editText}
              onChange={e => onSetEditText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onSubmitEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              className="flex-1 px-3 py-1.5 rounded-[20px] border border-[#0084ff] text-[15px] text-[#050505] focus:outline-none bg-white"
            />
            <button onClick={onSubmitEdit} className="text-[#0084ff] text-[13px] font-medium">Guardar</button>
            <button onClick={onCancelEdit} className="text-[#65676b] text-[13px]">Cancelar</button>
          </div>
        ) : (
          <div
            className={`${
              msg.isDeleted
                ? 'px-4 py-2 bg-transparent border border-[#e4e6eb] dark:border-gray-700 text-[#65676b] dark:text-gray-400 italic rounded-[20px]'
                : hasAttachment
                  ? 'px-1.5 py-1.5'
                  : 'px-4 py-2'
            } ${
              !msg.isDeleted && !hasAttachment
                ? isMe
                  ? 'bg-[#0084ff] text-white rounded-[20px] ' + (isLastInGroup ? 'rounded-br-[4px]' : '')
                  : 'bg-[#e4e6eb] dark:bg-gray-700 text-[#050505] dark:text-white rounded-[20px] ' + (isLastInGroup ? 'rounded-bl-[4px]' : '')
                : ''
            } ${
              hasAttachment
                ? isMe
                  ? 'bg-[#0084ff] text-white rounded-[20px] ' + (isLastInGroup ? 'rounded-br-[4px]' : '')
                  : 'bg-[#e4e6eb] dark:bg-gray-700 text-[#050505] dark:text-white rounded-[20px] ' + (isLastInGroup ? 'rounded-bl-[4px]' : '')
                : ''
            }`}
            style={{ wordBreak: 'break-word' }}
          >
            {msg.isDeleted ? (
              <p className="text-[14px]">Mensaje eliminado</p>
            ) : hasAttachment && msg.attachment && msg.attachment.attachmentType !== 'voice' ? (
              <AttachmentPreview
                attachmentId={msg.attachment.id}
                filename={msg.attachment.filename}
                mimeType={msg.attachment.mimeType}
                sizeBytes={msg.attachment.sizeBytes}
                attachmentType={msg.attachment.attachmentType}
                isOwnMessage={isMe}
                onDownload={onDownload}
                onViewImage={onViewImage}
                onLoadThumbnail={onLoadThumbnail}
              />
            ) : hasAttachment && msg.attachment && msg.attachment.attachmentType === 'voice' ? (
              <VoicePlayer
                attachmentId={msg.attachment.id}
                durationMs={msg.attachment.durationMs ?? 0}
                waveformData={msg.attachment.waveformData ?? []}
                isOwnMessage={isMe}
                onLoadAudio={onLoadAudio}
              />
            ) : (
              <>
                <p className="text-[15px] leading-tight">{cleanAttachmentText(msg.text || '[Mensaje cifrado]')}</p>
                {msg.editedAt && (
                  <span className={`text-[11px] ${isMe ? 'text-blue-100' : 'text-[#65676b]'}`}> · editado</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Reacciones */}
      {(msg.reactions?.length ?? 0) > 0 && (
        <MessageReactions
          reactions={msg.reactions!}
          currentUserId={currentUserId}
          onToggle={(emoji) => onToggleReaction(msg.id, emoji)}
          isMe={isMe}
        />
      )}

      {/* Status + timestamp */}
      {isMe && isLastInGroup && !isEditing && (
        <div className="flex items-center justify-end gap-1 mt-0.5 mr-1">
          <span className="text-[11px] text-[#65676b]">
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <MessageStatus status={msg.status || 'sent'} isOwnMessage={true} />
        </div>
      )}
    </div>
  );
}

/**
 * Compara solo las props que cambian realmente en un mensaje.
 * Evita re-render de N tiles cuando llega 1 mensaje nuevo.
 */
function areEqual(prev: MessageTileProps, next: MessageTileProps): boolean {
  return (
    prev.msg.id === next.msg.id &&
    prev.msg.text === next.msg.text &&
    prev.msg.status === next.msg.status &&
    prev.msg.isDeleted === next.msg.isDeleted &&
    prev.msg.editedAt === next.msg.editedAt &&
    prev.msg.messageType === next.msg.messageType &&
    prev.msg.attachment?.id === next.msg.attachment?.id &&
    prev.msg.attachment?.durationMs === next.msg.attachment?.durationMs &&
    prev.msg.reactions?.length === next.msg.reactions?.length &&
    JSON.stringify(prev.msg.reactions) === JSON.stringify(next.msg.reactions) &&
    prev.isLastInGroup === next.isLastInGroup &&
    prev.isEditing === next.isEditing &&
    prev.editText === next.editText &&
    prev.replySource?.id === next.replySource?.id
  );
}

export const MessageTile = memo(MessageTileInner, areEqual);
