'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!token) {
      setMessage('Token inválido');
      return;
    }

    if (password.length < 8) {
      setMessage('La contraseña debe tener mínimo 8 caracteres');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      setMessage(data.message || data.error);
    } catch {
      setMessage('Error de conexión');
    }

    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-5 border rounded">
      <h1 className="text-2xl mb-5">Restablecer contraseña</h1>

      <input
        type="password"
        placeholder="Nueva contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 w-full"
      />

      <button
        onClick={handleReset}
        disabled={loading}
        className="bg-blue-500 text-white p-2 mt-4 w-full"
      >
        {loading ? 'Cambiando...' : 'Cambiar contraseña'}
      </button>

      {message && <p className="mt-4">{message}</p>}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto mt-20 p-5">Cargando…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
