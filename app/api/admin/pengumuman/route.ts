import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import {
  fanOutAnnouncement,
  parseAnnouncementInput,
  PRIORITIES,
  type AnnouncementRow,
} from '@/lib/pengumuman/server';

export const dynamic = 'force-dynamic';

/**
 * Jejak pengiriman platform: SATU batch id (UUID) disimpan bersama di field
 * Json `filters` tiap baris Announcement per-kantor:
 *   filters = { platform: true, platformBatchId: "<uuid>" }
 * `filters` dipilih karena tidak pernah dibaca alur per-kantor (hanya disimpan
 * + dikembalikan mapAnnouncement) — berbeda dengan `target` yang dibaca
 * resolveRecipients. Status terkirim per kantor dibaca dari tiap baris
 * (status / sentAt / recipientEmails) — tidak ada sumber kebenaran kedua.
 */
const PLATFORM_BATCH_KEY = 'platformBatchId';

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function batchIdOf(row: { filters: unknown }): string | null {
  const f = asObject(row.filters);
  const b = f[PLATFORM_BATCH_KEY];
  return typeof b === 'string' && b ? b : null;
}

export interface BatchOrgStatus {
  organizationId: string;
  organizationName: string;
  announcementId: string;
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
  authorName: string;
  createdAt: string;
  totalKantor: number;
  terkirim: number;
  gagal: number;
  orgs: BatchOrgStatus[];
}

function toBatchOrg(
  row: AnnouncementRow & { organization?: { name: string } | null },
  error: string | null = null
): BatchOrgStatus {
  const recipients = Array.isArray(row.recipientEmails)
    ? row.recipientEmails
    : [];
  return {
    organizationId: row.organizationId ?? '',
    organizationName: row.organization?.name ?? '',
    announcementId: row.id,
    status: row.status,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    recipientCount: recipients.length,
    emailStatus: row.emailStatus,
    error,
  };
}

async function listBatches(): Promise<PlatformBatch[]> {
  // Agregasi di JavaScript: jumlah baris platform kecil (satu baris per
  // kantor per batch); batas 500 baris terbaru sudah lebih dari cukup.
  const rows = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      author: { select: { name: true, email: true } },
      organization: { select: { name: true } },
    },
  });
  const byBatch = new Map<string, PlatformBatch>();
  for (const row of rows) {
    const batchId = batchIdOf(row);
    if (!batchId) continue;
    let batch = byBatch.get(batchId);
    if (!batch) {
      batch = {
        batchId,
        title: row.title,
        summary: row.summary,
        priority: row.priority,
        authorName: row.author?.name ?? '',
        createdAt: row.createdAt.toISOString(),
        totalKantor: 0,
        terkirim: 0,
        gagal: 0,
        orgs: [],
      };
      byBatch.set(batchId, batch);
    }
    // Judul/penulis/waktu batch diambil dari baris pertama (paling baru
    // dibuat belakangan tidak mungkin: satu batch dibuat sekaligus).
    batch.orgs.push(toBatchOrg(row));
    batch.totalKantor = batch.orgs.length;
    batch.terkirim = batch.orgs.filter((o) => o.status === 'published').length;
    batch.gagal = batch.orgs.filter((o) => o.status !== 'published').length;
  }
  return [...byBatch.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/** GET /api/admin/pengumuman — daftar kantor aktif + batch pengumuman platform. */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const [offices, batches] = await Promise.all([
      prisma.organization.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { memberships: true } },
        },
        orderBy: { name: 'asc' },
      }),
      listBatches(),
    ]);
    return apiOk({
      offices: offices.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        memberCount: o._count.memberships,
      })),
      batches,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengumuman platform.', 500);
  }
}

