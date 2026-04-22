'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cryptoStatus, setCryptoStatus] = useState('');
  const router = useRouter();
  const { register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setLoading(true);
    try {
      setCryptoStatus('Generando salt aleatorio...');
      await new Promise(r => setTimeout(r, 100));

      setCryptoStatus('Derivando clave con PBKDF2 (100,000 iteraciones)...');
      await new Promise(r => setTimeout(r, 100));

      setCryptoStatus('Generando par de claves Diffie-Hellman (2048-bit)...');
      await new Promise(r => setTimeout(r, 100));

      await register(email, username, password);

      setCryptoStatus('¡Registro exitoso! Redirigiendo...');
      router.push('/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setLoading(false);
      setCryptoStatus('');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Crear cuenta</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="register-email" className="block text-sm font-medium text-slate-300 mb-1">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <label htmlFor="register-username" className="block text-sm font-medium text-slate-300 mb-1">
            Username
          </label>
          <input
            id="register-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            pattern="[a-zA-Z0-9_]{3,30}"
            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            placeholder="mi_usuario"
          />
        </div>

        <div>
          <label htmlFor="register-password" className="block text-sm font-medium text-slate-300 mb-1">
            Contraseña
          </label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label htmlFor="register-confirm" className="block text-sm font-medium text-slate-300 mb-1">
            Confirmar contraseña
          </label>
          <input
            id="register-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {loading ? 'Procesando cripto...' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-6 text-center text-slate-400 text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 transition-colors">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
