/**
 * Auth Store — Zustand store para estado de autenticación
 */

import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  username: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  // DH private key en memoria (NUNCA persistir en claro)
  dhPrivateKey: Uint8Array | null;
  // Clave derivada del password (para descifrar shared keys)
  passwordDerivedKey: Uint8Array | null;
  isLoading: boolean;

  setAuth: (user: User, token: string) => void;
  setKeys: (dhPrivateKey: Uint8Array, passwordDerivedKey: Uint8Array) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  dhPrivateKey: null,
  passwordDerivedKey: null,
  isLoading: true,

  setAuth: (user, token) => {
    // Guardar token en localStorage para persistencia de sesión
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
    }
    set({ user, token, isLoading: false });
  },

  setKeys: (dhPrivateKey, passwordDerivedKey) => {
    set({ dhPrivateKey, passwordDerivedKey });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
    set({
      user: null,
      token: null,
      dhPrivateKey: null,
      passwordDerivedKey: null,
      isLoading: false,
    });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
