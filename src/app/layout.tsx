import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'sosmed244 — Manajemen Konten Sosial Media',
    template: '%s | sosmed244',
  },
  description:
    'Kelola, setujui, dan kirim konten ke TikTok & Instagram dalam satu alur kerja.',
  applicationName: 'sosmed244',
  // PWA sederhana: dipasang di HP tanpa perlu aplikasi terpisah
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'sosmed244' },
};

export const viewport: Viewport = {
  themeColor: '#102a4c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
