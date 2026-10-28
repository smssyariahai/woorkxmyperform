import { prisma } from '@/lib/db';
import { requirePermission, getUserPermissions, assertCanGrant } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { PERMISSION_CATALOG, type PermissionKey } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

async function getRole(ctx: any, id: string) {
  return prisma.role.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { permissions: { include: { permission: true } } },
  });
}

/** PATCH /api/admin/roles/:id — edit nama/deskripsi/permission role. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ROLES_UPDATE', req);
    const role = await getRole(ctx, params.id);
    if (!role) return apiErr('Role tidak ditemukan.', 404);

    const body = await req.json();
    const updates: any = {};
    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return apiErr('Nama role tidak boleh kosong.', 422);
      // Role sistem inti tidak boleh diganti namanya
      if (role.isSystem && ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT', 'VIEWER'].includes(role.name)) {
        if (name !== role.name) return apiErr('Nama role sistem tidak dapat diubah.', 409);
      }
      updates.name = name;
    }
    if (body?.description !== undefined) {
      updates.description = String(body.description).trim() || null;
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updates).length > 0) {
        await tx.role.update({ where: { id: role.id }, data: updates });
      }
      if (Array.isArray(body?.permissions)) {
        const needsManage = await getUserPermissions(ctx);
        if (!needsManage.has('PERMISSIONS_MANAGE') && !needsManage.has('*')) {
          throw apiErr('Anda tidak memiliki akses PERMISSIONS_MANAGE.', 403);
        }
        const validKeys = new Set(PERMISSION_CATALOG.map((p) => p.key));
        const permissions = [...new Set(body.permissions as string[])].filter(
          (k) => validKeys.has(k as PermissionKey) && !k.startsWith('PLATFORM_')
        );
        // Anti-eskalasi
        assertCanGrant(needsManage, permissions);

        const permRows = await tx.permission.findMany({ where: { key: { in: permissions } } });
        const wantIds = new Set(permRows.map((p) => p.id));
        const existing = await tx.rolePermission.findMany({
          where: { roleId: role.id },
          select: { permissionId: true },
        });
        const haveIds = new Set(existing.map((r) => r.permissionId));
        for (const pid of wantIds) {
          if (!haveIds.has(pid)) {
            await tx.rolePermission.create({ data: { roleId: role.id, permissionId: pid } });
          }
        }
        for (const pid of haveIds) {
          if (!wantIds.has(pid)) {
            await tx.rolePermission.delete({
              where: { roleId_permissionId: { roleId: role.id, permissionId: pid } },
            });
          }
        }
      }
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_ROLE',
      module: 'ROLES',
      description: `Mengedit role "${role.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: role.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if ((e as any)?.code === 'P2002') return apiErr('Role dengan nama tersebut sudah ada.', 409);
    return apiErr('Gagal mengedit role.', 500);
  }
}

/** DELETE /api/admin/roles/:id — hapus role (bukan role sistem, tidak sedang dipakai). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ROLES_DELETE', req);
    const role = await prisma.role.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { _count: { select: { memberships: true, invitations: true } } },
    });
    if (!role) return apiErr('Role tidak ditemukan.', 404);
    if (role.isSystem) return apiErr('Role sistem tidak dapat dihapus.', 409);
    if (role._count.memberships > 0 || role._count.invitations > 0) {
      return apiErr(
        `Role masih digunakan oleh ${role._count.memberships} pengguna — pindahkan dulu ke role lain.`,
        409
      );
    }
    await prisma.role.delete({ where: { id: role.id } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_ROLE',
      module: 'ROLES',
      description: `Menghapus role "${role.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: role.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus role.', 500);
  }
}
