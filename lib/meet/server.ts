// Server helper modul WOORK MEET — dipakai semua route /api/meet/*.
// Pola yang ditiru: lib/tiket/server.ts (visibilitas + fan-out notifikasi),
// lib/esign/tokens.ts (token tamu randomUUID, TTL 7 hari), lib/password.ts
// (hash bcrypt), lib/tal/notify.ts (hormati NotificationPreference).
//
// Catatan Fase 2: belum ada engine video. Tidak ada endpoint token video
// dan tidak ada pengecekan konfigurasi engine di sini; status video
// dilaporkan sebagai `videoConfigured: false` oleh endpoint join sampai
// Fase 3 menyediakan engine video.

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { AuthContext } from '@/lib/auth-helpers';
import { getUserPermissions } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { hashPassword, verifyPassword } from '@/lib/password';

export const MEETING_TYPES = [
  'INTERNAL',
  'EXTERNAL',
  'DEPARTMENT',
  'BRANCH',
  'MANAGEMENT',
  'TRAINING',
  'WEBINAR',
  'INTERVIEW',
] as const;

export const MEETING_STATUSES = ['DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const;

export const PARTICIPANT_ROLES = ['HOST', 'CO_HOST', 'PARTICIPANT'] as const;

export const PARTICIPANT_STATUSES = [
  'INVITED',
  'ACCEPTED',
  'DECLINED',
  'TENTATIVE',
  'ATTENDED',
  'ABSENT',
] as const;

/** TTL token tamu: 7 hari (pola token E-Sign). */
export const MEET_GUEST_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Batas default bila MeetingSetting kantor belum ada. */
export const DEFAULT_MAX_DURATION_MINUTES = 120;
export const DEFAULT_MAX_PARTICIPANTS = 50;

export const MEET_APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'https://staging-fgprxrfzsuzvhmqc.woork.id'
).replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Tautan undangan
// ---------------------------------------------------------------------------

/** Tautan gabung untuk peserta internal (halaman room). */
export function meetRoomLink(meetingId: string): string {
  return `${MEET_APP_URL}/meet/room/${meetingId}`;
}

/** Tautan gabung untuk tamu eksternal (halaman tamu publik). */
export function meetGuestLink(token: string): string {
  return `${MEET_APP_URL}/meet/guest/${token}`;
}

/**
 * Tautan undangan untuk satu peserta: tamu memakai link tamu (bila ada
 * token), peserta internal memakai link room.
 */
export function meetLink(
  meeting: { id: string },
  guestToken?: string | null
): string {
  return guestToken ? meetGuestLink(guestToken) : meetRoomLink(meeting.id);
}

// ---------------------------------------------------------------------------
// Visibilitas & akses
// ---------------------------------------------------------------------------

export async function userCanManageMeet(ctx: AuthContext): Promise<boolean> {
  if (ctx.isSuperAdmin) return true;
  const keys = await getUserPermissions(ctx);
  return keys.has('MEET_MANAGE');
}

/**
 * Filter visibilitas tenant (pola ticketVisibilityWhere):
 * - Pemegang MEET_MANAGE melihat SEMUA meeting kantor.
 * - User biasa hanya meeting yang dibuatnya (host) + yang mengundangnya.
 */
export function meetVisibilityWhere(
  ctx: AuthContext,
  canManage: boolean
): Record<string, unknown> {
  if (canManage) return { organizationId: ctx.organizationId };
  return {
    organizationId: ctx.organizationId,
    OR: [
      { hostId: ctx.userId },
      { participants: { some: { userId: ctx.userId } } },
    ],
  };
}

/** Include standar: peserta (dengan token tamu) + hitungan. Host + user
 * peserta TIDAK di-include di sini (relasi itu TIDAK ADA di tenant
 * client) — digabung belakangan via `attachMeetingUsers`. */
export const meetingInclude = {
  participants: {
    include: {
      guestToken: { select: { accessToken: true, tokenExpiresAt: true, revokedAt: true, scope: true } },
    },
  },
  _count: { select: { agendaItems: true, notes: true, chatMessages: true, recordings: true } },
} as const;

/**
 * Gabungkan host + user peserta ke baris meeting (Lapisan F). Bentuk
 * hasil sama seperti `meetingInclude` lama (`host: {...} | null`,
 * `participants[].user: {...} | null`).
 */
