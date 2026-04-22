import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Messenger",
  description: "Messenger Clone E2E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans text-[#050505] bg-white">{children}</body>
    </html>
  );
}
