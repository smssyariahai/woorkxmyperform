// Kunci bulanan TAL (TalMonthlyLock) — porting endpoint backup:
//   GET    /api/pg/tal/month-locks            -> GET di sini
//   GET    /api/pg/tal/month-locks/:monthKey  -> GET ?monthKey=YYYY-MM
//   POST   /api/pg/tal/month-locks            -> POST { monthKey|year+month, isLocked, reason }
//   DELETE /api/pg/tal/month-locks/:monthKey  -> DELETE ?monthKey=YYYY-MM&reason=
// Baca: admin semua, user biasa hanya milik sendiri.
// Tulis (kunci/buka/reset ke otomatis): admin-only (§5.3) + TalAuditLog
// (lock_month_lock / unlock_month_lock / reset_month_lock_auto).
import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { talIsHrAdmin, talWriteAuditLog } from '@/lib/tal/team';

export const dynamic = 'force-dynamic';

function parseMonthKey(raw: string | null): { year: number; month: number } | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

const mapLock = (r: any) => ({
  id: r.id,
  userId: r.userId,
  year: r.year,
  month: r.month,
  monthKey: `${r.year}-${String(r.month).padStart(2, '0')}`,
  isLocked: r.isLocked,
  lockedAt: r.lockedAt ? new Date(r.lockedAt).toISOString() : null,
  payload: r.payload || {},
});

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'READ');
    const url = new URL(req.url);
    const mk = parseMonthKey(url.searchParams.get('monthKey'));
    const admin = talIsHrAdmin(ctx);
    const where: Record<string, unknown> = { organizationId: ctx.organizationId };
    if (!admin) where.userId = ctx.userId;
    if (mk) {
      where.year = mk.year;
      where.month = mk.month;
    }
    const rows = await prisma.talMonthlyLock.findMany({
      where: where as never,
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (mk && rows.length === 0 && !admin) {
      return apiOk({ locks: [], lock: null });
    }
    return apiOk({ locks: rows.map(mapLock), lock: mk && rows[0] ? mapLock(rows[0]) : null });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat kunci bulan TAL.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (!talIsHrAdmin(ctx)) return apiErr('Hanya Administrator yang boleh mengatur kunci bulan.', 403);
    const b = (await req.json().catch(() => ({}))) as any;
    const mk = parseMonthKey(b.monthKey || (b.year && b.month ? `${b.year}-${String(b.month).padStart(2, '0')}` : null));
    if (!mk) return apiErr('monthKey wajib diisi (format YYYY-MM).', 400);
    const reason = String(b.reason || '').trim();
    if (!reason) return apiErr('Alasan wajib diisi untuk mengubah kunci bulan.', 400);
    const isLocked = b.isLocked === true;
    const userId = String(b.userId || ctx.userId);
    const row = await prisma.talMonthlyLock.upsert({
      where: { organizationId_userId_year_month: { organizationId: ctx.organizationId, userId, year: mk.year, month: mk.month } },
      create: {
        organizationId: ctx.organizationId, userId, year: mk.year, month: mk.month,
        isLocked, lockedAt: isLocked ? new Date() : null,
        payload: { lockedBy: ctx.userId, reason, manualOverride: true } as any,
      },
      update: {
        isLocked, lockedAt: isLocked ? new Date() : null,
        payload: { lockedBy: ctx.userId, reason, manualOverride: true } as any,
      },
    });
    await talWriteAuditLog(ctx, {
      actionType: isLocked ? 'lock_month_lock' : 'unlock_month_lock',
      actionTitle: isLocked ? 'Kunci bulan TAL' : 'Buka kunci bulan TAL',
      reason,
      targetSummary: `Bulan ${mk.year}-${String(mk.month).padStart(2, '0')}, user ${userId}`,
      affectedCount: 1,
      details: { monthKey: `${mk.year}-${String(mk.month).padStart(2, '0')}`, userId, isLocked },
    });
    return apiOk({ lock: mapLock(row) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan kunci bulan TAL.', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (!talIsHrAdmin(ctx)) return apiErr('Hanya Administrator yang boleh mereset kunci bulan.', 403);
    const url = new URL(req.url);
    const mk = parseMonthKey(url.searchParams.get('monthKey'));
    if (!mk) return apiErr('monthKey wajib diisi (format YYYY-MM).', 400);
    const reason = (url.searchParams.get('reason') || '').trim();
    if (!reason) return apiErr('Alasan wajib diisi untuk mereset kunci bulan ke otomatis.', 400);
    const userId = url.searchParams.get('userId') || '';
    const where: Record<string, unknown> = {
      organizationId: ctx.organizationId, year: mk.year, month: mk.month,
    };
    if (userId) where.userId = userId;
    const deleted = await prisma.talMonthlyLock.deleteMany({ where: where as never });
    await talWriteAuditLog(ctx, {
      actionType: 'reset_month_lock_auto',
      actionTitle: 'Reset kunci bulan TAL ke otomatis',
      reason,
      targetSummary: `Bulan ${mk.year}-${String(mk.month).padStart(2, '0')}${userId ? `, user ${userId}` : ', semua user'}`,
      affectedCount: deleted.count,
      details: { monthKey: `${mk.year}-${String(mk.month).padStart(2, '0')}`, userId: userId || null },
    });
    return apiOk({ ok: true, deleted: deleted.count });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mereset kunci bulan TAL.', 500);
  }
}
