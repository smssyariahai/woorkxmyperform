// GET /api/admin/kantor/command-center — data AI Command Center (Fase 7a1).
// Agregasi nyata dari DB TENANT pemanggil (lib/kantor/command-center.ts).
// Guard: auth + modul 'kantor' + Super Admin atau salah satu dari
// USERS_VIEW / ROLES_VIEW / DEPARTMENTS_VIEW / SETTINGS_MANAGE (pola yang
// sama dengan katalog — monitoring sesuai permission).
// Query: ?departmentId= &agentId= (mempersempit agent/utilisasi/tugas;
// meeting, kolaborasi, dan panggilan AI selalu org-wide).
import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requireAuth, requireModule, getUserPermissions } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getCommandCenterData } from '@/lib/kantor/command-center';

export const dynamic = 'force-dynamic';

/** Client tenant — pola yang sama dengan /api/admin/departments (Fase 3a). */
const tprisma = prisma as unknown as TenantPrismaClient;

const ALLOWED = ['USERS_VIEW', 'ROLES_VIEW', 'DEPARTMENTS_VIEW', 'SETTINGS_MANAGE'];

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    const keys = await getUserPermissions(ctx);
    const allowed = ctx.isSuperAdmin || ALLOWED.some((k) => keys.has(k));
    if (!allowed) return apiErr('Anda tidak memiliki akses Command Center.', 403);

    const url = new URL(req.url);
    const departmentId = (url.searchParams.get('departmentId') ?? '').trim() || null;
    const agentId = (url.searchParams.get('agentId') ?? '').trim() || null;

    if (departmentId) {
      const dept = await tprisma.department.findFirst({
        where: { id: departmentId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!dept) return apiErr('Divisi tidak ditemukan di kantor ini.', 404);
    }
    if (agentId) {
      const agent = await tprisma.agent.findFirst({
        where: { id: agentId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!agent) return apiErr('Agent tidak ditemukan di kantor ini.', 404);
    }

    const data = await getCommandCenterData(tprisma, ctx.organizationId, { departmentId, agentId });
    return apiOk(data);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal memuat Command Center.', 500);
  }
}
