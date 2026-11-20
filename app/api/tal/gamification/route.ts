import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { evaluateUserGamification } from '@/lib/tal/gamification';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tal/gamification?year=2026 — ringkasan gamifikasi user sendiri:
 * streak, best streak, early-bird streak, heatmap 365 hari, progres badge,
 * trofi, dan poin tampilan turunan. RBAC §5.1: hanya data milik sendiri —
 * tidak ada parameter userId/userEmail orang lain yang diterima.
 * Evaluasi juga menyimpan progres (UserBadgeProgress) dan membuat trofi
 * (UserTrophy) saat level badge naik.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const yearRaw = Number(url.searchParams.get('year') || new Date().getFullYear());
    const seasonYear = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
    const summary = await evaluateUserGamification({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userEmail: ctx.email ?? '',
      userName: ctx.name ?? '',
      seasonYear,
    });
    return apiOk({ summary });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat data gamifikasi.', 500);
  }
}
