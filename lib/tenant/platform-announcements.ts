// Pengumuman Master → tenant (§7.8, Fase 7).
//
// Isi pengumuman disimpan di master (PlatformAnnouncement); saat publish,
// satu baris Announcement dibuat di DB tiap tenant target (fan-out) dengan
// penanda filters { platform: true, platformBatchId, platformAnnouncementId }
// sehingga muncul di daftar pengumuman tenant seperti pengumuman biasa,
// ditambah badge "Dari Administrator Pusat" di UI tenant.
//
// Status terkirim per tenant HANYA dibaca dari PlatformAnnouncementDelivery
// di master (§7.8.3) — JANGAN PERNAH membaca baris Announcement di DB
// tenant dari sisi Master.
//
// Pola fan-out (penerima, preferensi, notifikasi in-app, email best-effort)
// mengikuti lib/pengumuman/server.ts `fanOutAnnouncement`, tapi dijalankan
// dengan tenant client eksplisit (getTenantClientForCode) karena rute
// platform berjalan tanpa konteks tenant (tenantContext: false).

import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { masterPrisma } from './master';
import { getTenantClientForCode } from './resolver';
import {
  MAX_EMAIL_RECIPIENTS,
  isSmtpConfigured,
  sendAnnouncementEmail,
} from '@/lib/mailer';
import {
  announcementLink,
  parseChannels,
} from '@/lib/pengumuman/server';
import {
  isAppAllowed,
  isEmailAllowed,
  mergePrefs,
} from '@/lib/pengumuman/preferences';

export type PlatformTargetType = 'ALL' | 'PACKAGE' | 'TENANTS';

export interface PackageTarget {
  userTierId?: string;
  storageTierId?: string;
  moduleKey?: string;
}

export interface TargetTenant {
  tenantId: string;
  tenantCode: string;
  companyName: string;
}

export interface SkippedTenant {
  tenantId: string;
  reason: string;
}

export interface PublishResultItem {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  announcementId: string | null;
  status: string;
  sentAt: string | null;
  recipients: number;
  inAppSent: number;
  email: { status: string; sent: number; failed: number };
  error: string | null;
}

