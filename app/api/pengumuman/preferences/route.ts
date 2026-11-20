import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  DEFAULT_PREFS,
  mergePrefs,
  normalizePrefs,
} from '@/lib/pengumuman/preferences';

export const dynamic = 'force-dynamic';

/** GET /api/pengumuman/preferences — preferensi user login (200 + default bila belum ada) */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const row = await prisma.notificationPreference.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      },
    });
    if (!row) {
      return apiOk({ preferences: { ...DEFAULT_PREFS }, saved: false });
    }
    return apiOk({ preferences: mergePrefs(row.prefs), saved: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat preferensi notifikasi.', 500);
  }
}

/** POST /api/pengumuman/preferences — simpan preferensi user sendiri (upsert) */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const incoming = body.preferences ?? body;
    const preferences = normalizePrefs(incoming);
    await prisma.notificationPreference.upsert({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      },
      update: { prefs: preferences as never },
      create: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        prefs: preferences as never,
      },
    });
    return apiOk({ success: true, preferences });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan preferensi notifikasi.', 500);
  }
}
