// GET /api/daily/schedule?date=YYYY-MM-DD — agenda satu hari (CalendarEvent
// + Meeting, digabung, urut waktu, tanpa duplikasi meeting yang sudah
// tersinkron ke kalender).
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getUserTimezone, dateKeyInTz } from '@/lib/daily/helpers';
import { loadDaySchedule } from '@/lib/daily/schedule';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const sp = new URL(req.url).searchParams;
    const date = sp.get('date')?.trim() || dateKeyInTz(new Date(), tz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiErr('Parameter date harus YYYY-MM-DD.', 400);
    }
    const items = await loadDaySchedule({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      dayKey: date,
      tz,
    });
    return apiOk({ date, timezone: tz, items });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/schedule GET]', e);
    return apiErr('Gagal memuat agenda hari ini.', 500);
  }
}
