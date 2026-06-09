/**
 * Auth Store — Zustand store para estado de autenticación
 */

import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  username: string;
  role?: 'user' | 'admin';
}

interface AuthState {
  user: User | null;
  token: string | null;
  // DH private key en memoria (NUNCA persistir en claro)
  dhPrivateKey: Uint8Array | null;
  // Clave derivada del password (para descifrar shared keys)
  passwordDerivedKey: Uint8Array | null;
  // Clave de almacenamiento derivada de pbkdf2(user.id, 'storage-salt', 1000, 32)
  // Se calcula una sola vez al login y se reutiliza en toda la sesión
  storageKey: Uint8Array | null;
  isLoading: boolean;

  setAuth: (user: User, token: string) => void;
  setKeys: (dhPrivateKey: Uint8Array, passwordDerivedKey: Uint8Array, storageKey?: Uint8Array) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  dhPrivateKey: null,
  passwordDerivedKey: null,
  storageKey: null,
  isLoading: true,

  setAuth: (user, token) => {
    // Guardar token en localStorage para persistencia de sesión
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
    }
    set({ user, token, isLoading: false });
  },

  setKeys: (dhPrivateKey, passwordDerivedKey, storageKey) => {
    set({ dhPrivateKey, passwordDerivedKey, ...(storageKey ? { storageKey } : {}) });
  },

  logout: () => {
    // Revocar el token en el servidor (best-effort, no bloquea el logout local).
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token) {
        // fetch sin await — el logout local ocurre de inmediato; la revocación
        // viaja en background. keepalive permite que complete aunque se navegue.
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      }
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
    set({
      user: null,
      token: null,
      dhPrivateKey: null,
      passwordDerivedKey: null,
      storageKey: null,
      isLoading: false,
    });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
