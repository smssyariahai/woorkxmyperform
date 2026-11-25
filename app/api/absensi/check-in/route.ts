// POST /api/absensi/check-in — check in via website (method WEB).
import { z } from 'zod';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { checkIn, AttendanceError } from '@/lib/attendance/service';
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
      return apiErr(parsed.error.errors[0]?.message ?? 'Data check in tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;
    const result = await checkIn({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userName: ctx.name,
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      note: d.note ?? null,
      isRemote: d.isRemote,
      method: 'WEB',
    });
    return apiOk(
      {
        record: serializeRecord(result.record),
        lateMinutes: result.lateMinutes,
        workDate: result.workDateKey,
        shift: result.shift
          ? { id: result.shift.id, name: result.shift.name, startTime: result.shift.startTime, endTime: result.shift.endTime }
          : null,
        locationName: result.geofence.locationName,
        distanceMeters: result.geofence.distanceMeters,
        isRemote: result.geofence.isRemote,
        message:
          result.lateMinutes > 0
            ? `Check in berhasil. Anda terlambat ${result.lateMinutes} menit.`
            : 'Check in berhasil. Selamat bekerja!',
      },
      201
    );
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof AttendanceError) return apiErr(e.message, e.status);
    console.error('[absensi/check-in POST]', e);
    return apiErr('Gagal melakukan check in.', 500);
  }
}
