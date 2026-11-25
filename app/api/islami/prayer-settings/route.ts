import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const FIELDS = [
  'imsak',
  'subuh',
  'terbit',
  'dhuha',
  'dzuhur',
  'ashar',
  'maghrib',
  'isya',
] as const;

function mapSettings(s: any) {
  return {
    imsak: s.imsak ?? null,
    subuh: s.subuh ?? null,
    terbit: s.terbit ?? null,
    dhuha: s.dhuha ?? null,
    dzuhur: s.dzuhur ?? null,
    ashar: s.ashar ?? null,
    maghrib: s.maghrib ?? null,
    isya: s.isya ?? null,
    preAlarmMinutes: s.preAlarmMinutes ?? null,
    enablePreAlarm: !!s.enablePreAlarm,
  };
}

/** GET /api/islami/prayer-settings — pengaturan waktu shalat milik user (404 bila belum ada) */
export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'islami', 'READ');
    const row = await prisma.prayerUserSetting.findUnique({ where: { userId: ctx.userId } });
    if (!row) return apiErr('Pengaturan belum ada.', 404);
    return apiOk({ settings: mapSettings(row) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan shalat.', 500);
  }
}

/** POST /api/islami/prayer-settings — simpan/update pengaturan waktu shalat milik user */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'islami', 'WRITE');
    const s = await req.json().catch(() => ({}));
    const data: Record<string, any> = { organizationId: ctx.organizationId, userId: ctx.userId };
    for (const f of FIELDS) {
      if (s[f] !== undefined) data[f] = s[f] === null ? null : String(s[f]);
    }
    if (s.preAlarmMinutes !== undefined) {
      const n = Number(s.preAlarmMinutes);
      data.preAlarmMinutes = Number.isFinite(n) ? n : null;
    }
    if (s.enablePreAlarm !== undefined) data.enablePreAlarm = !!s.enablePreAlarm;
    await prisma.prayerUserSetting.upsert({
      where: { userId: ctx.userId },
      update: data,
      create: data as any,
    });
    return apiOk({ success: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan shalat.', 500);
  }
}
