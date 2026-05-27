'use client';

import { create } from 'zustand';

interface IncomingCall {
  conversationId: string;
  callerId: string;
  callerName: string;
  isAudioOnly?: boolean;
  isGroupCall?: boolean;
}

interface CallStore {
  incomingCall: IncomingCall | null;
  // Conversación en la que se debe auto-unir al canal grupal (Charlie ya está en el chat)
  pendingGroupJoin: string | null;
  setIncomingCall: (call: IncomingCall) => void;
  clearIncomingCall: () => void;
  setPendingGroupJoin: (conversationId: string | null) => void;
}

export const useCallStore = create<CallStore>((set) => ({
  incomingCall: null,
  pendingGroupJoin: null,
  setIncomingCall: (call) => set({ incomingCall: call }),
  clearIncomingCall: () => set({ incomingCall: null }),
  setPendingGroupJoin: (conversationId) => set({ pendingGroupJoin: conversationId }),
}));
