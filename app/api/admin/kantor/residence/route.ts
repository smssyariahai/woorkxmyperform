// GET /api/admin/kantor/residence — daftar mess + kamar + kasur + penghuni
// (Fase 5a, dipakai Fase 7 — Staff Residence Management).
// Guard: DEPARTMENTS_VIEW (pola yang sama dengan /api/admin/departments).
// Tenant tanpa Residence -> { residence: null, rooms: [], unassignedAgents: [...] }.
import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requirePermission, requireAuth, requireModule } from '@/lib/auth-helpers';
import { canManageAgents } from '@/lib/agents/manage';
import { apiOk, apiErr } from '@/lib/utils';
import {
  ResidenceAdminError,
  updateResidence,
} from '@/lib/kantor/residence-admin';

export const dynamic = 'force-dynamic';

/** Client tenant — dipakai untuk model Residence (Fase 5a) yang tidak ada
 *  di skema legacy (pola yang sama dengan /api/admin/departments). */
const tprisma = prisma as unknown as TenantPrismaClient;

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_VIEW', req);

    const residence = await tprisma.residence.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, status: true },
    });
    if (!residence) {
      const unassignedAgents = await tprisma.agent.findMany({
        where: { organizationId: ctx.organizationId, isEnabled: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      return apiOk({ residence: null, rooms: [], unassignedAgents });
    }

    const [rooms, assignments, agents] = await Promise.all([
      tprisma.residenceRoom.findMany({
        where: { residenceId: residence.id },
        orderBy: { name: 'asc' },
        include: {
          beds: { orderBy: { bedIndex: 'asc' }, select: { id: true, bedCode: true, bedIndex: true, status: true } },
        },
      }),
      tprisma.agentResidenceAssignment.findMany({
        where: { residenceId: residence.id, status: 'ACTIVE' },
        select: { agentId: true, bedId: true, roomId: true, assignedAt: true },
      }),
      tprisma.agent.findMany({
        where: { organizationId: ctx.organizationId, isEnabled: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, avatarColor: true },
      }),
    ]);
    const agentById = new Map(agents.map((a) => [a.id, a]));
    const assignedAgentIds = new Set(assignments.map((a) => a.agentId));
    const assignmentByBed = new Map(assignments.map((a) => [a.bedId, a]));
    const mappedRooms = rooms.map((room) => ({
      id: room.id,
      name: room.name,
      floorNumber: room.floorNumber,
      capacity: room.capacity,
      beds: room.beds.map((bed) => {
        const assignment = assignmentByBed.get(bed.id);
        const occupant = assignment ? agentById.get(assignment.agentId) ?? null : null;
        return {
          id: bed.id,
          bedCode: bed.bedCode,
          bedIndex: bed.bedIndex,
          status: bed.status,
          occupant: occupant
            ? { id: occupant.id, name: occupant.name, avatarColor: occupant.avatarColor }
            : null,
        };
      }),
    }));
    const unassignedAgents = agents
      .filter((a) => !assignedAgentIds.has(a.id))
      .map((a) => ({ id: a.id, name: a.name }));

    return apiOk({ residence, rooms: mappedRooms, unassignedAgents });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal memuat mess.', 500);
  }
}

// PATCH /api/admin/kantor/residence — ubah nama + status mess (Fase 7).
// Guard: auth + modul 'kantor' + hanya OWNER / ADMIN kantor atau Super Admin
// (pola yang sama dengan POST /api/admin/kantor/residence/assign).
// Body: { name?, status? } — minimal satu diisi.
export async function PATCH(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengubah pengaturan mess.', 403);
    }
    const body = await req.json().catch(() => null);
    const residence = await tprisma.residence.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!residence) return apiErr('Mess belum diaktifkan untuk perusahaan ini.', 404);
    const updated = await updateResidence(tprisma, residence.id, {
      name: body?.name,
      status: body?.status,
    });
    return apiOk({ residence: updated });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof ResidenceAdminError) return apiErr(e.message, e.status);
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal mengubah pengaturan mess.', 500);
  }
}
