import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  derivePaymentStatus,
  getAutomationSettings,
  getDueAt,
  shapeAutomationSettings,
} from '@/lib/tenant/subscription-automation';

export const dynamic = 'force-dynamic';

/** Ringkasan paket dari snapshot (dipakai tabel pemantauan). monthlyPrice =
 *  jumlah harga bulanan komponen; null bila ada harga khusus. */
function packageSummaryFromSnapshot(snapshotJson: string): {
  userTierName: string | null;
  storageTierName: string | null;
  moduleNames: string[];
  monthlyPrice: number | null;
} {
  let snap: any = null;
  try {
    snap = JSON.parse(snapshotJson);
  } catch {
    snap = null;
  }
  if (!snap || typeof snap !== 'object') {
    return {
      userTierName: null,
      storageTierName: null,
      moduleNames: [],
      monthlyPrice: null,
    };
  }
  const parts: Array<number | null> = [];
  if (snap.userTier && typeof snap.userTier.monthlyPrice === 'number') {
    parts.push(snap.userTier.monthlyPrice);
  } else if (snap.userTier) {
    parts.push(null);
  }
  if (snap.storageTier && typeof snap.storageTier.monthlyPrice === 'number') {
    parts.push(snap.storageTier.monthlyPrice);
  } else if (snap.storageTier) {
    parts.push(null);
  }
  const modules: Array<{ name: string; monthlyPrice?: number }> =
    Array.isArray(snap.modules) ? snap.modules : [];
  for (const m of modules) {
    parts.push(typeof m.monthlyPrice === 'number' ? m.monthlyPrice : null);
  }
  return {
    userTierName: snap.userTier?.name ?? null,
    storageTierName: snap.storageTier?.name ?? null,
    moduleNames: modules.map((m) => m.name).filter(Boolean),
    monthlyPrice: parts.some((p) => p === null)
      ? null
      : parts.reduce<number>((a, b) => a + (b ?? 0), 0),
  };
}

/** GET /api/super/subscriptions/monitoring — pemantauan langganan Master.
 *  Guard: PLATFORM_TENANTS_VIEW. Tiga query kolektif (Subscription+Tenant,
 *  invoice Belum Dibayar, log otomasi terbaru) lalu gabung di memori —
 *  JANGAN N+1 per tenant. */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const now = new Date();
    const [subs, invoices, logs, settings] = await Promise.all([
      masterPrisma.subscription.findMany({
        include: { tenant: true },
        orderBy: { createdAt: 'asc' },
      }),
      masterPrisma.subscriptionInvoice.findMany({
        where: { status: 'Belum Dibayar' },
        orderBy: { issuedAt: 'desc' },
      }),
      masterPrisma.subscriptionAutoActionLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      getAutomationSettings(),
    ]);
    const unpaidByTenant = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      const list = unpaidByTenant.get(inv.tenantId) ?? [];
      list.push(inv);
      unpaidByTenant.set(inv.tenantId, list);
    }
    const lastLogByTenant = new Map<string, (typeof logs)[number]>();
    for (const log of logs) {
      if (!lastLogByTenant.has(log.tenantId)) {
        lastLogByTenant.set(log.tenantId, log);
      }
    }
    const items = subs.map((sub) => {
      const payment = derivePaymentStatus(
        sub,
        unpaidByTenant.get(sub.tenantId) ?? [],
      );
      const graceDaysRemaining =
        sub.lifecycleStatus === 'MENUNGGAK' && sub.graceEndsAt
          ? Math.ceil(
              (sub.graceEndsAt.getTime() - now.getTime()) / 86400000,
            )
          : null;
      const last = lastLogByTenant.get(sub.tenantId) ?? null;
      return {
        tenantId: sub.tenantId,
        tenantCode: sub.tenant.tenantCode,
        companyName: sub.tenant.companyName,
        lifecycleStatus: sub.lifecycleStatus,
        packageSummary: packageSummaryFromSnapshot(sub.packageSnapshotJson),
        dueAt: getDueAt(sub),
        paymentStatus: payment,
        graceDaysRemaining,
        // Deposit AI: Bab 6.2 belum diterima — JANGAN mengarang saldo
        // (pola tokenUsage Command Center: available:false + alasan).
        aiDeposit: {
          available: false,
          reason: 'Deposit AI belum tersedia — Bab 6.2 belum diterima',
        },
        lastAutoAction: last
          ? { action: last.action, detail: last.detail, createdAt: last.createdAt }
          : null,
      };
    });
    return apiOk({
      items,
      settings: shapeAutomationSettings(settings),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pemantauan langganan.', 500);
  }
}
