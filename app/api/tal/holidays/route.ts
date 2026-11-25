// Hari libur TAL (TalHoliday) — porting endpoint backup:
//   GET    /api/pg/tal/holidays           -> GET (semua user boleh baca)
//   POST   /api/pg/tal/holidays           -> POST { date, title, category, description, isRecurringYearly }
//   DELETE /api/pg/tal/holidays/:id       -> DELETE ?id= / ?date=
//   POST   /api/pg/tal/holidays/reset     -> POST { reset: true, holidays?: [...] }
// Tulis libur: admin-only (§5.3 — keputusan sub-tahap b; backup tidak
// menggating di server, tapi ini pengaturan organisasi). Setiap tulis
// admin menulis TalAuditLog (actionType 'update_holidays').
// Daftar default = DEFAULT_INDONESIAN_HOLIDAYS backup
// (src/utils/talDateUtils.ts:432, 2025-2027).
import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { talIsHrAdmin, talWriteAuditLog } from '@/lib/tal/team';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = ['nasional', 'cuti_bersama', 'kantor'] as const;

const DEFAULT_INDONESIAN_HOLIDAYS: {
  date: string; title: string; category: (typeof CATEGORIES)[number]; isRecurringYearly?: boolean;
}[] = [
  { date: '2025-01-01', title: 'Tahun Baru 2025 Masehi', category: 'nasional', isRecurringYearly: true },
  { date: '2025-01-27', title: "Isra Mi'raj Nabi Muhammad SAW", category: 'nasional' },
  { date: '2025-01-29', title: 'Tahun Baru Imlek 2576 Kongzili', category: 'nasional' },
  { date: '2025-03-29', title: 'Hari Suci Nyepi (Tahun Baru Saka 1947)', category: 'nasional' },
  { date: '2025-03-31', title: 'Hari Raya Idul Fitri 1446 H (Hari ke-1)', category: 'nasional' },
  { date: '2025-04-01', title: 'Hari Raya Idul Fitri 1446 H (Hari ke-2)', category: 'nasional' },
  { date: '2025-04-18', title: 'Wafat Yesus Kristus', category: 'nasional' },
  { date: '2025-05-01', title: 'Hari Buruh Internasional', category: 'nasional', isRecurringYearly: true },
  { date: '2025-05-12', title: 'Hari Raya Waisak 2569 BE', category: 'nasional' },
  { date: '2025-05-29', title: 'Kenaikan Yesus Kristus', category: 'nasional' },
  { date: '2025-06-01', title: 'Hari Lahir Pancasila', category: 'nasional', isRecurringYearly: true },
  { date: '2025-06-07', title: 'Hari Raya Idul Adha 1446 H', category: 'nasional' },
  { date: '2025-06-27', title: '1 Muharram / Tahun Baru Islam 1447 H', category: 'nasional' },
  { date: '2025-08-17', title: 'Hari Kemerdekaan Republik Indonesia', category: 'nasional', isRecurringYearly: true },
  { date: '2025-09-05', title: 'Maulid Nabi Muhammad SAW', category: 'nasional' },
  { date: '2025-12-25', title: 'Hari Raya Natal', category: 'nasional', isRecurringYearly: true },
  { date: '2026-01-01', title: 'Tahun Baru 2026 Masehi', category: 'nasional', isRecurringYearly: true },
  { date: '2026-01-16', title: "Isra Mi'raj Nabi Muhammad SAW", category: 'nasional' },
  { date: '2026-02-17', title: 'Tahun Baru Imlek 2577 Kongzili', category: 'nasional' },
  { date: '2026-03-19', title: 'Hari Suci Nyepi (Tahun Baru Saka 1948)', category: 'nasional' },
  { date: '2026-03-20', title: 'Hari Raya Idul Fitri 1447 H (Hari ke-1)', category: 'nasional' },
  { date: '2026-03-21', title: 'Hari Raya Idul Fitri 1447 H (Hari ke-2)', category: 'nasional' },
  { date: '2026-04-03', title: 'Wafat Yesus Kristus', category: 'nasional' },
  { date: '2026-05-01', title: 'Hari Buruh Internasional', category: 'nasional', isRecurringYearly: true },
  { date: '2026-05-14', title: 'Kenaikan Yesus Kristus', category: 'nasional' },
  { date: '2026-05-27', title: 'Hari Raya Idul Adha 1447 H', category: 'nasional' },
  { date: '2026-05-31', title: 'Hari Raya Waisak 2570 BE', category: 'nasional' },
  { date: '2026-06-01', title: 'Hari Lahir Pancasila', category: 'nasional', isRecurringYearly: true },
  { date: '2026-06-16', title: 'Tahun Baru Islam 1448 H', category: 'nasional' },
  { date: '2026-08-17', title: 'Hari Kemerdekaan Republik Indonesia', category: 'nasional', isRecurringYearly: true },
  { date: '2026-08-25', title: 'Maulid Nabi Muhammad SAW', category: 'nasional' },
  { date: '2026-12-25', title: 'Hari Raya Natal', category: 'nasional', isRecurringYearly: true },
  { date: '2027-01-01', title: 'Tahun Baru 2027 Masehi', category: 'nasional', isRecurringYearly: true },
  { date: '2027-02-06', title: 'Tahun Baru Imlek 2578 Kongzili', category: 'nasional' },
  { date: '2027-03-10', title: 'Hari Raya Idul Fitri 1448 H', category: 'nasional' },
  { date: '2027-05-01', title: 'Hari Buruh Internasional', category: 'nasional', isRecurringYearly: true },
  { date: '2027-06-01', title: 'Hari Lahir Pancasila', category: 'nasional', isRecurringYearly: true },
  { date: '2027-08-17', title: 'Hari Kemerdekaan Republik Indonesia', category: 'nasional', isRecurringYearly: true },
  { date: '2027-12-25', title: 'Hari Raya Natal', category: 'nasional', isRecurringYearly: true },
];

