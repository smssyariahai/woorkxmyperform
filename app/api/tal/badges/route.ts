import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  isTalAdmin,
  listBadges,
  listStoredProgress,
  mapTalBadge,
  parseBadgeInput,
} from '@/lib/tal/gamification';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tal/badges — katalog badge organisasi + progres tersimpan user.
 * Baca: semua user login (§5.1 fondasi). Katalog kosong -> 9 badge bawaan
 * di-seed otomatis (DEFAULT_TAL_BADGES). Progres live dihitung di
 * GET /api/tal/gamification; di sini yang dikembalikan adalah progres
 * tersimpan terakhir (diperbarui setiap evaluasi gamifikasi).
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const yearRaw = Number(url.searchParams.get('year') || new Date().getFullYear());
    const seasonYear = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
    const [badges, progress] = await Promise.all([
      listBadges(ctx.organizationId),
      listStoredProgress(ctx.organizationId, ctx.userId, seasonYear),
    ]);
    return apiOk({ badges, progress, seasonYear });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat katalog badge.', 500);
  }
}

/**
 * POST /api/tal/badges — buat / perbarui badge (upsert per kode badge).
 * Tulis: admin saja (§5.3 fondasi: isSuperAdmin / OWNER / ADMIN).
 * Dipakai TalBadgeManagementTab (tab admin kalender) + seed manual.
 * CATATAN: tidak menulis TalAuditLog — fondasi §1.14 tidak mendefinisikan
 * actionType untuk pengelolaan badge.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    if (!isTalAdmin(ctx)) {
      return apiErr('Anda tidak memiliki akses mengelola badge TAL.', 403);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseBadgeInput(body);
    if (parsed.error) return apiErr(parsed.error, 400);
    const d = parsed.data!;
    // Payload JSON Prisma: levels adalah array objek bertipe — cast eksplisit.
    const payload = {
      icon: d.icon,
      iconColor: d.iconColor,
      category: d.category,
      metricType: d.metricType,
      metricUnit: d.metricUnit,
      max_level: d.max_level,
      levels: d.levels,
      status: d.status,
      isGlow: d.isGlow,
    } as unknown as Prisma.InputJsonValue;
    const saved = await prisma.talBadge.upsert({
      where: { organizationId_badgeId: { organizationId: ctx.organizationId, badgeId: d.code } },
      create: {
        organizationId: ctx.organizationId,
        badgeId: d.code,
        name: d.title,
        description: d.description,
        payload,
      },
      update: {
        name: d.title,
        description: d.description,
        payload,
      },
    });
    return apiOk({ badge: mapTalBadge(saved) }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan badge.', 500);
  }
}
