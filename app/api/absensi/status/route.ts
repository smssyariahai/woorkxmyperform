// GET /api/absensi/status — status absensi saya hari ini.
// Dipakai tombol Check In/Out di UI (dan nanti Daily Workspace).
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getTodayStatus } from '@/lib/attendance/service';
import { serializeRecord } from '@/lib/attendance/serialize';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_VIEW', req);
    const s = await getTodayStatus(ctx.organizationId, ctx.userId);
    return apiOk({
      date: s.date,
      timezone: s.timezone,
      record: s.record ? serializeRecord(s.record) : null,
      shift: s.shift
        ? { id: s.shift.id, name: s.shift.name, startTime: s.shift.startTime, endTime: s.shift.endTime, isNightShift: s.shift.isNightShift, breakMinutes: s.shift.breakMinutes, graceLateMinutes: s.shift.graceLateMinutes, color: s.shift.color }
        : null,
      schedule: s.schedule ? { id: s.schedule.id, name: s.schedule.name, source: s.scheduleSource } : null,
      window: s.window,
      isHoliday: s.isHoliday,
      holidayName: s.holidayName,
      isOnLeave: s.isOnLeave,
      setting: s.setting,
      locations: s.locations,
      canCheckIn: s.canCheckIn,
      canCheckOut: s.canCheckOut,
      openRecordDate: s.openRecordDate,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/status GET]', e);
    return apiErr('Gagal memuat status absensi.', 500);
  }
}
