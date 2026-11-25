// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { PERMISSION_CATALOG, type PermissionKey } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const SYSTEM_NAMES = ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT', 'VIEWER'];

async function getPlatformRole(id: string) {
  return prisma.role.findFirst({ where: { id, organizationId: null } });
}

function platformKeys(input: unknown): string[] {
  const valid = new Set(PERMISSION_CATALOG.map((p) => p.key));
  return [...new Set((Array.isArray(input) ? input : []) as string[])].filter(
    (k) => valid.has(k as PermissionKey) && k.startsWith('PLATFORM_')
  );
}

/** PUT /api/super/platform-roles/[id] — ubah nama/deskripsi/permission role platform. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSuperAdmin(req);
    const role = await getPlatformRole(params.id);
    if (!role) return apiErr('Role platform tidak ditemukan.', 404);
    const body = await req.json();
    const updates: { name?: string; description?: string | null } = {};
    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return apiErr('Nama role wajib diisi.', 422);
      if (name.length > 50) return apiErr('Nama role maksimal 50 karakter.', 422);
      if (SYSTEM_NAMES.includes(name.toUpperCase())) {
        return apiErr('Nama tersebut dipakai role sistem tenant — pilih nama lain.', 422);
      }
      const clash = await prisma.role.findFirst({
        where: { organizationId: null, name: { equals: name, mode: 'insensitive' }, NOT: { id: role.id } },
      });
      if (clash) return apiErr('Role platform dengan nama tersebut sudah ada.', 409);
      updates.name = name;
    }
    if (body?.description !== undefined) {
      updates.description = body.description ? String(body.description).trim() : null;
    }
    await prisma.$transaction(async (tx) => {
      if (Object.keys(updates).length > 0) {
        await tx.role.update({ where: { id: role.id }, data: updates });
      }
      if (Array.isArray(body?.permissions)) {
        const permissions = platformKeys(body.permissions);
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
      action: 'PLATFORM_ROLE_UPDATE',
      module: 'PLATFORM',
      description: `Mengubah role platform "${updates.name ?? role.name}"`,
      ipAddress: getClientIp(req),
    }).catch(() => {});
    return apiOk({ id: role.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah role platform.', 500);
  }
}

/** DELETE /api/super/platform-roles/[id] — hapus role platform (hanya bila tanpa penugasan). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSuperAdmin(req);
    const role = await getPlatformRole(params.id);
    if (!role) return apiErr('Role platform tidak ditemukan.', 404);
    const assigned = await prisma.platformRoleAssignment.count({ where: { roleId: role.id } });
    if (assigned > 0) {
      return apiErr(
        `Role masih ditugaskan ke ${assigned} admin — cabut dulu penugasannya sebelum menghapus.`,
        409
      );
    }
    await prisma.role.delete({ where: { id: role.id } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'PLATFORM_ROLE_DELETE',
      module: 'PLATFORM',
      description: `Menghapus role platform "${role.name}"`,
      ipAddress: getClientIp(req),
    }).catch(() => {});
    return apiOk({ id: role.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus role platform.', 500);
  }
}