export interface PublishSummary {
  announcementId: string;
  batchId: string;
  title: string;
  alreadySent: boolean;
  results: PublishResultItem[];
  sentCount: number;
  failedCount: number;
  skippedCount: number;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function parsePackageTarget(raw: unknown): PackageTarget {
  const o = asObject(raw);
  return {
    userTierId: asString(o.userTierId),
    storageTierId: asString(o.storageTierId),
    moduleKey: asString(o.moduleKey),
  };
}

export function parseTenantIds(raw: unknown): string[] {
  const o = asObject(raw);
  const ids = Array.isArray(o.tenantIds) ? o.tenantIds : [];
  return ids.filter((x): x is string => typeof x === 'string' && !!x);
}

/**
 * Resolve tenant tujuan. PACKAGE hanya mencocokkan tenant yang paketnya
 * TERCATAT (userTierId/storageTierId/moduleKeys di Subscription master);
 * tenant lama tanpa paket tidak ikut target paket (bukan grandfathering di
 * sini — penargetan paket memang untuk tenant yang paketnya tercatat).
 */
export async function resolveTargetTenants(
  targetType: PlatformTargetType,
  targetJson: unknown
): Promise<{ targets: TargetTenant[]; skipped: SkippedTenant[] }> {
  if (targetType === 'ALL') {
    const rows = await masterPrisma.tenant.findMany({
      where: { tenantStatus: 'ACTIVE' },
      select: { id: true, tenantCode: true, companyName: true },
      orderBy: { companyName: 'asc' },
    });
    return {
      targets: rows.map((t) => ({
        tenantId: t.id,
        tenantCode: t.tenantCode,
        companyName: t.companyName,
      })),
      skipped: [],
    };
  }

  if (targetType === 'TENANTS') {
    const ids = parseTenantIds(targetJson);
    const rows = await masterPrisma.tenant.findMany({
      where: { id: { in: ids } },
      select: { id: true, tenantCode: true, companyName: true, tenantStatus: true },
      orderBy: { companyName: 'asc' },
    });
    const byId = new Map(rows.map((t) => [t.id, t]));
    const targets: TargetTenant[] = [];
    const skipped: SkippedTenant[] = [];
    for (const id of ids) {
      const t = byId.get(id);
      if (!t) skipped.push({ tenantId: id, reason: 'Tenant tidak ditemukan.' });
      else if (t.tenantStatus !== 'ACTIVE')
        skipped.push({ tenantId: id, reason: `Tenant tidak aktif (${t.tenantStatus}).` });
      else
        targets.push({ tenantId: t.id, tenantCode: t.tenantCode, companyName: t.companyName });
    }
    return { targets, skipped };
  }

  // PACKAGE
  const f = parsePackageTarget(targetJson);
  if (!f.userTierId && !f.storageTierId && !f.moduleKey) {
    throw new Error('Pilih minimal satu filter paket (tier pengguna, tier storage, atau modul).');
  }
  const subs = await masterPrisma.subscription.findMany({
    where: {
      tenant: { tenantStatus: 'ACTIVE' },
      ...(f.userTierId ? { userTierId: f.userTierId } : {}),
      ...(f.storageTierId ? { storageTierId: f.storageTierId } : {}),
    },
    select: {
      tenantId: true,
      userTierId: true,
      storageTierId: true,
      moduleKeys: true,
      tenant: { select: { tenantCode: true, companyName: true } },
    },
  });
  const targets: TargetTenant[] = [];
  for (const s of subs) {
    // Filter tier yang diisi harus cocok persis; tenant tanpa tier refs
    // (userTierId null) tidak cocok bila filter tier diisi.
    if (f.userTierId && s.userTierId !== f.userTierId) continue;
    if (f.storageTierId && s.storageTierId !== f.storageTierId) continue;
    if (f.moduleKey && !(s.moduleKeys ?? []).includes(f.moduleKey)) continue;
    targets.push({
      tenantId: s.tenantId,
      tenantCode: s.tenant.tenantCode,
      companyName: s.tenant.companyName,
    });
  }
  targets.sort((a, b) => a.companyName.localeCompare(b.companyName));
  return { targets, skipped: [] };
}

/** Anggota aktif tenant (Membership ACTIVE + mirror User ACTIVE + email terisi). */
async function getTenantActiveMembers(
  client: TenantPrismaClient,
  tenantId: string
): Promise<Array<{ id: string; name: string; email: string }>> {
  const memberships = await client.membership.findMany({
    where: { organizationId: tenantId, status: 'ACTIVE' },
    orderBy: { joinedAt: 'asc' },
  });
  const userIds = [...new Set(memberships.map((m) => m.userId))];
  const users = userIds.length
    ? await client.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, status: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const seen = new Set<string>();
  const members: Array<{ id: string; name: string; email: string }> = [];
  for (const m of memberships) {
    const u = byId.get(m.userId);
    if (!u || u.status !== 'ACTIVE' || !u.email) continue;
    const email = u.email.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    members.push({ id: u.id, name: u.name, email: u.email });
  }
  return members;
}

interface FanOutOutcome {
  tenantAnnouncementId: string;
  recipients: number;
  inAppSent: number;
  email: { status: string; sent: number; failed: number };
}

/**
 * Fan-out SATU pengumuman platform ke SATU tenant: buat baris Announcement
 * (published) + Notification in-app + email best-effort. Mengikuti
 * `fanOutAnnouncement` (lib/pengumuman/server.ts) tapi dengan tenant client
 * eksplisit — proxy `prisma` tidak bisa dipakai di rute platform.
 */
async function fanOutToTenant(
  client: TenantPrismaClient,
  tenant: TargetTenant,
  input: {
    batchId: string;
    platformAnnouncementId: string;
    title: string;
    summary: string;
    content: string;
    imageUrl: string | null;
    category: string;
    priority: string;
    channels: { app: boolean; email: boolean };
    authorId: string;
  }
): Promise<FanOutOutcome> {
  const recipients = await getTenantActiveMembers(client, tenant.tenantId);
  if (recipients.length === 0) {
    throw new Error('Tidak ada anggota aktif di tenant ini.');
  }
  const recipientEmails = recipients.map((m) => m.email);
  const channels = input.channels;

  const prefRows = await client.notificationPreference.findMany({
    where: {
      organizationId: tenant.tenantId,
      userId: { in: recipients.map((m) => m.id) },
    },
  });
  const prefByUser = new Map(
    prefRows.map((p) => [p.userId, mergePrefs(p.prefs)])
  );
  const prefsOf = (userId: string) => prefByUser.get(userId) ?? mergePrefs({});
  const appRecipients = channels.app
    ? recipients.filter((m) => isAppAllowed(prefsOf(m.id), input.priority))
    : [];
  const emailCandidates = channels.email
    ? recipients.filter((m) => isEmailAllowed(prefsOf(m.id), input.priority))
    : [];
  const emailTruncated = emailCandidates.length > MAX_EMAIL_RECIPIENTS;
  const emailRecipients = emailCandidates.slice(0, MAX_EMAIL_RECIPIENTS);

  // 1) Baris pengumuman (published) + notifikasi in-app dalam satu transaksi.
  const created = await client.$transaction(async (tx) => {
    const row = await tx.announcement.create({
      data: {
        organizationId: tenant.tenantId,
        authorId: input.authorId,
        title: input.title,
        summary: input.summary,
        content: input.content,
        imageUrl: input.imageUrl,
        category: input.category,
        priority: input.priority,
        targetMode: 'all',
        target: {},
        filters: {
          platform: true,
          platformBatchId: input.batchId,
          platformAnnouncementId: input.platformAnnouncementId,
        },
        channels,
        status: 'published',
        sentAt: new Date(),
        recipientEmails,
        emailStatus: channels.email ? 'pending' : 'not_requested',
        emailSent: 0,
        emailFailed: 0,
        emailError: null,
      },
    });
    if (appRecipients.length > 0) {
      await tx.notification.createMany({
        data: appRecipients.map((m) => ({
          organizationId: tenant.tenantId,
          userId: m.id,
          type: 'PENGUMUMAN',
          title: input.title,
          body: input.summary || input.content.slice(0, 160),
        })),
      });
    }
    return row;
  });

  // 2) Email (best-effort, di luar transaksi) — pola fanOutAnnouncement.
  let emailStatus = channels.email ? 'pending' : 'not_requested';
  let emailSent = 0;
  let emailFailed = 0;
  let emailError: string | null = null;
  if (channels.email) {
    if (emailRecipients.length === 0) {
      emailStatus = 'skipped';
      emailError = 'Tidak ada penerima email.';
    } else if (!(await isSmtpConfigured())) {
      emailStatus = 'not_configured';
      emailError =
        'SMTP belum dikonfigurasi. Isi pengaturan SMTP di Pengaturan Sistem (/admin/pengaturan).';
    } else {
      const link = announcementLink(created.id);
      for (const m of emailRecipients) {
        const res = await sendAnnouncementEmail({
          to: m.email,
          name: m.name,
          title: input.title,
          summary: input.summary || input.content.slice(0, 160),
          link,
        });
        if (res.ok) emailSent += 1;
        else {
          emailFailed += 1;
          if (!emailError) emailError = res.error ?? 'Gagal mengirim email.';
        }
      }
      emailStatus =
        emailFailed === 0 ? 'sent' : emailSent === 0 ? 'failed' : 'partial';
      if (emailTruncated) {
        const note = 'Dibatasi 100 penerima per pengiriman.';
        emailError = emailError ? `${emailError} ${note}` : note;
      }
    }
    await client.announcement.update({
      where: { id: created.id },
      data: { emailStatus, emailSent, emailFailed, emailError },
    });
  }

  return {
    tenantAnnouncementId: created.id,
    recipients: recipients.length,
    inAppSent: appRecipients.length,
    email: { status: emailStatus, sent: emailSent, failed: emailFailed },
  };
}

function deliveryToResult(
  d: {
    tenantId: string;
    tenantCode: string;
    tenantName: string;
    tenantAnnouncementId: string | null;
    status: string;
    sentAt: Date | null;
    recipientCount: number;
    emailStatus: string;
    emailSent: number;
    emailFailed: number;
    error: string | null;
  },
  inAppSent: number | null = null
): PublishResultItem {
  return {
    tenantId: d.tenantId,
    tenantCode: d.tenantCode,
    tenantName: d.tenantName,
    announcementId: d.tenantAnnouncementId,
    status: d.status === 'SENT' ? 'published' : d.status === 'SKIPPED' ? 'skipped' : 'draft',
    sentAt: d.sentAt ? d.sentAt.toISOString() : null,
    recipients: d.recipientCount,
    inAppSent: inAppSent ?? d.recipientCount,
    email: { status: d.emailStatus, sent: d.emailSent, failed: d.emailFailed },
    error: d.error,
  };
}

async function buildSummary(
  announcement: {
    id: string;
    batchId: string;
    title: string;
    status: string;
  },
  alreadySent: boolean
): Promise<PublishSummary> {
  const deliveries = await masterPrisma.platformAnnouncementDelivery.findMany({
    where: { announcementId: announcement.id },
    orderBy: { tenantName: 'asc' },
  });
  const results = deliveries.map((d) => deliveryToResult(d));
  return {
    announcementId: announcement.id,
    batchId: announcement.batchId,
    title: announcement.title,
    alreadySent,
    results,
    sentCount: deliveries.filter((d) => d.status === 'SENT').length,
    failedCount: deliveries.filter((d) => d.status === 'FAILED').length,
    skippedCount: deliveries.filter((d) => d.status === 'SKIPPED').length,
  };
}

/**
 * Terbitkan satu PlatformAnnouncement (DRAFT) ke semua tenant target.
 * Idempotent: bila sudah PUBLISHED, kembalikan ringkasan existing tanpa
 * membuat baris baru di tenant mana pun.
 */
export async function publishPlatformAnnouncement(
  announcementId: string,
  actorUserId: string
): Promise<PublishSummary> {
  const announcement = await masterPrisma.platformAnnouncement.findUnique({
    where: { id: announcementId },
  });
  if (!announcement) {
    throw new Error('Pengumuman platform tidak ditemukan.');
  }
  if (announcement.status === 'PUBLISHED') {
    return buildSummary(announcement, true);
  }

  const targetJson = JSON.parse(announcement.targetJson || '{}') as unknown;
  const { targets, skipped } = await resolveTargetTenants(
    announcement.targetType as PlatformTargetType,
    targetJson
  );
  if (targets.length === 0) {
    throw new Error(
      skipped.length > 0
        ? 'Tidak ada tenant tujuan yang aktif.'
        : 'Tidak ada tenant yang cocok dengan target ini.'
    );
  }

  // Kanal disimpan bersama targetJson saat create (lihat
  // createPlatformAnnouncement); absen = default { app: true, email: false }.
  const effectiveChannels = parseChannels(
    asObject(JSON.parse(announcement.targetJson || '{}')).channels
  );

  // Delivery rows: PENDING untuk target, SKIPPED untuk yang dilewati.
  for (const t of targets) {
    await masterPrisma.platformAnnouncementDelivery.upsert({
      where: {
        announcementId_tenantId: {
          announcementId: announcement.id,
          tenantId: t.tenantId,
        },
      },
      create: {
        announcementId: announcement.id,
        tenantId: t.tenantId,
        tenantCode: t.tenantCode,
        tenantName: t.companyName,
        status: 'PENDING',
      },
      update: {},
    });
  }
  for (const s of skipped) {
    const row = await masterPrisma.tenant.findUnique({
      where: { id: s.tenantId },
      select: { tenantCode: true, companyName: true },
    });
    await masterPrisma.platformAnnouncementDelivery.upsert({
      where: {
        announcementId_tenantId: {
          announcementId: announcement.id,
          tenantId: s.tenantId,
        },
      },
      create: {
        announcementId: announcement.id,
        tenantId: s.tenantId,
        tenantCode: row?.tenantCode ?? '',
        tenantName: row?.companyName ?? s.tenantId,
        status: 'SKIPPED',
        error: s.reason,
      },
      update: { status: 'SKIPPED', error: s.reason },
    });
  }

  // Fan-out per tenant; gagal di satu tenant tidak menggagalkan yang lain.
  for (const t of targets) {
    try {
      const client = await getTenantClientForCode(t.tenantCode);
      const out = await fanOutToTenant(client, t, {
        batchId: announcement.batchId,
        platformAnnouncementId: announcement.id,
        title: announcement.title,
        summary: announcement.summary,
        content: announcement.content,
        imageUrl: announcement.imageUrl,
        category: announcement.category,
        priority: announcement.priority,
        channels: effectiveChannels,
        authorId: actorUserId,
      });
      await masterPrisma.platformAnnouncementDelivery.update({
        where: {
          announcementId_tenantId: {
            announcementId: announcement.id,
            tenantId: t.tenantId,
          },
        },
        data: {
          status: 'SENT',
          tenantAnnouncementId: out.tenantAnnouncementId,
          recipientCount: out.recipients,
          emailStatus: out.email.status,
          emailSent: out.email.sent,
          emailFailed: out.email.failed,
          sentAt: new Date(),
          error: null,
        },
      });
    } catch (e: any) {
      const message =
        e instanceof Error ? e.message : 'Gagal mengirim ke tenant ini.';
      await masterPrisma.platformAnnouncementDelivery.update({
        where: {
          announcementId_tenantId: {
            announcementId: announcement.id,
            tenantId: t.tenantId,
          },
        },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  await masterPrisma.platformAnnouncement.update({
    where: { id: announcement.id },
    data: { status: 'PUBLISHED', sentAt: new Date() },
  });

  const summary = await buildSummary(announcement, false);
  await masterPrisma.platformAuditLog.create({
    data: {
      actorUserId,
      action: 'PLATFORM_ANNOUNCEMENT_PUBLISHED',
      tenantId: null,
      metadata: JSON.stringify({
        batchId: announcement.batchId,
        targetType: announcement.targetType,
        sentCount: summary.sentCount,
        failedCount: summary.failedCount,
        skippedCount: summary.skippedCount,
      }),
    },
  });
  return summary;
}

export interface CreatePlatformAnnouncementInput {
  title: string;
  summary: string;
  content: string;
  imageUrl: string | null;
  category: string;
  priority: string;
  channels: { app: boolean; email: boolean };
  targetType: PlatformTargetType;
  targetJson: Record<string, unknown>;
  batchId: string;
  createdByUserId: string;
}

/** Buat baris DRAFT master (belum terkirim ke tenant mana pun). */
export async function createPlatformAnnouncement(
  input: CreatePlatformAnnouncementInput
) {
  return masterPrisma.platformAnnouncement.create({
    data: {
      title: input.title,
      summary: input.summary,
      content: input.content,
      imageUrl: input.imageUrl,
      category: input.category,
      priority: input.priority,
      targetType: input.targetType,
      // Kanal disimpan bersama target (satu-satunya blob JSON pengumuman).
      targetJson: JSON.stringify({ ...input.targetJson, channels: input.channels }),
      status: 'DRAFT',
      batchId: input.batchId,
      createdByUserId: input.createdByUserId,
    },
  });
}

export interface PlatformBatchItem {
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
  orgs: Array<{
    tenantId: string;
    tenantCode: string;
    tenantName: string;
    announcementId: string | null;
    status: string;
    sentAt: string | null;
    recipientCount: number;
    emailStatus: string;
    error: string | null;
  }>;
}

/** Daftar batch pengumuman platform (master saja — tanpa baca DB tenant). */
export async function listPlatformAnnouncements(page = 1, pageSize = 20): Promise<{
  batches: PlatformBatchItem[];
  page: number;
  total: number;
}> {
  const total = await masterPrisma.platformAnnouncement.count();
  const rows = await masterPrisma.platformAnnouncement.findMany({
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const ids = rows.map((r) => r.id);
  const deliveries = ids.length
    ? await masterPrisma.platformAnnouncementDelivery.findMany({
        where: { announcementId: { in: ids } },
        orderBy: { tenantName: 'asc' },
      })
    : [];
  const byAnnouncement = new Map<string, typeof deliveries>();
  for (const d of deliveries) {
    const list = byAnnouncement.get(d.announcementId) ?? [];
    list.push(d);
    byAnnouncement.set(d.announcementId, list);
  }
  const authorIds = [...new Set(rows.map((r) => r.createdByUserId))];
  const authors = authorIds.length
    ? await masterPrisma.platformUser.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true },
      })
    : [];
  const authorById = new Map(authors.map((a) => [a.id, a.name]));

  const batches: PlatformBatchItem[] = rows.map((r) => {
    const orgs = (byAnnouncement.get(r.id) ?? []).map((d) => ({
      tenantId: d.tenantId,
      tenantCode: d.tenantCode,
      tenantName: d.tenantName,
      announcementId: d.tenantAnnouncementId,
      status: d.status === 'SENT' ? 'published' : d.status === 'SKIPPED' ? 'skipped' : 'draft',
      sentAt: d.sentAt ? d.sentAt.toISOString() : null,
      recipientCount: d.recipientCount,
      emailStatus: d.emailStatus,
      error: d.error,
    }));
    return {
      batchId: r.batchId,
      title: r.title,
      summary: r.summary,
      priority: r.priority,
      targetType: r.targetType,
      authorName: authorById.get(r.createdByUserId) ?? '',
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      totalKantor: orgs.length,
      terkirim: orgs.filter((o) => o.status === 'published').length,
      gagal: orgs.filter((o) => o.status === 'draft').length,
      dilewati: orgs.filter((o) => o.status === 'skipped').length,
      orgs,
    };
  });
  return { batches, page, total };
}

/** Daftar tenant ACTIVE untuk picker "pilih tenant tertentu" + hitung anggota. */
export async function getActiveTenantsForPicker(): Promise<
  Array<{ id: string; name: string; tenantCode: string; memberCount: number }>
> {
  const tenants = await masterPrisma.tenant.findMany({
    where: { tenantStatus: 'ACTIVE' },
    select: { id: true, tenantCode: true, companyName: true },
    orderBy: { companyName: 'asc' },
  });
  const memberships = await masterPrisma.tenantMembership.findMany({
    where: {
      tenantId: { in: tenants.map((t) => t.id) },
      membershipStatus: 'ACTIVE',
    },
    select: { tenantId: true },
  });
  const byTenant = new Map<string, number>();
  for (const m of memberships) {
    byTenant.set(m.tenantId, (byTenant.get(m.tenantId) ?? 0) + 1);
  }
  return tenants.map((t) => ({
    id: t.id,
    name: t.companyName,
    tenantCode: t.tenantCode,
    memberCount: byTenant.get(t.id) ?? 0,
  }));
}
