// GET /api/kantor/prayer/schedule — jadwal salat hari ini + salat
// berikutnya + arah kiblat untuk kantor ini.
//
// Jadwal dihitung dari lokasi perusahaan (PrayerTimeSettings) lewat
// AlAdhan API method 20 (Kemenag RI) dengan fallback rumus astronomis
// Kemenag, lalu di-cache ke DailyPrayerSchedule. Koreksi waktu
// (adjustmentMinutes) diterapkan saat dibaca. Guard: auth + modul
// 'kantor' (sama seperti GET /api/kantor/office).
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getNextPrayer,
  getPrayerSettings,
  getTodaySchedule,
  qiblaBearing,
} from '@/lib/kantor/prayer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');

    const [schedule, next, settings] = await Promise.all([
      getTodaySchedule(ctx.organizationId),
      getNextPrayer(ctx.organizationId),
      getPrayerSettings(ctx.organizationId),
    ]);

    return apiOk({
      schedule,
      next,
      qibla: qiblaBearing(settings.latitude, settings.longitude),
      source: schedule.source,
      cityName: schedule.cityName,
      timezone: schedule.timezone,
      isEnabled: settings.isEnabled,
      sessionDurationMinutes: settings.sessionDurationMinutes,
      calculationMethod: settings.calculationMethod,
      asrMethod: settings.asrMethod,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat jadwal salat.', 500);
  }
}
