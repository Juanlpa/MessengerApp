'use client';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4">
      <div className="w-full max-w-[396px]">
        {/* Logo and Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <svg viewBox="0 0 36 36" className="w-[60px] h-[60px]" fill="url(#messenger-gradient)">
              <defs>
                <linearGradient id="messenger-gradient" x1="18.06" y1="0" x2="18.06" y2="35.91" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#00B2FF"/>
                  <stop offset="1" stopColor="#006AFF"/>
                </linearGradient>
              </defs>
              <path d="M18 0C8.06 0 0 7.63 0 17.51c0 5.6 2.76 10.57 7.02 13.82.28.21.46.54.49.88l.34 3.23c.09.84.97 1.34 1.71.95l3.52-1.85c.29-.15.63-.2.95-.12 1.3.32 2.65.49 4.02.49 9.94 0 18-7.63 18-17.51C36 7.63 27.94 0 18 0zm1.09 23.36-2.91-3.13a1.73 1.73 0 0 0-2.33-.18l-4.75 3.55c-.53.39-1.22-.26-.85-.82l5.12-7.85c.61-.94 1.84-1.27 2.81-.75l2.91 3.13c.63.67 1.68.73 2.33.18l4.75-3.55c.53-.39 1.22.26.85.82l-5.12 7.85c-.61.94-1.84 1.28-2.81.75z"/>
            </svg>
          </div>
          <h1 className="text-[28px] leading-8 font-normal text-[#1c1e21]">Messenger</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg shadow-[0_2px_4px_rgba(0,0,0,0.1),0_8px_16px_rgba(0,0,0,0.1)] p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
