'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreVertical, Check } from 'lucide-react';
import {
  BUBBLE_COLORS,
  CHAT_BACKGROUNDS,
  type BubbleColor,
  type ChatBackground,
} from '@/lib/chat/chat-customization';

interface Props {
  bubbleColor: BubbleColor;
  background: ChatBackground;
  onBubbleColorChange: (id: string) => void;
  onBackgroundChange: (id: string) => void;
  /** modo oscuro activo — para mostrar la preview del fondo correcta */
  isDark: boolean;
}

export function ChatCustomizationMenu({
  bubbleColor,
  background,
  onBubbleColorChange,
  onBackgroundChange,
  isDark,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera o con Escape
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-full hover:bg-[#f0f2f5] dark:hover:bg-gray-800 text-[#65676b] dark:text-gray-400 transition-colors"
        title="Personalizar chat"
        aria-label="Personalizar chat"
        aria-expanded={open}
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-gray-900 border border-[#e4e6eb] dark:border-gray-700 rounded-xl shadow-2xl p-4"
        >
          <p className="text-[13px] font-semibold text-[#050505] dark:text-white mb-2">
            Color de tus mensajes
          </p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {BUBBLE_COLORS.map((c) => {
              const selected = c.id === bubbleColor.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onBubbleColorChange(c.id)}
                  title={c.name}
                  aria-label={c.name}
                  className="relative w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900"
                  style={{ backgroundColor: c.hex }}
                >
                  {selected && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </button>
              );
            })}
          </div>

          <p className="text-[13px] font-semibold text-[#050505] dark:text-white mb-2">
            Fondo del chat
          </p>
          <div className="grid grid-cols-3 gap-2">
            {CHAT_BACKGROUNDS.map((bg) => {
              const selected = bg.id === background.id;
              const swatch = isDark ? bg.dark : bg.light;
              return (
                <button
                  key={bg.id}
                  onClick={() => onBackgroundChange(bg.id)}
                  title={bg.name}
                  className={`relative h-12 rounded-lg border transition-all flex items-end justify-center pb-1 ${
                    selected
                      ? 'border-[#0084ff] ring-1 ring-[#0084ff]'
                      : 'border-[#e4e6eb] dark:border-gray-700 hover:border-gray-400'
                  }`}
                  style={{ backgroundColor: swatch }}
                >
                  {/* mini-burbuja de preview con el color actual */}
                  <span
                    className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full"
                    style={{ backgroundColor: bubbleColor.hex }}
                  />
                  <span className="text-[10px] font-medium px-1 rounded bg-black/30 text-white">
                    {bg.name}
                  </span>
                  {selected && (
                    <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-[#0084ff] flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
