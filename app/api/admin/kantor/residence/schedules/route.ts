// GET / POST /api/admin/kantor/residence/schedules — daftar + buat jadwal
// istirahat agent/divisi (Fase 7). GET mengembalikan jadwal + referensi
// agent/divisi untuk form. POST: { agentId? | divisionId?, startTime,
// endTime, scheduleType?, enabled?, timezone? } — validasi HH:mm, mulai !=
// selesai, agentId ATAU divisionId terisi + referensi ada di kantor ini.
// Guard baca: DEPARTMENTS_VIEW (pola GET residence). Guard tulis: auth +
// modul 'kantor' + hanya OWNER / ADMIN kantor atau Super Admin (pola assign).
import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requirePermission, requireAuth, requireModule } from '@/lib/auth-helpers';
import { canManageAgents } from '@/lib/agents/manage';
import { apiOk, apiErr } from '@/lib/utils';
import {
  ResidenceAdminError,
  listRestSchedules,
  createRestSchedule,
} from '@/lib/kantor/residence-admin';

export const dynamic = 'force-dynamic';

const tprisma = prisma as unknown as TenantPrismaClient;

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_VIEW', req);
    const data = await listRestSchedules(tprisma, ctx.organizationId);
    return apiOk(data);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal memuat jadwal istirahat.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh menambah jadwal istirahat.', 403);
    }
    const body = await req.json().catch(() => null);
    const schedule = await createRestSchedule(tprisma, ctx.organizationId, {
      agentId: body?.agentId,
      divisionId: body?.divisionId,
      startTime: body?.startTime,
      endTime: body?.endTime,
      scheduleType: body?.scheduleType,
      enabled: body?.enabled,
      timezone: body?.timezone,
    });
    return apiOk({ schedule }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof ResidenceAdminError) return apiErr(e.message, e.status);
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal menambah jadwal istirahat.', 500);
  }
}
