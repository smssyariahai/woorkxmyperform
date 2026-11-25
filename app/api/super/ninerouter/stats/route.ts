// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getNineRouterConfig } from '@/lib/bot/ninerouter';

export const dynamic = 'force-dynamic';

/** GET /api/super/ninerouter/stats — ringkasan global + per owner */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const cfg = await getNineRouterConfig();

    const [usageAgg, byOrg, errors, pendingTopups] = await Promise.all([
      prisma.botUsage.aggregate({
        where: { status: 'CHARGED' },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.botUsage.groupBy({
        by: ['organizationId'],
        where: { status: 'CHARGED' },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.botUsage.findMany({
        where: { status: { in: ['FAILED', 'REFUNDED'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, organizationId: true, status: true, error: true, createdAt: true },
      }),
      prisma.topUpRequest.count({ where: { status: 'PENDING' } }),
    ]);

    const balances = await prisma.botConfig.findMany({
      select: { organizationId: true, creditBalance: true, organization: { select: { name: true } } },
      orderBy: { creditBalance: 'desc' },
    });

    const orgIds = [...new Set([...byOrg.map((b) => b.organizationId), ...errors.map((e) => e.organizationId), ...balances.map((b) => b.organizationId)])];
    const orgs = await prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    });
    const nameOf = (id: string) => orgs.find((o) => o.id === id)?.name ?? id.slice(0, 8);

    return apiOk({
      globalEnabled: cfg.enabled,
      model: cfg.model,
      pricePerReply: cfg.pricePerReply,
      totalCharged: usageAgg._count,
      totalRevenue: usageAgg._sum.amount ?? 0,
      pendingTopups,
      totalTenantBalance: balances.reduce((a, b) => a + b.creditBalance, 0),
      tenantBalances: balances.map((b) => ({
        organizationId: b.organizationId,
        organizationName: nameOf(b.organizationId),
        balance: b.creditBalance,
      })),
      byOwner: byOrg.map((b) => ({
        organizationId: b.organizationId,
        organizationName: nameOf(b.organizationId),
        replies: b._count,
        spent: b._sum.amount ?? 0,
        balance: balances.find((x) => x.organizationId === b.organizationId)?.creditBalance ?? 0,
      })),
      recentErrors: errors.map((e) => ({
        id: e.id,
        organizationName: nameOf(e.organizationId),
        status: e.status,
        error: e.error,
        createdAt: e.createdAt,
      })),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat statistik.', 500);
  }
}