const mapHoliday = (r: any) => {
  const p = (r.payload || {}) as any;
  return {
    id: r.id,
    date: r.holidayDate ? new Date(r.holidayDate).toISOString().slice(0, 10) : '',
    title: r.name || '',
    category: p.category || 'nasional',
    description: p.description || '',
    isRecurringYearly: !!p.isRecurringYearly,
    createdBy: p.createdBy || undefined,
  };
};

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'READ');
    const url = new URL(req.url);
    const year = Number(url.searchParams.get('year') || 0) || undefined;
    const where: Record<string, unknown> = { organizationId: ctx.organizationId };
    if (year) {
      where.holidayDate = {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lte: new Date(`${year}-12-31T00:00:00.000Z`),
      };
    }
    const rows = await prisma.talHoliday.findMany({
      where: where as never,
      orderBy: { holidayDate: 'asc' },
    });
    return apiOk({ holidays: rows.map(mapHoliday) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat hari libur.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (!talIsHrAdmin(ctx)) return apiErr('Hanya Administrator yang boleh mengatur hari libur.', 403);
    const b = (await req.json().catch(() => ({}))) as any;

    // Reset ke daftar libur nasional default (porting resetDefaultHolidays).
    if (b.reset === true) {
      const list = Array.isArray(b.holidays) && b.holidays.length ? b.holidays : DEFAULT_INDONESIAN_HOLIDAYS;
      const valid = list.filter((h: any) => h && DATE_RE.test(String(h.date || '')));
      await prisma.talHoliday.deleteMany({ where: { organizationId: ctx.organizationId } });
      for (const h of valid) {
        await prisma.talHoliday.create({
          data: {
            organizationId: ctx.organizationId,
            holidayDate: new Date(`${h.date}T00:00:00.000Z`),
            name: String(h.title || h.name || ''),
            payload: {
              description: h.description || '',
              category: CATEGORIES.includes(h.category) ? h.category : 'nasional',
              isRecurringYearly: !!h.isRecurringYearly,
              createdBy: ctx.userId,
            } as any,
          },
        });
      }
      await talWriteAuditLog(ctx, {
        actionType: 'update_holidays',
        actionTitle: 'Reset hari libur ke default nasional',
        reason: String(b.reason || 'Reset daftar libur ke default nasional.'),
        targetSummary: `${valid.length} hari libur`,
        affectedCount: valid.length,
        details: {},
      });
      const rows = await prisma.talHoliday.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { holidayDate: 'asc' },
      });
      return apiOk({ holidays: rows.map(mapHoliday) });
    }

    const date = String(b.date || '').trim();
    if (!DATE_RE.test(date)) return apiErr('date wajib diisi (format YYYY-MM-DD).', 400);
    const title = String(b.title || b.name || '').trim();
    if (!title) return apiErr('Nama libur wajib diisi.', 400);
    const category = CATEGORIES.includes(b.category) ? b.category : 'nasional';
    const row = await prisma.talHoliday.upsert({
      where: { organizationId_holidayDate: { organizationId: ctx.organizationId, holidayDate: new Date(`${date}T00:00:00.000Z`) } },
      create: {
        organizationId: ctx.organizationId,
        holidayDate: new Date(`${date}T00:00:00.000Z`),
        name: title,
        payload: {
          description: String(b.description || ''),
          category,
          isRecurringYearly: !!b.isRecurringYearly,
          createdBy: ctx.userId,
        } as any,
      },
      update: {
        name: title,
        payload: {
          description: String(b.description || ''),
          category,
          isRecurringYearly: !!b.isRecurringYearly,
          createdBy: ctx.userId,
        } as any,
      },
    });
    await talWriteAuditLog(ctx, {
      actionType: 'update_holidays',
      actionTitle: 'Simpan hari libur',
      reason: String(b.reason || `Simpan hari libur ${title} (${date}).`),
      targetSummary: `${title} — ${date}`,
      affectedCount: 1,
      details: { date, title, category },
    });
    return apiOk({ holiday: mapHoliday(row) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan hari libur.', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (!talIsHrAdmin(ctx)) return apiErr('Hanya Administrator yang boleh menghapus hari libur.', 403);
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    const date = url.searchParams.get('date') || '';
    let deleted = { count: 0 };
    if (id) {
      deleted = await prisma.talHoliday.deleteMany({
        where: { id, organizationId: ctx.organizationId },
      });
    } else if (DATE_RE.test(date)) {
      deleted = await prisma.talHoliday.deleteMany({
        where: { organizationId: ctx.organizationId, holidayDate: new Date(`${date}T00:00:00.000Z`) },
      });
    } else {
      return apiErr('id atau date wajib diisi.', 400);
    }
    if (deleted.count === 0) return apiErr('Hari libur tidak ditemukan.', 404);
    await talWriteAuditLog(ctx, {
      actionType: 'update_holidays',
      actionTitle: 'Hapus hari libur',
      reason: 'Hapus hari libur.',
      targetSummary: id || date,
      affectedCount: deleted.count,
      details: { id: id || null, date: date || null },
    });
    return apiOk({ ok: true, deleted: deleted.count });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus hari libur.', 500);
  }
}
