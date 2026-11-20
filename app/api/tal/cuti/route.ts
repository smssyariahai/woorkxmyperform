// Cuti TAL (TalCuti) — porting endpoint backup:
//   GET    /api/pg/tal/cuti?date&userId        -> GET (milik sendiri)
//   GET    /api/pg/tal/cuti/one?date&userId    -> GET ?one=1&date=
//   POST   /api/pg/tal/cuti                    -> POST { date, reason, userId? }
//   DELETE /api/pg/tal/cuti?date&userId        -> DELETE ?date=&userId=
// Varian admin (?all=1): gate §5.2. Cuti orang lain hanya bisa ditulis admin.
// Upsert unik [org, user, cutiDate].
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { talIsHrAdmin } from '@/lib/tal/team';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const mapCuti = (r: any) => ({
  id: r.id,
  date: r.cutiDate ? new Date(r.cutiDate).toISOString().slice(0, 10) : '',
  userId: r.userId,
  userName: r.userName || undefined,
  reason: r.reason || undefined,
  isCuti: true,
  createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
});

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const date = url.searchParams.get('date') || undefined;
    const admin = talIsHrAdmin(ctx);
    let userId: string | undefined = ctx.userId;
    if (admin && url.searchParams.get('all') === '1') {
      userId = url.searchParams.get('userId') || undefined;
    }
    const where: Record<string, unknown> = { organizationId: ctx.organizationId };
    if (date && DATE_RE.test(date)) where.cutiDate = new Date(`${date}T00:00:00.000Z`);
    if (userId) where.userId = userId;
    const rows = await prisma.talCuti.findMany({
      where: where as never,
      orderBy: { cutiDate: 'asc' },
      take: 1000,
    });
    if (url.searchParams.get('one') === '1') {
      return apiOk({ cuti: rows[0] ? mapCuti(rows[0]) : null });
    }
    return apiOk({ cuti: rows.map(mapCuti) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat cuti TAL.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = (await req.json().catch(() => ({}))) as any;
    const date = String(b.date || '').trim();
    if (!DATE_RE.test(date)) return apiErr('date wajib diisi (format YYYY-MM-DD).', 400);
    let userId = ctx.userId;
    if (b.userId && String(b.userId) !== ctx.userId) {
      if (!talIsHrAdmin(ctx)) return apiErr('Hanya Administrator yang boleh menandai cuti karyawan lain.', 403);
      userId = String(b.userId);
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const row = await prisma.talCuti.upsert({
      where: { organizationId_userId_cutiDate: { organizationId: ctx.organizationId, userId, cutiDate: new Date(`${date}T00:00:00.000Z`) } },
      create: {
        organizationId: ctx.organizationId, userId,
        userName: user?.name || undefined,
        cutiDate: new Date(`${date}T00:00:00.000Z`),
        reason: String(b.reason || '') || undefined,
      },
      update: { reason: String(b.reason || '') || undefined, userName: user?.name || undefined },
    });
    return apiOk({ cuti: mapCuti(row) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan cuti TAL.', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const date = url.searchParams.get('date') || '';
    if (!DATE_RE.test(date)) return apiErr('date wajib diisi (format YYYY-MM-DD).', 400);
    let userId = ctx.userId;
    const qUser = url.searchParams.get('userId');
    if (qUser && qUser !== ctx.userId) {
      if (!talIsHrAdmin(ctx)) return apiErr('Hanya Administrator yang boleh menghapus cuti karyawan lain.', 403);
      userId = qUser;
    }
    const deleted = await prisma.talCuti.deleteMany({
      where: {
        organizationId: ctx.organizationId, userId,
        cutiDate: new Date(`${date}T00:00:00.000Z`),
      },
    });
    if (deleted.count === 0) return apiErr('Cuti tidak ditemukan pada tanggal tersebut.', 404);
    return apiOk({ ok: true, deleted: deleted.count });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus cuti TAL.', 500);
  }
}
