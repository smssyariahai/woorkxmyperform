// GET /api/calendar/holidays — daftar hari libur (TalHoliday) dalam range.
// Read-only: libur dikelola di TAL, bukan dari kalender.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('CALENDAR_VIEW', req);
    const sp = new URL(req.url).searchParams;
    const now = new Date();
    const fromRaw = sp.get('from');
    const toRaw = sp.get('to');
    const from = fromRaw ? new Date(fromRaw) : new Date(now.getFullYear(), 0, 1);
    const to = toRaw ? new Date(toRaw) : new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return apiErr('Format tanggal from/to tidak valid.', 400);
    }
    if (from > to) return apiErr('from tidak boleh lebih besar dari to.', 400);
    const rows = await prisma.talHoliday.findMany({
      where: { organizationId: ctx.organizationId, holidayDate: { gte: from, lte: to } },
      orderBy: { holidayDate: 'asc' },
    });
    const holidays = rows.map((h) => {
      const payload =
        h.payload && typeof h.payload === 'object' ? (h.payload as Record<string, unknown>) : {};
      return {
        id: h.id,
        name: h.name ?? 'Hari Libur',
        holidayDate: h.holidayDate.toISOString().slice(0, 10),
        category: typeof payload.category === 'string' ? payload.category : 'kantor',
        description: typeof payload.description === 'string' ? payload.description : null,
      };
    });
    return apiOk({ holidays });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/holidays GET]', e);
    return apiErr('Gagal memuat hari libur.', 500);
  }
}
