import { prisma } from '@/lib/db';
import { requireAuth, getUserPermissions } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/admin/dashboard — ringkasan kantor untuk Admin Kantor. */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const keys = await getUserPermissions(ctx);
    const allowed =
      ctx.isSuperAdmin ||
      ['USERS_VIEW', 'ROLES_VIEW', 'DEPARTMENTS_VIEW', 'SETTINGS_MANAGE'].some((k) => keys.has(k));
    if (!allowed) return apiErr('Anda tidak memiliki akses ke halaman ini.', 403);

    const orgId = ctx.organizationId;
    const [users, activeUsers, roles, departments, recentAuditRaw, byRole] = await Promise.all([
      prisma.membership.count({ where: { organizationId: orgId } }),
      prisma.membership.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      prisma.role.count({ where: { organizationId: orgId } }),
      prisma.department.count({ where: { organizationId: orgId } }),
      // AuditLog TIDAK punya relasi `user` di tenant client — nama user
      // diambil terpisah dari mirror User.
      prisma.auditLog.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      prisma.membership.groupBy({
        by: ['roleId'],
        where: { organizationId: orgId, status: 'ACTIVE' },
        _count: { roleId: true },
      }),
    ]);
    const auditUserIds = [
      ...new Set(recentAuditRaw.map((a) => a.userId).filter((id): id is string => !!id)),
    ];
    const auditUsers = auditUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: auditUserIds } },
          select: { id: true, name: true },
        })
      : [];
    const auditUserById = new Map(auditUsers.map((u) => [u.id, u]));
    const recentAudit = recentAuditRaw.map((a) => ({
      ...a,
      user: a.userId ? (auditUserById.get(a.userId) ?? null) : null,
    }));
    const roleNames = await prisma.role.findMany({
      where: { id: { in: byRole.map((b) => b.roleId) } },
      select: { id: true, name: true },
    });
    const roleMap = new Map(roleNames.map((r) => [r.id, r.name]));

    return apiOk({
      users,
      activeUsers,
      roles,
      departments,
      byRole: byRole.map((b) => ({ role: roleMap.get(b.roleId) ?? '?', count: b._count.roleId })),
      recentAudit: recentAudit.map((a) => ({
        id: a.id,
        action: a.action,
        description: a.description,
        actor: a.user?.name ?? 'Sistem',
        createdAt: a.createdAt,
      })),
      permissions: [...keys],
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat dashboard kantor.', 500);
  }
}
