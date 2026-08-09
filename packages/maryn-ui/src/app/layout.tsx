import "@/app/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Maryn",
  description: "Project context dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        <nav className="border-b border-zinc-800 px-6 py-3 flex items-center gap-6">
          <span className="font-semibold text-lg">Maryn</span>
          <a href="/" className="text-sm text-zinc-400 hover:text-zinc-100">
            Overview
          </a>
          <a href="/timeline" className="text-sm text-zinc-400 hover:text-zinc-100">
            Timeline
          </a>
          <a href="/decisions" className="text-sm text-zinc-400 hover:text-zinc-100">
            Decisions
          </a>
          <a href="/chat" className="text-sm text-zinc-400 hover:text-zinc-100">
            Chat
          </a>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