export async function attachMeetingUsers<
  T extends { hostId: string; participants?: Array<{ userId: string | null }> },
>(
  rows: T[]
): Promise<
  Array<
    Omit<T, 'participants'> & {
      host: { id: string; name: string; email: string; avatar: string | null } | null;
      participants: Array<
        NonNullable<T['participants']>[number] & {
          user: { id: string; name: string; email: string; avatar: string | null } | null;
        }
      >;
    }
  >
> {
  const userIds = [
    ...new Set(
      [
        ...rows.map((m) => m.hostId),
        ...rows.flatMap((m) => (m.participants ?? []).map((p) => p.userId)),
      ].filter((id): id is string => !!id)
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, avatar: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((m) => ({
    ...m,
    host: byId.get(m.hostId) ?? null,
    participants: (m.participants ?? []).map((p) => ({
      ...p,
      user: p.userId ? (byId.get(p.userId) ?? null) : null,
    })),
  }));
}

/** Gabungkan user ke baris MeetingParticipant (untuk create/update peserta). */
export async function attachParticipantUsers<T extends { userId: string | null }>(
  rows: T[]
): Promise<Array<T & { user: { id: string; name: string; email: string; avatar: string | null } | null }>> {
  const userIds = [...new Set(rows.map((p) => p.userId).filter((id): id is string => !!id))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, avatar: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((p) => ({ ...p, user: p.userId ? (byId.get(p.userId) ?? null) : null }));
}

export type MeetingRow = {
  id: string;
  organizationId: string;
  hostId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  meetingType: string;
  locationType: string;
  joinUrl: string | null;
  location: string | null;
  status: string;
  password?: string | null;
  waitingRoom: boolean;
  allowJoinBeforeHost: boolean;
  muteOnEntry: boolean;
  allowScreenShare: boolean;
  allowChat: boolean;
  allowRecording: boolean;
  isRecurring: boolean;
  recurrenceRule: string | null;
  createdAt: Date;
  updatedAt: Date;
  host?: { id: string; name: string; email: string; avatar: string | null } | null;
  participants?: MeetingParticipantRow[];
  _count?: { agendaItems: number; notes: number; chatMessages: number; recordings: number };
};

export type MeetingParticipantRow = {
  id: string;
  meetingId: string;
  userId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  snapshotPosition: string | null;
  snapshotDepartment: string | null;
  snapshotBranch: string | null;
  role: string;
  isRequired: boolean;
  status: string;
  respondedAt: Date | null;
  joinedAt: Date | null;
  leftAt: Date | null;
  user?: { id: string; name: string; email: string; avatar: string | null } | null;
  guestToken?: { accessToken: string; tokenExpiresAt: Date | null; revokedAt: Date | null; scope: string } | null;
};

export function participantDisplayName(p: MeetingParticipantRow): string {
  return p.user?.name ?? p.guestName ?? 'Tamu';
}

export function participantInviteLink(
  meetingId: string,
  p: MeetingParticipantRow
): string {
  return meetLink({ id: meetingId }, p.guestToken?.accessToken ?? null);
}

export function mapParticipant(p: MeetingParticipantRow, meetingId: string) {
  return {
    id: p.id,
    meetingId: p.meetingId,
    userId: p.userId,
    name: participantDisplayName(p),
    email: p.user?.email ?? p.guestEmail,
    phone: p.guestPhone,
    avatar: p.user?.avatar ?? null,
    position: p.snapshotPosition,
    department: p.snapshotDepartment,
    branch: p.snapshotBranch,
    role: p.role,
    isRequired: p.isRequired,
    status: p.status,
    respondedAt: p.respondedAt?.toISOString() ?? null,
    joinedAt: p.joinedAt?.toISOString() ?? null,
    leftAt: p.leftAt?.toISOString() ?? null,
    isGuest: !p.userId,
    inviteLink: participantInviteLink(meetingId, p),
  };
}

/** Serialisasi meeting untuk respons API (TANPA hash password). */
export function mapMeeting(row: MeetingRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    hostId: row.hostId,
    hostName: row.host?.name ?? '—',
    hostEmail: row.host?.email,
    hostAvatar: row.host?.avatar ?? null,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    timezone: row.timezone,
    meetingType: row.meetingType,
    locationType: row.locationType,
    joinUrl: row.joinUrl,
    location: row.location,
    status: row.status,
    hasPassword: !!row.password,
    waitingRoom: row.waitingRoom,
    allowJoinBeforeHost: row.allowJoinBeforeHost,
    muteOnEntry: row.muteOnEntry,
    allowScreenShare: row.allowScreenShare,
    allowChat: row.allowChat,
    allowRecording: row.allowRecording,
    isRecurring: row.isRecurring,
    recurrenceRule: row.recurrenceRule,
    roomLink: meetRoomLink(row.id),
    participantCount: row.participants?.length ?? 0,
    participants: row.participants?.map((p) => mapParticipant(p, row.id)),
    counts: row._count
      ? {
          agendaItems: row._count.agendaItems,
          notes: row._count.notes,
          chatMessages: row._count.chatMessages,
          recordings: row._count.recordings,
        }
      : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Ringkasan peserta untuk respons join (tanpa email internal tamu lain). */
export function mapParticipantSummary(p: MeetingParticipantRow) {
  return {
    id: p.id,
    userId: p.userId,
    name: participantDisplayName(p),
    avatar: p.user?.avatar ?? null,
    position: p.snapshotPosition,
    department: p.snapshotDepartment,
    role: p.role,
    status: p.status,
    joinedAt: p.joinedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Pengambilan meeting + pemeriksaan akses
// ---------------------------------------------------------------------------

/** Ambil meeting mentah (tanpa cek akses) atau lempar 404 generik. */
export async function findMeetingOr404(id: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: meetingInclude,
  });
  if (!meeting) throw apiErr('Meeting tidak ditemukan.', 404);
  const [withUsers] = await attachMeetingUsers([meeting]);
  return withUsers as unknown as MeetingRow;
}

/** Apakah user boleh MELIHAT meeting ini (host/peserta/MEET_MANAGE). */
export function canViewMeeting(
  meeting: MeetingRow,
  ctx: AuthContext,
  canManage: boolean
): boolean {
  if (canManage) return true;
  if (meeting.hostId === ctx.userId) return true;
  return (meeting.participants ?? []).some((p) => p.userId === ctx.userId);
}

/** Apakah user boleh MENGELOLA meeting ini (host atau MEET_MANAGE). */
export function canManageMeeting(
  meeting: MeetingRow,
  ctx: AuthContext,
  canManage: boolean
): boolean {
  if (ctx.isSuperAdmin) return true;
  if (canManage) return true;
  return meeting.hostId === ctx.userId;
}

/** Ambil meeting + pastikan pemanggil boleh melihatnya. */
export async function loadMeetingForView(ctx: AuthContext, id: string): Promise<MeetingRow> {
  const meeting = await findMeetingOr404(id);
  if (meeting.organizationId !== ctx.organizationId && !ctx.isSuperAdmin) {
    throw apiErr('Meeting tidak ditemukan.', 404);
  }
  const canManage = await userCanManageMeet(ctx);
  if (!canViewMeeting(meeting, ctx, canManage)) {
    throw apiErr('Anda tidak memiliki akses ke meeting ini.', 403);
  }
  return meeting;
}

/** Ambil meeting + pastikan pemanggil adalah host atau MEET_MANAGE. */
export async function loadMeetingForManage(ctx: AuthContext, id: string): Promise<MeetingRow> {
  const meeting = await findMeetingOr404(id);
  if (meeting.organizationId !== ctx.organizationId && !ctx.isSuperAdmin) {
    throw apiErr('Meeting tidak ditemukan.', 404);
  }
  const canManage = await userCanManageMeet(ctx);
  if (!canManageMeeting(meeting, ctx, canManage)) {
    throw apiErr('Hanya host atau pengelola meeting yang dapat melakukan tindakan ini.', 403);
  }
  return meeting;
}

/** Cari baris peserta internal untuk user ini di meeting (bila ada). */
export function findMyParticipant(
  meeting: MeetingRow,
  userId: string
): MeetingParticipantRow | undefined {
  return (meeting.participants ?? []).find((p) => p.userId === userId);
}

// ---------------------------------------------------------------------------
// Password meeting (hash bcrypt — pola lib/password.ts, jangan plaintext)
// ---------------------------------------------------------------------------

export async function hashMeetingPassword(plain: string): Promise<string> {
  return hashPassword(plain);
}

export async function verifyMeetingPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return verifyPassword(plain, hash);
}

// ---------------------------------------------------------------------------
// Token tamu (pola lib/esign/tokens.ts: randomUUID, TTL 7 hari)
// ---------------------------------------------------------------------------

export async function createGuestToken(participantId: string, meetingId?: string) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + MEET_GUEST_TOKEN_TTL_MS);
  const created = await prisma.meetingGuestToken.upsert({
    where: { participantId },
    update: { accessToken: token, tokenExpiresAt: expiresAt, revokedAt: null, scope: 'JOIN' },
    create: {
      meetingId: meetingId ?? '',
      participantId,
      accessToken: token,
      tokenExpiresAt: expiresAt,
      scope: 'JOIN',
    },
  });
  return created;
}

/** Pastikan peserta tamu punya token yang masih berlaku; buat baru bila tidak ada/kedaluwarsa/dicabut. */
export async function ensureGuestToken(
  participantId: string,
  meetingId: string
): Promise<{ accessToken: string; tokenExpiresAt: Date | null }> {
  const existing = await prisma.meetingGuestToken.findUnique({
    where: { participantId },
  });
  const now = new Date();
  if (
    existing &&
    !existing.revokedAt &&
    existing.tokenExpiresAt &&
    existing.tokenExpiresAt.getTime() > now.getTime()
  ) {
    return { accessToken: existing.accessToken, tokenExpiresAt: existing.tokenExpiresAt };
  }
  const created = await createGuestToken(participantId, meetingId);
  return { accessToken: created.accessToken, tokenExpiresAt: created.tokenExpiresAt };
}

export type VerifiedGuestToken = {
  token: {
    id: string;
    meetingId: string;
    participantId: string;
    accessToken: string;
    tokenExpiresAt: Date | null;
    scope: string;
    revokedAt: Date | null;
  };
  participant: MeetingParticipantRow;
  meeting: MeetingRow;
};

/**
 * Verifikasi token tamu publik. 404 generik bila tak dikenal, 410 bila
 * kedaluwarsa/dicabut (pola lookup E-Sign). Bila meetingId diberikan,
 * token harus milik meeting itu.
 */
export async function verifyGuestToken(
  token: string,
  meetingId?: string
): Promise<VerifiedGuestToken> {
  const row = await prisma.meetingGuestToken.findUnique({
    where: { accessToken: token },
    include: {
      // MeetingParticipant TIDAK punya relasi `user` di tenant client —
      // digabung belakangan via `attachParticipantUsers`.
      participant: true,
      meeting: { include: meetingInclude },
    },
  });
  if (!row || (meetingId && row.meetingId !== meetingId)) {
    throw apiErr('Tautan undangan tidak valid atau sudah tidak berlaku.', 404);
  }
  const now = new Date();
  if (
    row.revokedAt ||
    !row.tokenExpiresAt ||
    row.tokenExpiresAt.getTime() <= now.getTime() ||
    row.meeting.status === 'CANCELLED' ||
    row.meeting.status === 'COMPLETED'
  ) {
    throw apiErr('Tautan undangan sudah kedaluwarsa atau dicabut.', 410);
  }
  const [participantWithUser] = await attachParticipantUsers([row.participant]);
  const [meetingWithUsers] = await attachMeetingUsers([row.meeting]);
  return {
    token: {
      id: row.id,
      meetingId: row.meetingId,
      participantId: row.participantId,
      accessToken: row.accessToken,
      tokenExpiresAt: row.tokenExpiresAt,
      scope: row.scope,
      revokedAt: row.revokedAt,
    },
    participant: participantWithUser as unknown as MeetingParticipantRow,
    meeting: meetingWithUsers as unknown as MeetingRow,
  };
}

/** Cabut semua token tamu sebuah meeting (saat dibatalkan/selesai). */
export async function revokeAllGuestTokens(meetingId: string): Promise<void> {
  await prisma.meetingGuestToken.updateMany({
    where: { meetingId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Pengaturan kantor
// ---------------------------------------------------------------------------

export type MeetingSettingRow = {
  id: string;
  organizationId: string;
  maxDurationMinutes: number;
  maxParticipants: number;
  waitingRoomDefault: boolean;
  allowGuest: boolean;
  allowScreenShare: boolean;
  allowChat: boolean;
  allowRecording: boolean;
  recordingRetentionDays: number;
  defaultTimezone: string;
};

export async function getMeetingSetting(organizationId: string): Promise<MeetingSettingRow> {
  const row = await prisma.meetingSetting.findUnique({ where: { organizationId } });
  if (row) return row as MeetingSettingRow;
  return {
    id: '',
    organizationId,
    maxDurationMinutes: DEFAULT_MAX_DURATION_MINUTES,
    maxParticipants: DEFAULT_MAX_PARTICIPANTS,
    waitingRoomDefault: false,
    allowGuest: true,
    allowScreenShare: true,
    allowChat: true,
    allowRecording: false,
    recordingRetentionDays: 30,
    defaultTimezone: 'Asia/Jakarta',
  };
}

export async function getOrCreateMeetingSetting(
  organizationId: string
): Promise<MeetingSettingRow> {
  const row = await prisma.meetingSetting.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId },
  });
  return row as MeetingSettingRow;
}

// ---------------------------------------------------------------------------
// Notifikasi in-app (fan-out createMany — pola Tiket/Pengumuman)
// ---------------------------------------------------------------------------

export type MeetNotificationType = 'MEET_INVITE' | 'MEET_CANCELLED' | 'MEET_RESCHEDULED';

/**
 * Apakah penerima mengizinkan notifikasi meet (NotificationPreference).
 * Bentuk prefs yang dihormati: prefs.meet === false → tolak; bila
 * prefs.meet berupa objek, enabled === false atau channelMeet === false
 * → tolak. Tanpa preferensi tersimpan → kirim (default aktif).
 */
export async function meetNotifyAllowed(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const row = await prisma.notificationPreference.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { prefs: true },
  });
  const prefs = (row?.prefs ?? {}) as Record<string, unknown>;
  const meet = prefs.meet;
  if (meet === false) return false;
  if (meet && typeof meet === 'object') {
    const m = meet as Record<string, unknown>;
    if (m.enabled === false) return false;
    if (m.channelMeet === false) return false;
  }
  return true;
}

