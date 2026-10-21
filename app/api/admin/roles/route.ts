import { prisma } from '@/lib/db';
import { requirePermission, getUserPermissions, assertCanGrant } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { PERMISSION_CATALOG, type PermissionKey } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/** GET /api/admin/roles — daftar role kantor beserta jumlah pengguna. */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ROLES_VIEW', req);
    const roles = await prisma.role.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return apiOk(
      roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        memberCount: r._count.memberships,
        permissions: r.permissions.map((rp) => rp.permission.key),
      }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat role.', 500);
  }
}

/** POST /api/admin/roles — buat role baru. Body: { name, description?, permissions: string[], template? } */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('ROLES_CREATE', req);
    const body = await req.json();
    const name = String(body?.name || '').trim();
    if (!name) return apiErr('Nama role wajib diisi.', 422);
    if (/^(OWNER|ADMIN)$/i.test(name)) {
      // Nama role sistem inti dilindungi agar tidak diduplikasi membingungkan
      const exists = await prisma.role.findFirst({
        where: { organizationId: ctx.organizationId, name: { equals: name, mode: 'insensitive' } },
      });
      if (exists) return apiErr('Role dengan nama tersebut sudah ada.', 409);
    }

    const validKeys = new Set(PERMISSION_CATALOG.map((p) => p.key));
    const permissions = [...new Set((body?.permissions ?? []) as string[])].filter((k) =>
      validKeys.has(k as PermissionKey)
    );

    // Anti-eskalasi
    const granterKeys = await getUserPermissions(ctx);
    assertCanGrant(granterKeys, permissions);

    const role = await prisma.role.create({
      data: {
        organizationId: ctx.organizationId,
        name,
        description: body?.description ? String(body.description).trim() : null,
        isSystem: false,
      },
    });

    if (permissions.length > 0) {
      const permRows = await prisma.permission.findMany({ where: { key: { in: permissions } } });
      await prisma.rolePermission.createMany({
        data: permRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_ROLE',
      module: 'ROLES',
      description: `Membuat role "${name}" dengan ${permissions.length} permission`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: role.id, name: role.name }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if ((e as any)?.code === 'P2002') return apiErr('Role dengan nama tersebut sudah ada.', 409);
    return apiErr('Gagal membuat role.', 500);
  }
}
