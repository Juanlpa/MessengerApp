'use client';

export default function ChatPage() {
  return (
    <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
      <div className="text-center text-[#65676b] dark:text-gray-400">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 text-[#d8dadf] dark:text-gray-700">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p className="text-lg font-medium text-gray-800 dark:text-gray-200">Selecciona una conversación</p>
        <p className="text-[15px] mt-1">o inicia una nueva con el botón +</p>
      </div>
    </div>
  );
}
