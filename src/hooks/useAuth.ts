/**
 * useAuth hook — maneja login, registro, y restauración de sesión
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { prepareRegistration, prepareLogin } from '@/lib/auth/client-auth';

export function useAuth() {
  const { user, token, isLoading, setAuth, setKeys, logout, setLoading } = useAuthStore();

  // Restaurar sesión al montar
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (savedToken && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setAuth(parsedUser, savedToken);
      } catch {
        logout();
      }
    } else {
      setLoading(false);
    }
  }, [setAuth, logout, setLoading]);

  const register = useCallback(async (
    email: string,
    username: string,
    password: string
  ) => {
    // Cripto del lado del cliente
    const { data, secrets } = prepareRegistration(email, username, password);

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

    // Guardar claves en memoria
    setKeys(secrets.dhKeyPair.privateKey, secrets.passwordDerivedKey);

    return loginResult;
  }, [setKeys]);

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
    setKeys(new Uint8Array(0), passwordDerivedKey); // DH key se cargará de BD

    return newUser;
  }, [setAuth, setKeys]);

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
