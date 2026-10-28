import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LoL Team Builder",
  description: "Arma equipos balanceados de League of Legends según el True MMR de cada jugador",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col font-sans">
        {children}
        <footer className="border-t border-white/5 px-4 py-6 text-center text-sm text-slate-500">
          Hecho para los <span className="font-semibold text-amber-300">Aquehora</span>
        </footer>
      </body>
    </html>
  );
}
