'use client';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Messenger Seguro</h1>
          <p className="text-slate-400 text-sm mt-1">Cifrado E2E desde cero</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/50 backdrop-blur-md rounded-2xl border border-slate-700/50 shadow-2xl p-8">
          {children}
        </div>

        {/* Security badge */}
        <div className="mt-4 flex items-center justify-center gap-2 text-slate-500 text-xs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>AES-256 + HMAC-SHA256 + Diffie-Hellman 2048-bit</span>
        </div>
      </div>
    </div>
  );
}
