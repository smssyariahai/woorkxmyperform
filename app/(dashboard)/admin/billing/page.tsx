import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import BillingClient from '@/components/super/BillingClient';

export const metadata = { title: 'Billing & Rekonsiliasi — Administrator Pusat' };

/**
 * Modul Billing & Rekonsiliasi Master (Fase 6 §9.5).
 * Server page, guard PLATFORM_BILLING_VIEW (pola halaman Pemantauan Langganan
 * Fase 5). Data dimuat client-side oleh BillingClient dari
 * GET /api/super/billing/* + /api/super/subscriptions/*.
 */
export default async function BillingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_BILLING_VIEW') && !pp.has('PLATFORM_BILLING_MANAGE')) redirect('/dashboard');
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Billing &amp; Rekonsiliasi</h1>
        <p className="text-sm text-muted">
          Rekening penampung, pencocokan mutasi rekening koran (CSV), antrean
          rekonsiliasi manual, invoice nego, dan laporan pembayaran tenant.
        </p>
      </div>
      <BillingClient />
    </div>
  );
}
