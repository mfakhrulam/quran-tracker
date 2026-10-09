import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracker Hafalan Al-Qur'an",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
