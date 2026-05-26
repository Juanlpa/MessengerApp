'use client';

import { type ReactNode } from 'react';
import { type FilterId } from '@/lib/filters/canvas-filters';
import { type BackgroundId } from '@/hooks/useVideoFilter';

interface Props {
  activeFilter: FilterId;
  activeBackground: BackgroundId;
  onFilterChange: (f: FilterId) => void;
  onBackgroundChange: (bg: BackgroundId) => void;
  onClose: () => void;
}

const FILTERS: { id: FilterId; label: string; preview: string }[] = [
  { id: 'none',      label: 'Normal',     preview: 'brightness(1)' },
  { id: 'grayscale', label: 'Grises',     preview: 'grayscale(1)' },
  { id: 'sepia',     label: 'Sépia',      preview: 'sepia(0.85)' },
  { id: 'warm',      label: 'Cálido',     preview: 'saturate(1.4) hue-rotate(350deg) brightness(1.05)' },
  { id: 'cool',      label: 'Frío',       preview: 'saturate(1.1) hue-rotate(10deg) brightness(0.95)' },
  { id: 'vivid',     label: 'Vívido',     preview: 'saturate(1.8) contrast(1.1)' },
];

const BACKGROUNDS: { id: BackgroundId; label: string; preview: ReactNode }[] = [
  {
    id: 'none',
    label: 'Ninguno',
    preview: (
      <div className="w-full h-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    ),
  },
  {
    id: 'blur',
    label: 'Desenfoque',
    preview: (
      <div className="w-full h-full bg-gradient-to-br from-[#4fa3e0] via-[#6dbf82] to-[#f4a460]" style={{ filter: 'blur(4px)' }} />
    ),
  },
];

export function VideoFilterPanel({ activeFilter, activeBackground, onFilterChange, onBackgroundChange, onClose }: Props) {
  return (
    <div className="absolute bottom-[88px] left-1/2 -translate-x-1/2 z-10 bg-black/80 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-xl w-[340px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-white text-[13px] font-semibold">Efectos de video</span>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors p-1"
          title="Cerrar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Backgrounds */}
      <div className="mb-3">
        <p className="text-white/50 text-[11px] font-semibold uppercase tracking-wide mb-2">Fondo</p>
        <div className="flex gap-2">
          {BACKGROUNDS.map(({ id, label, preview }) => (
            <button
              key={id}
              onClick={() => onBackgroundChange(id)}
              className={`flex flex-col items-center gap-1.5 rounded-xl p-2 transition-colors flex-1 ${
                activeBackground === id
                  ? 'bg-[#0084ff]/30 ring-2 ring-[#0084ff]'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <div className="w-14 h-10 rounded-lg overflow-hidden">
                {preview}
              </div>
              <span className="text-white text-[11px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/10 mb-3" />

      {/* Filter grid */}
      <div className="mb-1">
        <p className="text-white/50 text-[11px] font-semibold uppercase tracking-wide mb-2">Filtro de color</p>
        <div className="grid grid-cols-3 gap-2">
          {FILTERS.map(({ id, label, preview }) => (
            <button
              key={id}
              onClick={() => onFilterChange(id)}
              className={`flex flex-col items-center gap-1.5 rounded-xl p-2 transition-colors ${
                activeFilter === id
                  ? 'bg-[#0084ff]/30 ring-2 ring-[#0084ff]'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <div
                className="w-12 h-9 rounded-lg overflow-hidden"
                style={{ filter: preview }}
              >
                <div className="w-full h-full bg-gradient-to-br from-[#4fa3e0] via-[#6dbf82] to-[#f4a460]" />
              </div>
              <span className="text-white text-[11px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