/**
 * Fan-out notifikasi ke peserta internal sebuah meeting.
 * Idempotent per peserta: notifikasi dengan type + body yang sama tidak
 * ditulis dua kali (mis. kirim ulang undangan tidak menggandakan baris).
 * Tamu eksternal (tanpa userId) tidak mendapat notifikasi in-app.
 */
export async function notifyMeetingParticipants(
  meeting: { id: string; organizationId: string; title: string },
  type: MeetNotificationType,
  title: string,
  body: string,
  opts?: { excludeUserIds?: string[]; onlyUserIds?: string[] }
): Promise<void> {
  const participants = await prisma.meetingParticipant.findMany({
    where: { meetingId: meeting.id, userId: { not: null } },
    select: { userId: true },
  });
  let userIds = participants.map((p) => p.userId as string);
  if (opts?.onlyUserIds) {
    const only = new Set(opts.onlyUserIds);
    userIds = userIds.filter((id) => only.has(id));
  }
  if (opts?.excludeUserIds?.length) {
    const excluded = new Set(opts.excludeUserIds);
    userIds = userIds.filter((id) => !excluded.has(id));
  }
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;

  // Hormati preferensi tiap penerima.
  const allowed: string[] = [];
  for (const userId of unique) {
    if (await meetNotifyAllowed(meeting.organizationId, userId)) allowed.push(userId);
  }
  if (allowed.length === 0) return;

  // Idempotensi: lewati penerima yang sudah punya notifikasi type+body sama.
  const existing = await prisma.notification.findMany({
    where: { organizationId: meeting.organizationId, userId: { in: allowed }, type, body },
    select: { userId: true },
  });
  const already = new Set(existing.map((r) => r.userId));
  const targets = allowed.filter((id) => !already.has(id));
  if (targets.length === 0) return;

  await prisma.notification.createMany({
    data: targets.map((userId) => ({
      organizationId: meeting.organizationId,
      userId,
      type,
      title,
      body,
    })),
  });
}

/** Judul + isi notifikasi undangan (URL undangan ada di body — Notification tak punya kolom link). */
export function inviteNotification(
  meeting: { id: string; title: string; startsAt: Date },
  guestToken?: string | null
): { title: string; body: string } {
  const when = meeting.startsAt.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return {
    title: `Undangan meeting: ${meeting.title}`,
    body: `Anda diundang ke meeting "${meeting.title}" pada ${when}. Gabung lewat tautan ini: ${meetLink({ id: meeting.id }, guestToken ?? null)}`,
  };
}
