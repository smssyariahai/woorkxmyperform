// PATCH / DELETE /api/admin/kantor/residence/schedules/[id] — ubah + hapus
// jadwal istirahat (Fase 7). PATCH menerima sebagian field (validasi sama
// dengan POST: HH:mm, mulai != selesai, target tetap terisi + ada).
// Guard: auth + modul 'kantor' + hanya OWNER / ADMIN kantor atau Super Admin
// (pola yang sama dengan POST /api/admin/kantor/residence/assign).
import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { canManageAgents } from '@/lib/agents/manage';
import { apiOk, apiErr } from '@/lib/utils';
import {
  ResidenceAdminError,
  updateRestSchedule,
  deleteRestSchedule,
} from '@/lib/kantor/residence-admin';

export const dynamic = 'force-dynamic';

const tprisma = prisma as unknown as TenantPrismaClient;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengubah jadwal istirahat.', 403);
    }
    const body = await req.json().catch(() => null);
    const schedule = await updateRestSchedule(tprisma, ctx.organizationId, params.id, {
      agentId: body?.agentId,
      divisionId: body?.divisionId,
      startTime: body?.startTime,
      endTime: body?.endTime,
      scheduleType: body?.scheduleType,
      enabled: body?.enabled,
      timezone: body?.timezone,
    });
    return apiOk({ schedule });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof ResidenceAdminError) return apiErr(e.message, e.status);
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal mengubah jadwal istirahat.', 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh menghapus jadwal istirahat.', 403);
    }
    const deleted = await deleteRestSchedule(tprisma, params.id);
    return apiOk(deleted);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof ResidenceAdminError) return apiErr(e.message, e.status);
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal menghapus jadwal istirahat.', 500);
  }
}
