// POST /api/absensi/check-out — check out via website (method WEB).
import { z } from 'zod';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { checkOut, AttendanceError } from '@/lib/attendance/service';
import { serializeRecord } from '@/lib/attendance/serialize';

export const dynamic = 'force-dynamic';

const schema = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  isRemote: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_CHECKIN', req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data check out tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;
    const result = await checkOut({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userName: ctx.name,
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      note: d.note ?? null,
      isRemote: d.isRemote,
      method: 'WEB',
    });
    return apiOk({
      record: serializeRecord(result.record),
      lateMinutes: result.lateMinutes,
      earlyMinutes: result.earlyMinutes,
      workMinutes: result.workMinutes,
      overtimeMinutes: result.overtimeMinutes,
      status: result.status,
      workDate: result.workDateKey,
      locationName: result.geofence.locationName,
      distanceMeters: result.geofence.distanceMeters,
      isRemote: result.geofence.isRemote,
      message: `Check out berhasil. Jam kerja hari ini ${result.workMinutes} menit${result.overtimeMinutes > 0 ? ` (lembur ${result.overtimeMinutes} menit)` : ''}.`,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof AttendanceError) return apiErr(e.message, e.status);
    console.error('[absensi/check-out POST]', e);
    return apiErr('Gagal melakukan check out.', 500);
  }
}
