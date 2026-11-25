import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Client tenant (tipe dari skema tenant) — dipakai untuk field baru
 *  Fase 3 (floor/zone/capacity/headUserId/isActive, Agent.departmentId)
 *  yang tidak ada di skema legacy. */
const tprisma = prisma as unknown as TenantPrismaClient;

/** Validasi lantai: 1 | 2 | 3, null (belum dipetakan), undefined (tidak diubah). */
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

/** GET /api/admin/departments — struktur divisi kantor.
 *  Tanpa param: array divisi (dipakai juga UsersClient sebagai referensi).
 *  `?with=assign`: { items, members, unassignedAgents } untuk kontrol
 *  penempatan di halaman Department Management. */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_VIEW', req);
    const withAssign = new URL(req.url).searchParams.get('with') === 'assign';
    const items = await tprisma.department.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        _count: { select: { memberships: true, agents: true } },
        agents: { select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } },
      },
      orderBy: [{ floor: 'asc' }, { name: 'asc' }],
    });
    const headIds = [...new Set(items.map((d) => d.headUserId).filter((x): x is string => !!x))];
    const heads = headIds.length
      ? await tprisma.user.findMany({ where: { id: { in: headIds } }, select: { id: true, name: true } })
      : [];
    const headById = new Map(heads.map((u) => [u.id, u.name]));
    const mapped = items.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      floor: d.floor,
      zone: d.zone,
      capacity: d.capacity,
      headUserId: d.headUserId,
      headName: d.headUserId ? headById.get(d.headUserId) ?? null : null,
      isActive: d.isActive,
      memberCount: d._count.memberships,
      agentCount: d._count.agents,
      agents: d.agents,
      createdAt: d.createdAt,
    }));
    if (!withAssign) return apiOk(mapped);
    const memberships = await tprisma.membership.findMany({
      where: { organizationId: ctx.organizationId, status: 'ACTIVE' },
      select: { userId: true },
    });
    const memberUsers = await tprisma.user.findMany({
      where: { id: { in: [...new Set(memberships.map((m) => m.userId))] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const unassignedAgents = await tprisma.agent.findMany({
      where: { organizationId: ctx.organizationId, departmentId: null, isEnabled: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    return apiOk({ items: mapped, members: memberUsers, unassignedAgents });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat divisi.', 500);
  }
}

/** POST /api/admin/departments — buat divisi.
 *  Body: { name, description?, floor?, zone?, capacity?, headUserId?, isActive? } */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_MANAGE', req);
    const body = await req.json();
    const name = String(body?.name || '').trim();
    if (!name) return apiErr('Nama divisi wajib diisi.', 422);
    const floor = parseFloor(body?.floor);
    if (Number.isNaN(floor)) return apiErr('Lantai harus 1, 2, atau 3.', 422);
    const capacity = parseCapacity(body?.capacity);
    if (Number.isNaN(capacity)) return apiErr('Kapasitas harus bilangan bulat ≥ 0.', 422);
    const headUserId = body?.headUserId ? String(body.headUserId) : null;
    if (headUserId) {
      const head = await tprisma.user.findFirst({ where: { id: headUserId }, select: { id: true } });
      if (!head) return apiErr('Pimpinan divisi tidak ditemukan.', 422);
    }
    const dept = await tprisma.department.create({
      data: {
        organizationId: ctx.organizationId,
        name,
        description: body?.description ? String(body.description).trim() : null,
        floor: floor ?? null,
        zone: body?.zone ? String(body.zone).trim() : null,
        capacity: capacity ?? null,
        headUserId,
        isActive: body?.isActive === undefined ? true : !!body.isActive,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_DEPARTMENT',
      module: 'DEPARTMENTS',
      description: `Membuat divisi "${name}"${floor ? ` (lantai ${floor})` : ''}`,
      ipAddress: getClientIp(req),
    });
    return apiOk(dept, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if ((e as any)?.code === 'P2002') return apiErr('Divisi dengan nama tersebut sudah ada.', 409);
    return apiErr('Gagal membuat divisi.', 500);
  }
}
