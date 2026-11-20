import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getDeadlineSettings,
  isTalAdmin,
  normalizeDeadlineSettings,
} from '@/lib/tal/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tal/deadline-settings — baca TalDeadlineSetting organisasi.
 * Belum ada baris → kembalikan default (JANGAN 404; pola
 * GET /api/pengumuman/preferences Gelombang 3).
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const settings = await getDeadlineSettings(ctx.organizationId);
    return apiOk({ settings });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan deadline TAL.', 500);
  }
}

/** POST /api/tal/deadline-settings — simpan (upsert per org). Admin-only (§5.3). */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    if (!isTalAdmin(ctx)) {
      return apiErr('Hanya Administrator yang boleh mengubah pengaturan deadline TAL.', 403);
    }
    const body = await req.json().catch(() => ({}));
    const settings = normalizeDeadlineSettings(body.settings ?? body);
    const row = await prisma.talDeadlineSetting.upsert({
      where: { organizationId: ctx.organizationId },
      create: {
        organizationId: ctx.organizationId,
        settings: settings as any,
        updatedBy: ctx.userId,
      },
      update: { settings: settings as any, updatedBy: ctx.userId },
    });
    return apiOk({ settings: normalizeDeadlineSettings(row.settings) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan deadline TAL.', 500);
  }
}