/**
 * POST /api/admin/pengumuman — kirim pengumuman platform ke kantor tujuan.
 * Body: { title, summary?, content?, priority?, category?, channels?,
 *         target: 'all' | { organizationIds: string[] }, batchId? }
 * Per kantor tujuan dibuat SATU Announcement (author = admin pusat yang
 * login) lalu di-fan-out seperti publish per-kantor. Idempotent tingkat
 * batch: batchId yang sudah pernah dipakai mengembalikan ringkasan batch
 * lama tanpa duplikat.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
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

    // Target: 'all' = semua kantor AKTIF; atau daftar id kantor tertentu.
    const target = body.target;
    let wantedIds: string[] | null = null; // null = semua kantor aktif
    if (target === 'all' || target === undefined) {
      wantedIds = null;
    } else if (
      target &&
      typeof target === 'object' &&
      Array.isArray((target as any).organizationIds)
    ) {
      const ids: string[] = (target as any).organizationIds.filter(
        (x: unknown): x is string => typeof x === 'string' && !!x
      );
      if (ids.length === 0) {
        return apiErr('Pilih minimal satu kantor tujuan.', 400);
      }
      wantedIds = ids;
    } else {
      return apiErr('Target kantor tidak valid.', 400);
    }

    const batchId =
      typeof body.batchId === 'string' && body.batchId.trim()
        ? body.batchId.trim()
        : randomUUID();

    // Idempotensi batch: batchId yang sudah ada → kembalikan ringkasannya.
    const batches = await listBatches();
    const batch = batches.find((b) => b.batchId === batchId);
    if (batch) {
      return apiOk({
        batchId,
        title: data!.title,
        alreadySent: true,
        results:
          batch?.orgs.map((o) => ({
            organizationId: o.organizationId,
            organizationName: o.organizationName,
            announcementId: o.announcementId,
            status: o.status,
            sentAt: o.sentAt,
            recipients: o.recipientCount,
            inAppSent: o.recipientCount,
            email: { status: o.emailStatus, sent: 0, failed: 0 },
            error: null,
          })) ?? [],
        sentCount: batch?.terkirim ?? 0,
        failedCount: batch?.gagal ?? 0,
        skippedCount: 0,
      });
    }

    const orgs = await prisma.organization.findMany({
      where: {
        isActive: true,
        ...(wantedIds ? { id: { in: wantedIds } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (orgs.length === 0) {
      return apiErr(
        wantedIds
          ? 'Kantor tujuan tidak ditemukan atau sudah non-aktif.'
          : 'Tidak ada kantor aktif.',
        400
      );
    }
    // Salin ke const agar narrowing TS bertahan melewati await di atas.
    const targetIds = wantedIds;
    const skippedCount = targetIds
      ? targetIds.filter((id) => !orgs.some((o) => o.id === id)).length
      : 0;

    const results: Array<{
      organizationId: string;
      organizationName: string;
      announcementId: string | null;
      status: string;
      sentAt: string | null;
      recipients: number;
      inAppSent: number;
      email: { status: string; sent: number; failed: number };
      error: string | null;
    }> = [];

    for (const org of orgs) {
      // 1) Satu baris Announcement per kantor (draft dulu, lalu fan-out).
      const created = await prisma.announcement.create({
        data: {
          organizationId: org.id,
          authorId: ctx.userId,
          title: data!.title!,
          summary: data!.summary ?? '',
          content: data!.content ?? '',
          category: data!.category ?? 'announcement',
          priority,
          targetMode: 'all',
          target: {},
          filters: { platform: true, [PLATFORM_BATCH_KEY]: batchId },
          channels,
          status: 'draft',
        },
        include: { author: { select: { name: true, email: true } } },
      });
      // 2) Fan-out yang sama seperti publish per-kantor. Gagal di satu
      // kantor (mis. tanpa anggota aktif) tidak menggagalkan kantor lain.
      try {
        const out = await fanOutAnnouncement(created as AnnouncementRow);
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          announcementId: created.id,
          status: 'published',
          sentAt: out.announcement.sentAt,
          recipients: out.recipients,
          inAppSent: out.inAppSent,
          email: out.email,
          error: null,
        });
      } catch (e: any) {
        const message =
          e instanceof Error ? e.message : 'Gagal mengirim ke kantor ini.';
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          announcementId: created.id,
          status: 'draft',
          sentAt: null,
          recipients: 0,
          inAppSent: 0,
          email: { status: 'not_requested', sent: 0, failed: 0 },
          error: message,
        });
      }
    }

    const sentCount = results.filter((r) => r.status === 'published').length;
    const failedCount = results.length - sentCount;

    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'PLATFORM_ANNOUNCEMENT_SENT',
      module: 'PENGUMUMAN',
      description: `Pengumuman platform "${data!.title}" dikirim ke ${sentCount} dari ${results.length} kantor (batch ${batchId}).`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return apiOk({
      batchId,
      title: data!.title,
      alreadySent: false,
      results,
      sentCount,
      failedCount,
      skippedCount,
      _note:
        skippedCount > 0
          ? `${skippedCount} kantor dilewati (tidak ditemukan / non-aktif).`
          : undefined,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim pengumuman platform.', 500);
  }
}
