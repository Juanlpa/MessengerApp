'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { prepareResetPassword } from '@/lib/auth/client-auth';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (!token) {
      setMessage('Token inválido o ausente.');
      return;
    }
    if (password.length < 8) {
      setMessage('La contraseña debe tener mínimo 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      // Derivar hash + nueva salt en cliente. Contraseña NUNCA sale del navegador.
      const { newPasswordHash, newSalt } = prepareResetPassword(password);

      const res = await fetch('/api/auth/reset-password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPasswordHash, newSalt }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setMessage(data.message || 'Contraseña actualizada.');
        setTimeout(() => router.push('/auth/login'), 2000);
      } else {
        setMessage(data.error || 'Error al restablecer contraseña.');
      }
    } catch {
      setMessage('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleReset}
      className="max-w-md mx-auto mt-20 p-6 border rounded-xl shadow bg-white dark:bg-gray-800"
    >
      <h1 className="text-2xl font-bold mb-5 dark:text-white">
        Restablecer contraseña
      </h1>

      <input
        type="password"
        placeholder="Nueva contraseña (mín. 8 caracteres)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border dark:border-gray-700 dark:bg-gray-700 dark:text-white p-3 w-full rounded mb-3"
        minLength={8}
        required
        autoComplete="new-password"
      />

      <input
        type="password"
        placeholder="Confirmar contraseña"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="border dark:border-gray-700 dark:bg-gray-700 dark:text-white p-3 w-full rounded mb-4"
        minLength={8}
        required
        autoComplete="new-password"
      />

      <button
        type="submit"
        disabled={loading || success}
        className="bg-blue-500 text-white p-3 w-full rounded disabled:opacity-50"
      >
        {loading ? 'Cambiando...' : success ? '¡Listo!' : 'Cambiar contraseña'}
      </button>

      {message && (
        <p
          className={`mt-4 text-center ${
            success ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto mt-20 p-5">Cargando…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
