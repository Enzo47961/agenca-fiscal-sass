import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agência Fiscal — Faturamento e NFS-e",
  description: "Emissão resiliente de NFS-e com reprocessamento automático.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
