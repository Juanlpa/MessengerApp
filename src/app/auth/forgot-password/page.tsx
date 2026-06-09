'use client';

import { useState } from 'react';
import Link from 'next/link';
import { obfuscateEmail } from '@/lib/auth/email-obfuscation';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setMsg('Ingresa un correo.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: obfuscateEmail(email) }),
      });
      const data = await res.json();
      setMsg(data.message || data.error || 'Listo.');
    } catch {
      setMsg('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-[20px] leading-6 font-semibold text-[#1c1e21] dark:text-white mb-2 text-center">
        Recuperar contraseña
      </h2>
      <p className="text-sm text-[#65676b] dark:text-gray-400 mb-5 text-center">
        Te enviaremos un enlace para restablecer tu contraseña.
      </p>

      <form onSubmit={handleSend} className="space-y-3">
        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-[14px] rounded-[6px] bg-white dark:bg-gray-800 border border-[#dddfe2] dark:border-gray-700 text-[#1c1e21] dark:text-white placeholder-[#90949c] dark:placeholder-gray-400 focus:outline-none focus:border-[#1877f2] focus:ring-1 focus:ring-[#1877f2] transition-colors text-[17px]"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 mt-2 rounded-[6px] bg-[#1877f2] hover:bg-[#166fe5] text-white font-bold disabled:opacity-50"
        >
          {loading ? 'Enviando...' : 'Enviar enlace'}
        </button>

        {msg && (
          <div className="p-2 text-[#1877f2] dark:text-blue-400 text-sm text-center">
            {msg}
          </div>
        )}
      </form>

      <div className="mt-4 pt-4 border-t border-[#dadde1] dark:border-gray-700 text-center">
        <Link href="/auth/login" className="inline-block text-[#1877f2] hover:underline font-medium">
          ← Volver a iniciar sesión
        </Link>
      </div>
    </div>
  );
}
