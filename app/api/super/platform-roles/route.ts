import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { PERMISSION_CATALOG, type PermissionKey } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const SYSTEM_NAMES = ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT', 'VIEWER'];

function platformKeys(input: unknown): string[] {
  const valid = new Set(PERMISSION_CATALOG.map((p) => p.key));
  return [...new Set((Array.isArray(input) ? input : []) as string[])].filter(
    (k) => valid.has(k as PermissionKey) && k.startsWith('PLATFORM_')
  );
}

function validateName(name: string): string | null {
  if (!name) return 'Nama role wajib diisi.';
  if (name.length > 50) return 'Nama role maksimal 50 karakter.';
  if (SYSTEM_NAMES.includes(name.toUpperCase())) {
    return 'Nama tersebut dipakai role sistem tenant — pilih nama lain untuk role platform.';
  }
  return null;
}

/** GET /api/super/platform-roles — daftar role platform (organizationId null). */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const roles = await prisma.role.findMany({
      where: { organizationId: null },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { platformAssignments: true } },
      },
      orderBy: { name: 'asc' },
    });
    return apiOk(
      roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        adminCount: r._count.platformAssignments,
        permissions: r.permissions.map((rp) => rp.permission.key),
        createdAt: r.createdAt,
      }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat role platform.', 500);
  }
}

/** POST /api/super/platform-roles — buat role platform. Body: { name, description?, permissions: PLATFORM_*[] } */
export async function POST(req: Request) {
  try {
    const ctx = await requireSuperAdmin(req);
    const body = await req.json();
    const name = String(body?.name || '').trim();
    const nameErr = validateName(name);
    if (nameErr) return apiErr(nameErr, 422);
    // Postgres tidak menegakkan unique untuk organizationId NULL — cek manual.
    const exists = await prisma.role.findFirst({
      where: { organizationId: null, name: { equals: name, mode: 'insensitive' } },
    });
    if (exists) return apiErr('Role platform dengan nama tersebut sudah ada.', 409);
    const permissions = platformKeys(body?.permissions);
    const role = await prisma.role.create({
      data: {
        organizationId: null,
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
      action: 'PLATFORM_ROLE_CREATE',
      module: 'PLATFORM',
      description: `Membuat role platform "${name}" (${permissions.join(', ') || 'tanpa permission'})`,
      ipAddress: getClientIp(req),
    }).catch(() => {});
    return apiOk({ id: role.id, name: role.name, permissions });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat role platform.', 500);
  }
}
