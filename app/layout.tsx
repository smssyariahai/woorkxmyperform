import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'WOORK — Omnichannel CRM & Customer Management Platform',
  description:
    'Kelola WhatsApp, Instagram, Facebook, lead, follow up, dan customer relationship dalam satu workspace.',
};

// viewport-fit=cover: aktifkan safe-area iOS (notch / home indicator) —
// env(safe-area-inset-*) jadi bernilai nyata dan halaman /kantor (dan
// halaman lain) bisa memberi jarak dari indikator home. Tanpa ini,
// env(...) = 0 dan konten bisa duduk di bawah home indicator.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 3500 }} />
      </body>
    </html>
  );
}
