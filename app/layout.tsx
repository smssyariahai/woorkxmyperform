import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import { TenantProvisioningGuard } from '@/components/auth/TenantProvisioningGuard';
import { auth } from '@/lib/auth';
import { masterPrisma } from '@/lib/tenant/master';
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Backstop LAPISAN D (database-per-tenant): bila sesi membawa tenantCode,
  // cek status tenant di master. Tenant yang belum ACTIVE tidak boleh masuk
  // workspace — navigasi ke /provisioning dilakukan guard client di bawah
  // (lihat TenantProvisioningGuard: layout server tidak bisa membaca
  // pathname, dan redirect() buta akan loop di /provisioning).
  // - User legacy (tanpa tenantCode) dilewati TANPA query master sama sekali.
  // - Bila auth()/master gagal (mis. master DB down), backstop fail-open:
  //   halaman tetap dirender; jalur login + API tetap jadi penjaga.
  // CATATAN: auth() di root layout membuat layout ini dinamis, jadi halaman
  // publik (/, /pricing, dsb.) tidak lagi di-prerender statis. Itu harga
  // backstop di level ini; sebagian besar halaman aplikasi memang sudah
  // dinamis (middleware auth + data per-user).
  let guardProps: { tenantCode: string; tenantStatus: string | null; loginDoor: string } | null = null;
  try {
    const session = await auth();
    const tenantCode = (session?.user as any)?.tenantCode as string | undefined;
    if (tenantCode) {
      const tenant = await masterPrisma.tenant.findUnique({
        where: { tenantCode },
        select: { tenantStatus: true },
      });
      guardProps = {
        tenantCode,
        tenantStatus: tenant?.tenantStatus ?? null,
        loginDoor: ((session?.user as any)?.loginDoor as string | undefined) ?? 'office',
      };
    }
  } catch {
    /* backstop gagal -> fail-open, jangan blokir render */
  }

  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        {guardProps ? <TenantProvisioningGuard {...guardProps} /> : null}
        <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 3500 }} />
      </body>
    </html>
  );
}
