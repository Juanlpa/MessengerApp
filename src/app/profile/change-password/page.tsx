'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { prepareChangePassword } from '@/lib/auth/client-auth';

export default function ChangePasswordPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');

    if (!token || !user) {
      setMessage('Sesión inválida.');
      return;
    }
    if (newPassword.length < 8) {
      setMessage('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      // 1. Obtener salt actual del servidor
      const saltRes = await fetch('/api/auth/salt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      if (!saltRes.ok) {
        setMessage('No se pudo obtener tu salt.');
        setLoading(false);
        return;
      }
      const { salt: currentSalt } = await saltRes.json();

      // 2. Derivar hashes en cliente (la contraseña NUNCA sale del navegador)
      const { currentPasswordHash, newPasswordHash, newSalt } = prepareChangePassword(
        currentPassword,
        newPassword,
        currentSalt
      );

      // 3. Enviar solo hashes + nueva salt al servidor
      const res = await fetch('/api/auth/change-password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPasswordHash, newPasswordHash, newSalt }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setMessage(data.message || 'Contraseña actualizada.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        // Forzar re-login (el servidor ya invalidó todas las sesiones)
        setTimeout(() => {
          logout();
          router.push('/auth/login');
        }, 2000);
      } else {
        setMessage(data.error || 'Error al cambiar la contraseña.');
      }
    } catch {
      setMessage('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-gray-900 flex justify-center items-center px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 w-full max-w-md p-8 rounded-xl shadow"
      >
        <h1 className="text-2xl font-bold mb-6 text-center dark:text-white">
          Cambiar contraseña
        </h1>

        <input
          type="password"
          placeholder="Contraseña actual"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full border dark:border-gray-700 dark:bg-gray-700 dark:text-white p-3 rounded mb-4"
          required
          autoComplete="current-password"
        />

        <input
          type="password"
          placeholder="Nueva contraseña (mín. 8 caracteres)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full border dark:border-gray-700 dark:bg-gray-700 dark:text-white p-3 rounded mb-4"
          required
          minLength={8}
          autoComplete="new-password"
        />

        <input
          type="password"
          placeholder="Confirmar nueva contraseña"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full border dark:border-gray-700 dark:bg-gray-700 dark:text-white p-3 rounded mb-4"
          required
          minLength={8}
          autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={loading || success}
          className="w-full bg-[#0084ff] text-white p-3 rounded disabled:opacity-50"
        >
          {loading ? 'Actualizando...' : success ? '¡Listo!' : 'Cambiar contraseña'}
        </button>

        {message && (
          <p
            className={`text-center mt-4 ${
              success ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
