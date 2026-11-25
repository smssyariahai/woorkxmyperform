import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Client tenant (tipe dari skema tenant) — lihat departments/route.ts. */
const tprisma = prisma as unknown as TenantPrismaClient;

function parseFloor(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  return n === 1 || n === 2 || n === 3 ? n : NaN;
}

function parseCapacity(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

/** PATCH /api/admin/departments/:id — edit divisi.
 *  Body: { name?, description?, floor?, zone?, capacity?, headUserId?, isActive? } */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_MANAGE', req);
    const dept = await tprisma.department.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!dept) return apiErr('Divisi tidak ditemukan.', 404);
    const body = await req.json();
    const data: {
      name?: string;
      description?: string | null;
      floor?: number | null;
      zone?: string | null;
      capacity?: number | null;
      headUserId?: string | null;
      isActive?: boolean;
    } = {};
    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return apiErr('Nama divisi tidak boleh kosong.', 422);
      data.name = name;
    }
    if (body?.description !== undefined) {
      data.description = String(body.description).trim() || null;
    }
    if (body?.floor !== undefined) {
      const floor = parseFloor(body.floor);
      if (Number.isNaN(floor)) return apiErr('Lantai harus 1, 2, atau 3.', 422);
      data.floor = floor ?? null;
    }
    if (body?.zone !== undefined) {
      data.zone = String(body.zone).trim() || null;
    }
    if (body?.capacity !== undefined) {
      const capacity = parseCapacity(body.capacity);
      if (Number.isNaN(capacity)) return apiErr('Kapasitas harus bilangan bulat ≥ 0.', 422);
      data.capacity = capacity ?? null;
    }
    if (body?.headUserId !== undefined) {
      const headUserId = body.headUserId ? String(body.headUserId) : null;
      if (headUserId) {
        const head = await tprisma.user.findFirst({ where: { id: headUserId }, select: { id: true } });
        if (!head) return apiErr('Pimpinan divisi tidak ditemukan.', 422);
      }
      data.headUserId = headUserId;
    }
    if (body?.isActive !== undefined) {
      data.isActive = !!body.isActive;
    }
    const updated = await tprisma.department.update({ where: { id: dept.id }, data });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_DEPARTMENT',
      module: 'DEPARTMENTS',
      description: `Mengedit divisi "${dept.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if ((e as any)?.code === 'P2002') return apiErr('Divisi dengan nama tersebut sudah ada.', 409);
    return apiErr('Gagal mengedit divisi.', 500);
  }
}

/** DELETE /api/admin/departments/:id — hapus divisi (anggota manusia dan
 *  agent AI dilepas dari divisi). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_MANAGE', req);
    const dept = await tprisma.department.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { _count: { select: { memberships: true, agents: true } } },
    });
    if (!dept) return apiErr('Divisi tidak ditemukan.', 404);
    await tprisma.$transaction([
      tprisma.membership.updateMany({
        where: { departmentId: dept.id },
        data: { departmentId: null },
      }),
      tprisma.agent.updateMany({
        where: { departmentId: dept.id },
        data: { departmentId: null },
      }),
      tprisma.department.delete({ where: { id: dept.id } }),
    ]);
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_DEPARTMENT',
      module: 'DEPARTMENTS',
      description: `Menghapus divisi "${dept.name}" (${dept._count.memberships} anggota, ${dept._count.agents} agent dilepas)`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: dept.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus divisi.', 500);
  }
}
