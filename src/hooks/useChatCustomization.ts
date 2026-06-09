'use client';

/**
 * useChatCustomization — Personalización visual POR conversación.
 *
 * Se persiste en localStorage (preferencia local del usuario, por dispositivo).
 * Cada conversación guarda su propio color de burbuja y fondo.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  getBubbleColorById,
  getChatBackgroundById,
  DEFAULT_BUBBLE_COLOR,
  DEFAULT_CHAT_BACKGROUND,
  type BubbleColor,
  type ChatBackground,
} from '@/lib/chat/chat-customization';

const STORAGE_KEY = 'chat_customization';

type Stored = Record<string, { bubbleColorId?: string; backgroundId?: string }>;

function readStore(): Stored {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStore(store: Stored) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // cuota llena u otro error — ignorar
  }
}

export function useChatCustomization(conversationId: string) {
  const [bubbleColor, setBubbleColorState] = useState<BubbleColor>(DEFAULT_BUBBLE_COLOR);
  const [background, setBackgroundState] = useState<ChatBackground>(DEFAULT_CHAT_BACKGROUND);

  // Cargar la preferencia guardada al cambiar de conversación
  useEffect(() => {
    if (!conversationId) return;
    const store = readStore();
    const conf = store[conversationId] ?? {};
    setBubbleColorState(getBubbleColorById(conf.bubbleColorId));
    setBackgroundState(getChatBackgroundById(conf.backgroundId));
  }, [conversationId]);

  const setBubbleColor = useCallback((colorId: string) => {
    const color = getBubbleColorById(colorId);
    setBubbleColorState(color);
    const store = readStore();
    store[conversationId] = { ...store[conversationId], bubbleColorId: color.id };
    writeStore(store);
  }, [conversationId]);

  const setBackground = useCallback((backgroundId: string) => {
    const bg = getChatBackgroundById(backgroundId);
    setBackgroundState(bg);
    const store = readStore();
    store[conversationId] = { ...store[conversationId], backgroundId: bg.id };
    writeStore(store);
  }, [conversationId]);

  return { bubbleColor, background, setBubbleColor, setBackground };
}
