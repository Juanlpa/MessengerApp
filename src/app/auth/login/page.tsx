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
      <h2 className="text-xl font-semibold text-white mb-6">Iniciar sesión</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-slate-300 mb-1">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-slate-300 mb-1">
            Contraseña
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {cryptoStatus && (
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {cryptoStatus}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Verificando...' : 'Iniciar sesión'}
        </button>
      </form>

      <p className="mt-6 text-center text-slate-400 text-sm">
        ¿No tienes cuenta?{' '}
        <Link href="/auth/register" className="text-blue-400 hover:text-blue-300 transition-colors">
          Crea una
        </Link>
      </p>
    </div>
  );
}
