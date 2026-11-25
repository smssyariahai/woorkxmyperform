import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { isTalAdmin } from '@/lib/tal/server';

export const dynamic = 'force-dynamic';

const mapObligation = (r: any) => ({
  userId: r.userId as string,
  userEmail: r.userEmail ?? undefined,
  userName: r.userName ?? undefined,
  daily: !!r.daily,
  weekly: !!r.weekly,
  monthly: !!r.monthly,
});

/**
 * GET /api/tal/obligations — kewajiban TAL.
 * ?mine=1 → kewajiban sendiri (default semua true bila belum ada baris —
 * keputusan §5.6: tanpa baris TalUserObligation, semua wajib).
 * Tanpa param → daftar kewajiban semua user organisasi (dibaca semua user
 * login; dipakai hub/rekap untuk menentukan siapa wajib buat TAL).
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'READ');
    const mine = new URL(req.url).searchParams.get('mine') === '1';
    if (mine) {
      const row = await prisma.talUserObligation.findFirst({
        where: { organizationId: ctx.organizationId, userId: ctx.userId },
      });
      if (!row) {
        return apiOk({
          obligation: { userId: ctx.userId, userEmail: ctx.email, userName: ctx.name, daily: true, weekly: true, monthly: true },
        });
      }
      return apiOk({ obligation: mapObligation(row) });
    }
    const rows = await prisma.talUserObligation.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { userName: 'asc' },
    });
    return apiOk({ obligations: rows.map(mapObligation) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat kewajiban TAL.', 500);
  }
}

/**
 * POST /api/tal/obligations — simpan kewajiban. Admin-only (§5.3).
 * Body: { userId, daily?, weekly?, monthly? } atau { items: [...] } (bulk).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (!isTalAdmin(ctx)) {
      return apiErr('Hanya Administrator yang boleh mengatur kewajiban TAL.', 403);
    }
    const body = await req.json().catch(() => ({}));
    const items: any[] = Array.isArray(body.items) ? body.items : [body];
    const saved: any[] = [];
    for (const it of items) {
      const userId = typeof it.userId === 'string' ? it.userId : '';
      if (!userId) continue;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      if (!user) continue;
      const row = await prisma.talUserObligation.upsert({
        where: { organizationId_userId: { organizationId: ctx.organizationId, userId } },
        create: {
          organizationId: ctx.organizationId,
          userId,
          userEmail: user.email,
          userName: user.name,
          daily: it.daily !== false,
          weekly: it.weekly !== false,
          monthly: it.monthly !== false,
          updatedBy: ctx.userId,
        },
        update: {
          daily: it.daily !== false,
          weekly: it.weekly !== false,
          monthly: it.monthly !== false,
          updatedBy: ctx.userId,
        },
      });
      saved.push(mapObligation(row));
    }
    if (saved.length === 0) return apiErr('Tidak ada kewajiban yang disimpan (userId tidak valid).', 400);
    return apiOk({ obligations: saved, obligation: saved[0] });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan kewajiban TAL.', 500);
  }
}
