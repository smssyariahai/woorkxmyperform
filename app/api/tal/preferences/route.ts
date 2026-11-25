import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { normalizeTalPrefs } from '@/lib/tal/preferences';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tal/preferences — baca prefs.tal milik sendiri
 * (NotificationPreference.prefs.tal; default = DEFAULT_TAL_NOTIFICATION_SETTINGS).
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'READ');
    const row = await prisma.notificationPreference.findUnique({
      where: {
        organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId },
      },
      select: { prefs: true },
    });
    const prefs = (row?.prefs ?? {}) as Record<string, unknown>;
    return apiOk({ prefs: normalizeTalPrefs(prefs.tal) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat preferensi TAL.', 500);
  }
}

/**
 * POST /api/tal/preferences — simpan prefs.tal milik sendiri.
 * Merge ke dalam kolom prefs (kunci lain seperti announcement TIDAK ditimpa).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    const body = await req.json().catch(() => ({}));
    const tal = normalizeTalPrefs(body.prefs ?? body);
    const existing = await prisma.notificationPreference.findUnique({
      where: {
        organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId },
      },
      select: { prefs: true },
    });
    const merged = {
      ...((existing?.prefs ?? {}) as Record<string, unknown>),
      tal,
    };
    const saved = await prisma.notificationPreference.upsert({
      where: {
        organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId },
      },
      create: { organizationId: ctx.organizationId, userId: ctx.userId, prefs: merged as any },
      update: { prefs: merged as any },
    });
    return apiOk({ prefs: normalizeTalPrefs((saved.prefs as Record<string, unknown>).tal) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan preferensi TAL.', 500);
  }
}
