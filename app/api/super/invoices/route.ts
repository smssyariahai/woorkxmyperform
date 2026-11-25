// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/super/invoices — daftar seluruh invoice (?status= & q=). */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status')?.trim() ?? '';
    const q = searchParams.get('q')?.trim() ?? '';
    const where: any = {};
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { number: { contains: q, mode: 'insensitive' } },
        { organization: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const items = await prisma.invoice.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        items: { select: { moduleKey: true, description: true, amount: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return apiOk(
      items.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        billingCycle: inv.billingCycle,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        total: inv.total,
        dueDate: inv.dueDate,
        paidAt: inv.paidAt,
        paidNote: inv.paidNote,
        createdAt: inv.createdAt,
        organizationId: inv.organizationId,
        organizationName: inv.organization.name,
        items: inv.items,
        // OVERDUE dihitung saat tampil (status DB tetap PENDING sampai dibayar)
        isOverdue: inv.status === 'PENDING' && new Date(inv.dueDate).getTime() < Date.now(),
      }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat invoice.', 500);
  }
}
