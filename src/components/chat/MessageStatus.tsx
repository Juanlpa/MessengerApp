/**
 * MessageStatus — Componente visual para estados de entrega de mensaje
 * 
 * ✓  = enviado (gris)
 * ✓✓ = entregado (gris)
 * ✓✓ = leído (azul Messenger)
 */

'use client';

interface MessageStatusProps {
  status: 'sent' | 'delivered' | 'read';
  isOwnMessage: boolean;
}

export function MessageStatus({ status, isOwnMessage }: MessageStatusProps) {
  // Solo mostrar en mensajes propios
  if (!isOwnMessage) return null;

  const isRead = status === 'read';
  const isDelivered = status === 'delivered' || status === 'read';
  const color = isRead ? '#0084ff' : '#65676b';

  return (
    <span className="inline-flex items-center ml-1 flex-shrink-0" title={
      status === 'sent' ? 'Enviado' :
      status === 'delivered' ? 'Entregado' : 'Leído'
    }>
      {isDelivered ? (
        // Doble check
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path
            d="M1 6l3 3L11 2"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 6l3 3L15 2"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        // Check simple
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6l3 3L10 3"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
