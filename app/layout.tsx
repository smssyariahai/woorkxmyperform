import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'WOORK — Omnichannel CRM & Customer Management Platform',
  description:
    'Kelola WhatsApp, Instagram, Facebook, lead, follow up, dan customer relationship dalam satu workspace.',
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
