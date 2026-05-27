/**
 * useAuth hook — maneja login, registro, y restauración de sesión
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { prepareRegistration, prepareLogin } from '@/lib/auth/client-auth';
import { pbkdf2 } from '@/lib/crypto/pbkdf2';

export function useAuth() {
  const { user, token, isLoading, setAuth, setKeys, logout, setLoading } = useAuthStore();

  // Restaurar sesión al montar
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (savedToken && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        // Calcular storageKey antes de setAuth para que esté disponible
        // en el mismo render cycle y no cause "storageKey not available"
        const storageKey = pbkdf2(parsedUser.id, 'storage-salt', 1000, 32);
        setAuth(parsedUser, savedToken);
        setKeys(new Uint8Array(0), new Uint8Array(0), storageKey);
      } catch {
        logout();
      }
    } else {
      setLoading(false);
    }
  }, [setAuth, setKeys, logout, setLoading]);

  const loginFn = useCallback(async (email: string, password: string) => {
    // 1. Pedir salt al servidor
    const saltRes = await fetch('/api/auth/salt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!saltRes.ok) throw new Error('Failed to get salt');
    const { salt } = await saltRes.json();

    // 2. PBKDF2 en cliente
    const { passwordHash, passwordDerivedKey } = prepareLogin(password, salt);

    // 3. Enviar hash al servidor
    const loginRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, passwordHash }),
    });

    if (!loginRes.ok) {
      const err = await loginRes.json();
      throw new Error(err.error || 'Login failed');
    }

    const { token: newToken, user: newUser } = await loginRes.json();
    setAuth(newUser, newToken);

    // Calcular storageKey una sola vez y cachear en Zustand
    const storageKey = pbkdf2(newUser.id, 'storage-salt', 1000, 32);
    setKeys(new Uint8Array(0), passwordDerivedKey, storageKey); // DH key se cargará de BD

    return newUser;
  }, [setAuth, setKeys]);

  const register = useCallback(async (
    email: string,
    username: string,
    password: string
  ) => {
    // Cripto del lado del cliente (async: DH key pair se genera en Web Worker)
    const { data, secrets } = await prepareRegistration(email, username, password);

    // Enviar al servidor (password NUNCA sale en claro)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Registration failed');
    }

    // Auto-login después de registro
    const loginResult = await loginFn(email, password);

    // Guardar claves en memoria (storageKey se calcula en loginFn)
    const storageKey = pbkdf2(loginResult.id, 'storage-salt', 1000, 32);
    setKeys(secrets.dhKeyPair.privateKey, secrets.passwordDerivedKey, storageKey);

    return loginResult;
  }, [setKeys, loginFn]);

  return {
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    register,
    login: loginFn,
    logout,
  };
}
