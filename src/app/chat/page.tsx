'use client';

export default function ChatPage() {
  return (
    <div className="flex-1 flex items-center justify-center bg-white">
      <div className="text-center text-[#65676b]">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 text-[#d8dadf]">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p className="text-lg font-medium">Selecciona una conversación</p>
        <p className="text-[15px] mt-1">o inicia una nueva con el botón +</p>
      </div>
    </div>
  );
}
