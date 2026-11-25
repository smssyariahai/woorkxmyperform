import { randomUUID } from 'node:crypto';
// Rute super-admin / platform (Fase 7 §7.8): pengumuman Master → tenant.
// Isi + status terkirim disimpan di MASTER (PlatformAnnouncement +
// PlatformAnnouncementDelivery); baris Announcement di DB tenant dibuat
// saat publish (fan-out). JANGAN membaca baris Announcement tenant dari
// sini (§7.8.3) — status per tenant hanya dari delivery master.
// JANGAN pakai proxy `prisma` — rute platform memakai legacy + master.
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  parseAnnouncementInput,
  PRIORITIES,
} from '@/lib/pengumuman/server';
import {
  createPlatformAnnouncement,
  getActiveTenantsForPicker,
  listPlatformAnnouncements,
  parsePackageTarget,
  parseTenantIds,
  publishPlatformAnnouncement,
  type PlatformTargetType,
} from '@/lib/tenant/platform-announcements';
import { masterPrisma } from '@/lib/tenant/master';

export const dynamic = 'force-dynamic';

export interface BatchTenantStatus {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  announcementId: string | null;
  status: string;
  sentAt: string | null;
  recipientCount: number;
  emailStatus: string;
  error: string | null;
}

export interface PlatformBatch {
  batchId: string;
  title: string;
  summary: string;
  priority: string;
  targetType: string;
  authorName: string;
  createdAt: string;
  sentAt: string | null;
  totalKantor: number;
  terkirim: number;
  gagal: number;
  dilewati: number;
  orgs: BatchTenantStatus[];
}

/** GET /api/admin/pengumuman — daftar tenant aktif + batch pengumuman platform. */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_ANNOUNCEMENTS_VIEW', req);
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
    const [tenants, { batches, total }] = await Promise.all([
      getActiveTenantsForPicker(),
      listPlatformAnnouncements(page, 20),
    ]);
    return apiOk({
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        tenantCode: t.tenantCode,
        memberCount: t.memberCount,
      })),
      batches,
      page,
      total,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengumuman platform.', 500);
  }
}

/**
 * POST /api/admin/pengumuman — kirim pengumuman platform ke tenant tujuan.
 * Body: { title, summary?, content?, priority?, category?, channels?,
 *         target: 'all' | { package: { userTierId?, storageTierId?, moduleKey? } }
 *                 | { tenantIds: string[] }, batchId? }
 * Idempotent tingkat batch: batchId yang sudah pernah dipakai mengembalikan
 * ringkasan batch lama tanpa duplikat.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_ANNOUNCEMENTS_MANAGE',
      req
    );
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const { data, error } = parseAnnouncementInput(body, false);
    if (error) return apiErr(error, 400);
    const priority = data!.priority ?? 'normal';
    if (!(PRIORITIES as readonly string[]).includes(priority)) {
      return apiErr('Prioritas tidak valid.', 400);
    }
    const channels = data!.channels ?? { app: true, email: false };

    // Target: 'all' = semua tenant AKTIF; { package } = tenant yang paketnya
    // cocok; { tenantIds } = tenant tertentu yang AKTIF.
    const target = body.target;
    let targetType: PlatformTargetType = 'ALL';
    let targetJson: Record<string, unknown> = {};
    if (target === 'all' || target === undefined) {
      targetType = 'ALL';
    } else if (target && typeof target === 'object') {
      const t = target as Record<string, unknown>;
      if (t.package && typeof t.package === 'object') {
        const pkg = parsePackageTarget(t.package);
        if (!pkg.userTierId && !pkg.storageTierId && !pkg.moduleKey) {
          return apiErr(
            'Pilih minimal satu filter paket (tier pengguna, tier storage, atau modul).',
            400
          );
        }
        targetType = 'PACKAGE';
        targetJson = { ...pkg };
      } else if (Array.isArray(t.tenantIds)) {
        const ids = parseTenantIds(t);
        if (ids.length === 0) {
          return apiErr('Pilih minimal satu tenant tujuan.', 400);
        }
        targetType = 'TENANTS';
        targetJson = { tenantIds: ids };
      } else if (Array.isArray((t as any).organizationIds)) {
        return apiErr(
          'Target organizationIds (kantor legacy) tidak lagi didukung — pilih tenant tujuan.',
          400
        );
      } else {
        return apiErr('Target tenant tidak valid.', 400);
      }
    } else {
      return apiErr('Target tenant tidak valid.', 400);
    }

    const batchId =
      typeof body.batchId === 'string' && body.batchId.trim()
        ? body.batchId.trim()
        : randomUUID();

    // Idempotensi batch: batchId yang sudah ada → kembalikan ringkasannya.
    const existing = await masterPrisma.platformAnnouncement.findUnique({
      where: { batchId },
    });
    if (existing) {
      // Sudah pernah dikirim → ringkasan existing (idempotent). Masih DRAFT
      // (publish sebelumnya gagal sebelum selesai) → coba kirim ulang.
      const summary = await publishPlatformAnnouncement(existing.id, ctx.userId);
      return apiOk({
        batchId,
        title: data!.title,
        alreadySent: existing.status === 'PUBLISHED',
        results: summary.results,
        sentCount: summary.sentCount,
        failedCount: summary.failedCount,
        skippedCount: summary.skippedCount,
      });
    }

    const created = await createPlatformAnnouncement({
      title: data!.title!,
      summary: data!.summary ?? '',
      content: data!.content ?? '',
      imageUrl: data!.imageUrl ?? null,
      category: data!.category ?? 'announcement',
      priority,
      channels,
      targetType,
      targetJson,
      batchId,
      createdByUserId: ctx.userId,
    });

    const summary = await publishPlatformAnnouncement(created.id, ctx.userId);
    return apiOk({
      batchId,
      title: data!.title,
      alreadySent: false,
      results: summary.results,
      sentCount: summary.sentCount,
      failedCount: summary.failedCount,
      skippedCount: summary.skippedCount,
      _note:
        summary.skippedCount > 0
          ? `${summary.skippedCount} tenant dilewati (tidak ditemukan / non-aktif).`
          : undefined,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e?.message || 'Gagal mengirim pengumuman platform.', 500);
  }
}
