'use client';

import { useEffect, useState } from 'react';
import { X, Send, Search } from 'lucide-react';

interface Conversation {
  id: string;
  otherUser: { id: string; username: string };
  encryptedSharedKey: { ciphertext: string; iv: string; mac: string };
}

interface ForwardMessageModalProps {
  open: boolean;
  messageText: string;
  currentConversationId: string;
  token: string;
  userId: string;
  onClose: () => void;
  onForwarded: (targetUsername: string) => void;
}

/**
 * Modal que permite reenviar un mensaje a otra conversación.
 * - Lista las conversaciones del usuario (excluyendo la actual)
 * - Al seleccionar una: descifra su shared key, re-cifra el texto con esa key, envía mensaje
 */
export function ForwardMessageModal({
  open,
  messageText,
  currentConversationId,
  token,
  userId,
  onClose,
  onForwarded,
}: ForwardMessageModalProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;

    setLoading(true);
    fetch(`/api/conversations?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const others = (data.conversations || []).filter(
          (c: Conversation) => c.id !== currentConversationId
        );
        setConversations(others);
      })
      .catch(err => console.error('Forward modal: failed to load conversations', err))
      .finally(() => setLoading(false));
  }, [open, token, currentConversationId]);

  const handleForward = async (conv: Conversation) => {
    if (sendingTo) return;
    setSendingTo(conv.id);
    try {
      const { decryptSharedKeyFromStorage } = await import('@/lib/crypto/key-exchange');
      const { pbkdf2 } = await import('@/lib/crypto/pbkdf2');
      const { encryptMessageE2E } = await import('@/lib/crypto/message-crypto');

      // Descifrar la shared key de la conversación destino con la clave de storage del usuario
      const storageKey = pbkdf2(userId, 'storage-salt', 1000, 32);
      const sharedKey = decryptSharedKeyFromStorage(conv.encryptedSharedKey, storageKey);

      // Re-cifrar el texto con la key de la conversación destino
      const e2eEncrypted = encryptMessageE2E(`[Reenviado] ${messageText}`, sharedKey);

      const res = await fetch(`/api/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ e2eEncrypted }),
      });

      if (res.ok) {
        onForwarded(conv.otherUser.username);
        onClose();
      } else {
        console.error('Forward failed:', await res.text());
      }
    } catch (err) {
      console.error('Forward error:', err);
    } finally {
      setSendingTo(null);
    }
  };

  if (!open) return null;

  const filtered = search.trim()
    ? conversations.filter(c => c.otherUser.username.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e4e6eb] flex items-center justify-between">
          <h3 className="text-[17px] font-semibold text-[#050505]">Reenviar mensaje</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[#f0f2f5] text-[#65676b]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview del mensaje */}
        <div className="px-5 py-3 bg-[#f0f2f5] border-b border-[#e4e6eb]">
          <p className="text-[12px] text-[#65676b] mb-1">Mensaje a reenviar:</p>
          <p className="text-[14px] text-[#050505] line-clamp-2">{messageText}</p>
        </div>

        {/* Buscador */}
        <div className="px-4 py-2 border-b border-[#e4e6eb] flex items-center gap-2">
          <Search className="w-4 h-4 text-[#65676b]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar contacto..."
            className="flex-1 bg-transparent text-[#050505] placeholder-[#65676b] focus:outline-none text-[14px]"
          />
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-center text-[#65676b] py-8 text-[14px]">
              {search ? 'No se encontraron contactos' : 'No hay otras conversaciones'}
            </p>
          )}

          {filtered.map(conv => (
            <button
              key={conv.id}
              onClick={() => handleForward(conv)}
              disabled={sendingTo !== null}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f0f2f5] transition-colors text-left disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0084ff] to-[#00c6ff] flex items-center justify-center text-white font-medium flex-shrink-0">
                {conv.otherUser.username[0]?.toUpperCase() || '?'}
              </div>
              <p className="flex-1 text-[15px] text-[#050505] font-medium">{conv.otherUser.username}</p>
              {sendingTo === conv.id ? (
                <div className="w-5 h-5 border-2 border-[#0084ff] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-[#0084ff]" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
