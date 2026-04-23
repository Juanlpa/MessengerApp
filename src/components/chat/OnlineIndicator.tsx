/**
 * OnlineIndicator — Punto verde de presencia online estilo Messenger
 * 
 * Se posiciona absolute dentro de un contenedor relative (avatar).
 */

'use client';

interface OnlineIndicatorProps {
  isOnline: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: { dot: 'w-2.5 h-2.5', ring: 'border-[1.5px]' },
  md: { dot: 'w-3 h-3', ring: 'border-2' },
  lg: { dot: 'w-3.5 h-3.5', ring: 'border-2' },
};

export function OnlineIndicator({ isOnline, size = 'md' }: OnlineIndicatorProps) {
  if (!isOnline) return null;

  const s = sizeMap[size];

  return (
    <span
      className={`absolute bottom-0 right-0 ${s.dot} bg-[#31A24C] rounded-full ${s.ring} border-white`}
      title="En línea"
    />
  );
}
