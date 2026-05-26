'use client';

import { create } from 'zustand';

interface IncomingCall {
  conversationId: string;
  callerId: string;
  callerName: string;
  isAudioOnly?: boolean;
}

interface CallStore {
  incomingCall: IncomingCall | null;
  setIncomingCall: (call: IncomingCall) => void;
  clearIncomingCall: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
  incomingCall: null,
  setIncomingCall: (call) => set({ incomingCall: call }),
  clearIncomingCall: () => set({ incomingCall: null }),
}));
