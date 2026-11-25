// GET/PUT /api/absensi/settings — pengaturan absensi organisasi
// (GET: semua anggota; PUT: ATTENDANCE_MANAGE). Upsert per organisasi.
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  requireGeofence: z.boolean(),
  allowRemoteCheckIn: z.boolean(),
  defaultLocationId: z.string().nullable().optional(),
  graceLateMinutes: z.number().int().min(0).max(120),
  workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
});

function serialize(row: any) {
  return {
    id: row.id,
    requireGeofence: row.requireGeofence,
    allowRemoteCheckIn: row.allowRemoteCheckIn,
    defaultLocationId: row.defaultLocationId,
    graceLateMinutes: row.graceLateMinutes,
    workDays: row.workDays,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const DEFAULTS = {
  requireGeofence: true,
  allowRemoteCheckIn: false,
  defaultLocationId: null,
  graceLateMinutes: 15,
  workDays: [1, 2, 3, 4, 5],
};

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_VIEW', req);
    const row = await prisma.attendanceSetting.findUnique({
      where: { organizationId: ctx.organizationId },
    });
    return apiOk({ settings: row ? serialize(row) : { ...DEFAULTS, id: null } });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/settings GET]', e);
    return apiErr('Gagal memuat pengaturan absensi.', 500);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data pengaturan tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;
    if (d.defaultLocationId) {
      const loc = await prisma.attendanceLocation.findFirst({
        where: { id: d.defaultLocationId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!loc) return apiErr('Lokasi default tidak ditemukan di kantor ini.', 400);
    }
    const saved = await prisma.attendanceSetting.upsert({
      where: { organizationId: ctx.organizationId },
      update: d,
      create: { organizationId: ctx.organizationId, ...d },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_UPDATE_SETTINGS',
      module: 'ATTENDANCE',
      description: `Mengubah pengaturan absensi (geofence: ${d.requireGeofence ? 'wajib' : 'tidak wajib'}, toleransi ${d.graceLateMinutes} menit)`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ settings: serialize(saved) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/settings PUT]', e);
    return apiErr('Gagal menyimpan pengaturan absensi.', 500);
  }
}
