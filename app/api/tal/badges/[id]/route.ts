import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  isTalAdmin,
  mapTalBadge,
  parseBadgeInput,
  checkBadgeHasAchievements,
} from '@/lib/tal/gamification';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

async function findBadge(organizationId: string, code: string) {
  return prisma.talBadge.findUnique({
    where: { organizationId_badgeId: { organizationId, badgeId: code } },
  });
}

/**
 * PATCH /api/tal/badges/[id] — ubah status (active/inactive/archived) atau
 * perbarui isi badge. Tulis: admin saja (§5.3 fondasi).
 * - Body { status } saja -> hanya status yang diubah (toggle/archive/restore).
 * - Body berisi field badge (title/levels/...) -> validasi penuh via
 *   parseBadgeInput (kode diambil dari URL, bukan body).
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (!isTalAdmin(ctx)) {
      return apiErr('Anda tidak memiliki akses mengelola badge TAL.', 403);
    }
    const code = decodeURIComponent(params.id || '').trim().toUpperCase();
    if (!code) return apiErr('Kode badge tidak valid.', 400);
    const row = await findBadge(ctx.organizationId, code);
    if (!row) return apiErr('Badge tidak ditemukan.', 404);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const keys = Object.keys(body);

    // Hanya status -> update status di payload saja.
    if (keys.length > 0 && keys.every((k) => k === 'status')) {
      const status = String(body.status ?? '');
      if (!['active', 'inactive', 'archived'].includes(status)) {
        return apiErr('Status badge tidak dikenal.', 400);
      }
      const payload = { ...(row.payload as Record<string, unknown>), status };
      const saved = await prisma.talBadge.update({
        where: { id: row.id },
        data: { payload },
      });
      return apiOk({ badge: mapTalBadge(saved) });
    }

    // Update penuh: validasi seperti POST, kode dari URL.
    const parsed = parseBadgeInput({ ...body, badgeId: code, code });
    if (parsed.error) return apiErr(parsed.error, 400);
    const d = parsed.data!;
    const saved = await prisma.talBadge.update({
      where: { id: row.id },
      data: {
        name: d.title,
        description: d.description,
        payload: {
          icon: d.icon,
          iconColor: d.iconColor,
          category: d.category,
          metricType: d.metricType,
          metricUnit: d.metricUnit,
          max_level: d.max_level,
          levels: d.levels,
          status: d.status,
          isGlow: d.isGlow,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return apiOk({ badge: mapTalBadge(saved) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui badge.', 500);
  }
}

/**
 * DELETE /api/tal/badges/[id] — hapus badge.
 * Ditolak (409) bila badge sudah punya capaian (progres level > 0 / trofi);
 * arsipkan (status archived) sebagai gantinya.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    if (!isTalAdmin(ctx)) {
      return apiErr('Anda tidak memiliki akses mengelola badge TAL.', 403);
    }
    const code = decodeURIComponent(params.id || '').trim().toUpperCase();
    if (!code) return apiErr('Kode badge tidak valid.', 400);
    const row = await findBadge(ctx.organizationId, code);
    if (!row) return apiErr('Badge tidak ditemukan.', 404);
    if (await checkBadgeHasAchievements(ctx.organizationId, code)) {
      return apiErr(
        'Badge sudah punya capaian pengguna — arsipkan saja (status archived), jangan dihapus.',
        409,
      );
    }
    await prisma.talBadge.delete({ where: { id: row.id } });
    return apiOk({ deleted: true, badgeId: code });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus badge.', 500);
  }
}
