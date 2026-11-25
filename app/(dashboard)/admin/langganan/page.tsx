import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import SubscriptionMonitoringClient from '@/components/super/SubscriptionMonitoringClient';

export const metadata = { title: 'Pemantauan Langganan — Administrator Pusat' };

/**
 * Modul Pemantauan Langganan Master (Fase 5 §7.7).
 * Server page, guard PLATFORM_TENANTS_VIEW (pola halaman detail tenant Fase 4).
 * Data dimuat client-side oleh SubscriptionMonitoringClient dari
 * GET /api/super/subscriptions/monitoring + settings.
 */
export default async function SubscriptionMonitoringPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_TENANTS_VIEW') && !pp.has('PLATFORM_TENANTS_MANAGE')) redirect('/dashboard');
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Pemantauan Langganan</h1>
        <p className="text-sm text-muted">
          Status langganan semua tenant, log tindakan otomatis §7.7, invoice perpanjangan,
          dan tindakan manual Master.
        </p>
      </div>
      <SubscriptionMonitoringClient />
    </div>
  );
}
