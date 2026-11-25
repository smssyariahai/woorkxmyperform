// lib/pengumuman/server.ts — helper server-side modul Pengumuman
// (dipakai semua route /api/pengumuman/*). Bukan client component.

import { prisma } from '@/lib/db';
import {
  isAppAllowed,
  isEmailAllowed,
  mergePrefs,
} from './preferences';
import {
  MAX_EMAIL_RECIPIENTS,
  isSmtpConfigured,
  sendAnnouncementEmail,
} from '@/lib/mailer';

export type AnnouncementRow = {
  id: string;
  organizationId?: string;
  authorId: string;
  title: string;
  summary: string;
  content: string;
  imageUrl: string | null;
  category: string;
  priority: string;
  route: string;
  customRoute: string;
  targetMode: string;
  target: unknown;
  filters: unknown;
  channels: unknown;
  recipientEmails: unknown;
  status: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  emailStatus: string;
  emailSent: number;
  emailFailed: number;
  emailError: string | null;
  createdAt: Date;
  updatedAt: Date;
  author?: { name: string; email: string } | null;
};

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

/** Bentuk JSON pengumuman yang stabil (mengikuti mapHistoryRow/mapBookmark). */
export function mapAnnouncement(row: AnnouncementRow) {
  const channels = asObject(row.channels);
  const target = asObject(row.target);
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.author?.name ?? '',
    authorEmail: row.author?.email ?? '',
    title: row.title,
    summary: row.summary,
    content: row.content,
    imageUrl: row.imageUrl,
    category: row.category,
    priority: row.priority,
    route: row.route,
    customRoute: row.customRoute,
    targetMode: row.targetMode,
    target,
    filters: asObject(row.filters),
    channels: {
      app: channels.app !== false,
      email: channels.email === true,
    },
    recipientEmails: asStringArray(row.recipientEmails),
    status: row.status,
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    emailStatus: row.emailStatus,
    emailSent: row.emailSent,
    emailFailed: row.emailFailed,
    emailError: row.emailError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function parseChannels(raw: unknown): { app: boolean; email: boolean } {
  const c = asObject(raw);
  return {
    app: c.app !== false,
    email: c.email === true,
  };
}

/** Email target dari target Json ({ userEmails: string[] }). */
export function targetUserEmails(target: unknown): string[] {
  const t = asObject(target);
  return asStringArray(t.userEmails)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export interface OrgMember {
  id: string;
  name: string;
  email: string;
}

/** Semua anggota AKTIF organisasi (membership ACTIVE + user ACTIVE + email terisi). */
export async function getActiveMembers(
  organizationId: string
): Promise<OrgMember[]> {
  const memberships = await prisma.membership.findMany({
    where: { organizationId, status: 'ACTIVE' },
    orderBy: { joinedAt: 'asc' },
  });
  // Membership TIDAK punya relasi `user` di tenant client — gabung dari
  // mirror User (Lapisan F).
  const userIds = [...new Set(memberships.map((m) => m.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, status: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const seen = new Set<string>();
  const members: OrgMember[] = [];
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

/**
 * Resolusi penerima publish untuk satu pengumuman.
 * - targetMode 'all' → semua anggota aktif.
 * - targetMode 'targeted' → irisan target.userEmails dengan anggota aktif.
 */
export async function resolveRecipients(
  organizationId: string,
  targetMode: string,
  target: unknown
): Promise<OrgMember[]> {
  const members = await getActiveMembers(organizationId);
  if (targetMode === 'targeted') {
    const wanted = new Set(targetUserEmails(target));
    return members.filter((m) => wanted.has(m.email.toLowerCase()));
  }
  return members;
}

/** URL absolut ke detail pengumuman (dipakai tautan email + salin link). */
export function announcementLink(id: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  return `${base}/pengumuman/${id}`;
}

/**
 * Lampirkan nama author ke baris pengumuman.
 * Model Announcement TENANT tidak punya relasi `author` (authorId plain
 * String) — `include: { author }` melempar di tenant client. Lookup manual
 * ini bekerja di legacy maupun tenant (keduanya punya User name/email).
 * Bila author tidak ditemukan (mis. authorId PlatformUser dari pengumuman
 * platform), author = null dan mapAnnouncement menampilkan ''.
 */
export async function attachAuthors<T extends AnnouncementRow>(
  rows: T[]
): Promise<Array<T & { author: { name: string; email: string } | null }>> {
  const ids = [...new Set(rows.map((r) => r.authorId).filter(Boolean))];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const byId = new Map(
    users.map((u) => [u.id, { name: u.name, email: u.email }])
  );
  return rows.map((r) => ({ ...r, author: byId.get(r.authorId) ?? null }));
}

export async function attachAuthor<T extends AnnouncementRow>(
  row: T
): Promise<T & { author: { name: string; email: string } | null }> {
  const [withAuthor] = await attachAuthors([row]);
  return withAuthor;
}

export const PRIORITIES = ['normal', 'penting', 'mendesak'] as const;

export interface AnnouncementInput {
  title?: string;
  summary?: string;
  content?: string;
  imageUrl?: string | null;
  category?: string;
  priority?: string;
  targetMode?: string;
  target?: any;
  filters?: any;
  channels?: { app: boolean; email: boolean };
  recipientEmails?: string[];
  scheduledAt?: Date | null;
  /** true bila body secara eksplisit mengosongkan scheduledAt. */
  scheduledAtCleared?: boolean;
}

/**
 * Validasi body buat/ubah pengumuman. partial=true → field boleh absen
 * (PATCH); partial=false → title wajib (POST). Kembalikan { data } atau
 * { error } (pesan untuk apiErr 400).
 */
export function parseAnnouncementInput(
  body: Record<string, unknown>,
  partial: boolean
): { data?: AnnouncementInput; error?: string } {
  const data: AnnouncementInput = {};

  if (body.title !== undefined || !partial) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return { error: 'Judul pengumuman wajib diisi.' };
    data.title = title;
  }
  if (body.summary !== undefined) {
    data.summary =
      typeof body.summary === 'string' ? body.summary.slice(0, 160) : '';
  }
  if (body.content !== undefined) {
    data.content = typeof body.content === 'string' ? body.content : '';
  }
  // Ringkasan otomatis: 160 karakter pertama isi (aturan backup handleSend).
  if (!data.summary && data.content) {
    data.summary = data.content.slice(0, 160);
  }
  if (body.imageUrl !== undefined) {
    const url =
      typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
    if (url && !/^https?:\/\//i.test(url)) {
      return { error: 'URL gambar harus diawali http:// atau https://.' };
    }
    data.imageUrl = url || null;
  }
  if (body.category !== undefined) {
    const category =
      typeof body.category === 'string' ? body.category : 'announcement';
    if (category !== 'announcement') {
      return { error: 'Kategori selain pengumuman belum didukung.' };
    }
    data.category = category;
  }
  if (body.priority !== undefined) {
    const priority =
      typeof body.priority === 'string' ? body.priority : 'normal';
    if (!(PRIORITIES as readonly string[]).includes(priority)) {
      return { error: 'Prioritas tidak valid.' };
    }
    data.priority = priority;
  }
  if (body.targetMode !== undefined) {
    const targetMode =
      typeof body.targetMode === 'string' ? body.targetMode : 'all';
    if (targetMode !== 'all' && targetMode !== 'targeted') {
      return { error: 'Target selain semua anggota / tertarget belum didukung.' };
    }
    data.targetMode = targetMode;
  }
  if (body.target !== undefined) data.target = asObject(body.target);
  if (body.filters !== undefined) data.filters = asObject(body.filters);
  if (body.channels !== undefined) data.channels = parseChannels(body.channels);
  if (body.recipientEmails !== undefined) {
    data.recipientEmails = asStringArray(body.recipientEmails);
  }
  // Targeted wajib punya minimal 1 email (validasi backup).
  const mode = data.targetMode;
  const target = data.target;
  if (mode === 'targeted') {
    const emails = target ? targetUserEmails(target) : [];
    if (emails.length === 0) {
      return { error: 'Pilih minimal satu penerima untuk target tertarget.' };
    }
  }
  if (body.scheduledAt !== undefined) {
    if (body.scheduledAt === null || body.scheduledAt === '') {
      data.scheduledAt = null;
      data.scheduledAtCleared = true;
    } else {
      const d = new Date(String(body.scheduledAt));
      if (Number.isNaN(d.getTime())) {
        return { error: 'Tanggal & jam pengiriman tidak valid.' };
      }
      if (d.getTime() <= Date.now()) {
        return { error: 'Waktu pengiriman harus di masa depan.' };
      }
      data.scheduledAt = d;
    }
  }
  return { data };
}

export interface FanOutResult {
  announcement: ReturnType<typeof mapAnnouncement>;
  inAppSent: number;
  email: { status: string; sent: number; failed: number };
  recipients: number;
}

/**
 * Fan-out SATU baris Announcement (draft) menjadi terkirim — langkah yang
 * SAMA persis dengan POST /api/pengumuman/[id]/publish (Gelombang 3), tapi
 * diparameterisasi organizationId dari barisnya sendiri, bukan dari sesi.
 * Dipakai publish per-kantor. Pengumuman PLATFORM (Fase 7 §7.8) memakai
 * fan-out sendiri di lib/tenant/platform-announcements.ts (tenant client
 * eksplisit + delivery master) dan TIDAK memakai fungsi ini.
 * Route publish per-kantor TIDAK diubah dan tetap memakai salinannya sendiri.
 * Melempar Error bila baris sudah published atau tidak ada penerima.
 */
export async function fanOutAnnouncement(
  row: AnnouncementRow
): Promise<FanOutResult> {
  if (row.status === 'published') {
    throw new Error('Pengumuman ini sudah terkirim.');
  }
  const organizationId = row.organizationId ?? '';
  const channels = parseChannels(row.channels);
  const recipients = await resolveRecipients(
    organizationId,
    row.targetMode,
    row.target
  );
  if (recipients.length === 0) {
    throw new Error(
      row.targetMode === 'targeted'
        ? 'Tidak ada penerima yang cocok dengan target tertarget.'
        : 'Tidak ada anggota aktif di organisasi ini.'
    );
  }
  const recipientEmails = recipients.map((m) => m.email);

  const prefRows = await prisma.notificationPreference.findMany({
    where: {
      organizationId,
      userId: { in: recipients.map((m) => m.id) },
    },
  });
  const prefByUser = new Map(
    prefRows.map((p) => [p.userId, mergePrefs(p.prefs)])
  );
  const prefsOf = (userId: string) =>
    prefByUser.get(userId) ?? mergePrefs({});

  const appRecipients = channels.app
    ? recipients.filter((m) => isAppAllowed(prefsOf(m.id), row.priority))
    : [];
  const emailCandidates = channels.email
    ? recipients.filter((m) => isEmailAllowed(prefsOf(m.id), row.priority))
    : [];
  const emailTruncated = emailCandidates.length > MAX_EMAIL_RECIPIENTS;
  const emailRecipients = emailCandidates.slice(0, MAX_EMAIL_RECIPIENTS);

  // 1) Status + fan-out in-app dalam satu transaksi; email di luar transaksi.
  const [updated] = await prisma.$transaction([
    prisma.announcement.update({
      where: { id: row.id },
      data: {
        status: 'published',
        sentAt: new Date(),
        recipientEmails,
        emailStatus: channels.email ? 'pending' : 'not_requested',
        emailSent: 0,
        emailFailed: 0,
        emailError: null,
      },
    }),
    ...(appRecipients.length > 0
      ? [
          prisma.notification.createMany({
            data: appRecipients.map((m) => ({
              organizationId,
              userId: m.id,
              type: 'PENGUMUMAN',
              title: row.title,
              body: row.summary || row.content.slice(0, 160),
            })),
          }),
        ]
      : []),
  ]);

  // 2) Email (best-effort, di luar transaksi).
  let emailStatus = updated.emailStatus;
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
      const link = announcementLink(row.id);
      for (const m of emailRecipients) {
        const res = await sendAnnouncementEmail({
          to: m.email,
          name: m.name,
          title: row.title,
          summary: row.summary || row.content.slice(0, 160),
          link,
        });
        if (res.ok) emailSent += 1;
        else {
          emailFailed += 1;
          if (!emailError) emailError = res.error ?? 'Gagal mengirim email.';
        }
      }
      emailStatus =
        emailFailed === 0
          ? 'sent'
          : emailSent === 0
            ? 'failed'
            : 'partial';
      if (emailTruncated) {
        const note = 'Dibatasi 100 penerima per pengiriman.';
        emailError = emailError ? `${emailError} ${note}` : note;
      }
    }
    await prisma.announcement.update({
      where: { id: row.id },
      data: { emailStatus, emailSent, emailFailed, emailError },
    });
  }

  const fresh = await prisma.announcement.findUnique({
    where: { id: row.id },
  });
  return {
    announcement: mapAnnouncement(await attachAuthor(fresh!)),
    inAppSent: appRecipients.length,
    email: { status: emailStatus, sent: emailSent, failed: emailFailed },
    recipients: recipients.length,
  };
}
