import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/super/stats — statistik global untuk dashboard Administrator Pusat. */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const [offices, activeOffices, users, memberships, auditToday] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.membership.count({ where: { status: 'ACTIVE' } }),
      prisma.auditLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      }),
    ]);
    const recentOffices = await prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { _count: { select: { memberships: true } } },
    });
    return apiOk({
      offices,
      activeOffices,
      users,
      activeMemberships: memberships,
      auditToday,
      recentOffices: recentOffices.map((o) => ({
        id: o.id,
        name: o.name,
        isActive: o.isActive,
        userCount: o._count.memberships,
        createdAt: o.createdAt,
      })),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat statistik.', 500);
  }
}
