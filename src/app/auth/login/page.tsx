'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cryptoStatus, setCryptoStatus] = useState('');
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      setCryptoStatus('Obteniendo salt del servidor...');
      await new Promise(r => setTimeout(r, 50));

      setCryptoStatus('Derivando clave con PBKDF2 (100,000 iteraciones)...');
      await new Promise(r => setTimeout(r, 50));

      await login(email, password);

      setCryptoStatus('¡Login exitoso! Redirigiendo...');
      router.push('/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
      setCryptoStatus('');
    }
  };

  return (
    <div>
      <h2 className="text-[20px] leading-6 font-semibold text-[#1c1e21] mb-5 text-center">Iniciar sesión</h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-[14px] rounded-[6px] bg-white border border-[#dddfe2] text-[#1c1e21] placeholder-[#90949c] focus:outline-none focus:border-[#1877f2] focus:ring-1 focus:ring-[#1877f2] transition-colors text-[17px]"
            placeholder="Correo electrónico"
          />
        </div>

        <div>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-[14px] rounded-[6px] bg-white border border-[#dddfe2] text-[#1c1e21] placeholder-[#90949c] focus:outline-none focus:border-[#1877f2] focus:ring-1 focus:ring-[#1877f2] transition-colors text-[17px]"
            placeholder="Contraseña"
          />
        </div>

        {error && (
          <div className="p-3 text-[#f02849] text-sm text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 mt-2 rounded-[6px] bg-[#1877f2] hover:bg-[#166fe5] text-white font-bold text-[20px] leading-[24px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </button>
      </form>

      <div className="mt-4 pt-4 border-t border-[#dadde1] text-center">
        <Link href="/auth/register" className="inline-block px-4 py-3 bg-[#42b72a] hover:bg-[#36a420] text-white font-bold text-[17px] rounded-[6px] transition-colors mt-2">
          Crear cuenta nueva
        </Link>
      </div>
    </div>
  );
}
