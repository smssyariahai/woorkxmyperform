/**
 * WOORK VIRTUAL OFFICE — Morning Briefing engine (data + penjadwalan).
 *
 * Briefing harian 08:00 WIB (default, bisa diubah di BriefingSettings):
 * seluruh AI-Agent aktif berkumpul di ruang meeting, leader mempresentasikan
 * di whiteboard, monitor menampilkan agenda dari data NYATA WOORK.
 *
 * Prinsip data: TIDAK ada angka karangan. Setiap bagian konten membawa
 * `available` + `note`; bila sumbernya kosong, bagian itu dilaporkan
 * "belum tersedia", bukan diisi statistik fiktif. Nominal invoice dan
 * alasan cuti TIDAK PERNAH dibaca/ditampilkan.
 *
 * Zona waktu: Asia/Jakarta default (offset tetap UTC+7, tanpa DST — sama
 * seperti lib/calendar/client.ts); WITA/WIT didukung via offset +8/+9.
 * "Hari ini" selalu dihitung di timezone perusahaan, bukan jam browser.
 */
import { prisma } from '@/lib/db';
import {
  createLayout,
  meetingSeat,
  placementFor,
  type Placement,
} from '@/components/kantor/scene/office3d-layout';
import type { KantorStation } from '@/lib/kantor/types';

// ---------------------------------------------------------------------------
// Zona waktu perusahaan (offset tetap, tanpa DST)
// ---------------------------------------------------------------------------

export const BRIEFING_TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;

const TZ_OFFSET_HOURS: Record<string, number> = {
  'Asia/Jakarta': 7,
  'Asia/Makassar': 8,
  'Asia/Jayapura': 9,
};

export function tzOffsetHours(timezone: string): number {
  return TZ_OFFSET_HOURS[timezone] ?? 7;
}

export interface OrgDateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Minggu .. 6=Sabtu
}

/** Pecah Date menjadi bagian-bagian waktu di timezone perusahaan. */
export function orgDateParts(d: Date, timezone: string): OrgDateParts {
  const shifted = new Date(d.getTime() + tzOffsetHours(timezone) * 3600 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** Awal hari (00:00) di timezone perusahaan, sebagai instan UTC. */
export function orgDayStartUtc(year: number, month: number, day: number, timezone: string): Date {
  return new Date(Date.UTC(year, month - 1, day) - tzOffsetHours(timezone) * 3600 * 1000);
}

/** Tanggal (UTC midnight) untuk kolom @db.Date dari bagian-bagian org. */
export function orgDateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Parse "HH:MM" -> {hour, minute} atau null bila tidak valid. */
export function parseHHMM(value: string): { hour: number; minute: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** "HH:MM" dari sebuah Date di timezone perusahaan. */
export function formatHHMM(d: Date, timezone: string): string {
  const p = orgDateParts(d, timezone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Nama hari + tanggal Indonesia, mis. "Sabtu, 21 November 2026". */
export function formatDateLongOrg(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

// ---------------------------------------------------------------------------
// Jendela briefing hari ini
// ---------------------------------------------------------------------------

export interface BriefingWindow {
  /** Tanggal (UTC midnight) untuk kolom scheduledDate. */
  scheduledDate: Date;
  /** Instan persiapan dimulai (startTime - preparationMinutes). */
  prepStartAt: Date;
  /** Instan briefing dimulai (startTime). */
  scheduledAt: Date;
  /** Instan briefing berakhir (startTime + durationMinutes). */
  endsAt: Date;
}

/**
 * Jendela briefing untuk tanggal org yang memuat `ref` (default: sekarang).
 * scheduledAt selalu startTime pada tanggal itu, di timezone perusahaan.
 */
export function getBriefingWindow(
  settings: { startTime: string; timezone: string; durationMinutes: number; preparationMinutes: number },
  ref: Date = new Date(),
): BriefingWindow {
  const hhmm = parseHHMM(settings.startTime) ?? { hour: 8, minute: 0 };
  const parts = orgDateParts(ref, settings.timezone);
  const dayStart = orgDayStartUtc(parts.year, parts.month, parts.day, settings.timezone);
  const scheduledAt = new Date(dayStart.getTime() + (hhmm.hour * 60 + hhmm.minute) * 60 * 1000);
  return {
    scheduledDate: orgDateOnly(parts.year, parts.month, parts.day),
    prepStartAt: new Date(scheduledAt.getTime() - settings.preparationMinutes * 60 * 1000),
    scheduledAt,
    endsAt: new Date(scheduledAt.getTime() + settings.durationMinutes * 60 * 1000),
  };
}

export type BriefingPhase =
  | 'SCHEDULED'
  | 'PREPARING'
  | 'AGENTS_MOVING'
  | 'GATHERING'
  | 'IN_PROGRESS'
  | 'CLOSING'
  | 'RETURNING'
  | 'COMPLETED'
  | 'FAILED';

/**
 * Fase briefing dari jam: persiapan dibagi 3 sub-fase (awal = bersiap,
 * tengah = bergerak, akhir = berkumpul), lalu IN_PROGRESS sampai endsAt,
 * lalu COMPLETED. CLOSING/RETURNING hanya diset eksplisit saat
 * endBriefingSession — bukan turunan jam.
 */
export function deriveBriefingPhase(
  prepStartAt: Date,
  scheduledAt: Date,
  endsAt: Date,
  now: Date = new Date(),
): BriefingPhase {
  if (now < prepStartAt) return 'SCHEDULED';
  if (now < scheduledAt) {
    const total = scheduledAt.getTime() - prepStartAt.getTime();
    if (total <= 0) return 'GATHERING';
    const frac = (now.getTime() - prepStartAt.getTime()) / total;
    if (frac < 0.25) return 'PREPARING';
    if (frac < 0.75) return 'AGENTS_MOVING';
    return 'GATHERING';
  }
  if (now < endsAt) return 'IN_PROGRESS';
  return 'COMPLETED';
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type BriefingSettingsRow = Awaited<ReturnType<typeof getBriefingSettings>>;

export const DEFAULT_BRIEFING = {
  isEnabled: true,
  startTime: '08:00',
  timezone: 'Asia/Jakarta',
  durationMinutes: 10,
  preparationMinutes: 2,
  meetingLeaderId: null as string | null,
  participantMode: 'all',
  excludedAgentIds: [] as string[],
  autoReturn: true,
};

/** Baca BriefingSettings org; bila belum ada, buat default (08:00/10/2). */
export async function getBriefingSettings(organizationId: string) {
  const existing = await prisma.briefingSettings.findUnique({ where: { organizationId } });
  if (existing) return existing;
  return prisma.briefingSettings.create({
    data: { organizationId, ...DEFAULT_BRIEFING },
  });
}

// ---------------------------------------------------------------------------
// Agent aktif, leader, peserta
// ---------------------------------------------------------------------------

export type ActiveAgent = Awaited<ReturnType<typeof getActiveAgents>>[number];

/** Semua agent AKTIF (isEnabled) di kantor ini, urut nama. */
export async function getActiveAgents(organizationId: string) {
  return prisma.agent.findMany({
    where: { organizationId, isEnabled: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, role: true, avatarColor: true, currentStatus: true },
  });
}

/**
 * Pilih Meeting Leader:
 * 1. meetingLeaderId di settings (bila agent-nya masih aktif),
 * 2. agent dengan role koordinasi/pimpinan — mengandung Manager/Manajer/
 *    Supervisor/Leader/Koordinator (urutan nama, deterministik),
 * 3. agent aktif pertama (urutan nama, deterministik).
 */
export async function resolveLeader(
  organizationId: string,
  settings: { meetingLeaderId: string | null },
): Promise<{ agent: ActiveAgent | null; method: 'configured' | 'role' | 'first' | 'none' }> {
  const agents = await getActiveAgents(organizationId);
  if (agents.length === 0) return { agent: null, method: 'none' };
  if (settings.meetingLeaderId) {
    const configured = agents.find((a) => a.id === settings.meetingLeaderId);
    if (configured) return { agent: configured, method: 'configured' };
  }
  const byRole = agents.find((a) =>
    /manager|manajer|supervisor|leader|koordinator/i.test(a.role ?? ''),
  );
  if (byRole) return { agent: byRole, method: 'role' };
  return { agent: agents[0], method: 'first' };
}

export interface BriefingParticipantPlan {
  agentId: string;
  agentName: string;
  agentRole: string;
  avatarColor: string;
  isLeader: boolean;
  /** 'presenter' = di whiteboard; 'seated' = kursi meja rapat; 'standing' = berdiri di lane. */
  kind: 'presenter' | 'seated' | 'standing';
  /** Posisi di ruang meeting (dari meetingSeat). */
  meetingPosition: Placement;
  /** Posisi/ruang agent SEBELUM briefing (untuk kembali). */
  initialRoom: string;
  initialPosition: Placement;
  /** true bila agent sedang menjalankan AgentTask RUNNING — tidak dipaksa ikut. */
  skipped: boolean;
  skipReason: string | null;
}

/**
 * Daftar peserta briefing: semua agent aktif kecuali excludedAgentIds.
 * Leader di posisi presenter (meetingSeat 0); peserta lain di kursi
 * (meetingSeat 1..n) — bila kursi habis, sisanya berdiri di lane
 * (meetingSeat sudah mengembalikan standing placement setelah kursi).
 * Agent dengan AgentTask RUNNING ditandai SKIPPED (pekerjaan kritis tidak
 * diganggu); mereka tetap tercatat sebagai peserta dengan status SKIPPED.
 */
export async function resolveParticipants(
  organizationId: string,
  settings: { excludedAgentIds: unknown; meetingLeaderId: string | null },
): Promise<{ leader: BriefingParticipantPlan | null; participants: BriefingParticipantPlan[]; skipped: BriefingParticipantPlan[] }> {
  const excluded = Array.isArray(settings.excludedAgentIds)
    ? (settings.excludedAgentIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const agents = (await getActiveAgents(organizationId)).filter((a) => !excluded.includes(a.id));
  if (agents.length === 0) return { leader: null, participants: [], skipped: [] };

  const { agent: leaderAgent } = await resolveLeader(organizationId, settings);
  const leaderId = leaderAgent?.id ?? agents[0].id;

  // Tugas RUNNING per agent (pekerjaan kritis — jangan diganggu).
  const running = await prisma.agentTask.findMany({
    where: { organizationId, status: 'RUNNING', agentId: { in: agents.map((a) => a.id) } },
    select: { agentId: true },
  });
  const runningIds = new Set(running.map((t) => t.agentId));

  // Tugas aktif per agent (untuk menurunkan state station seperti office route).
  const activeTasks = await prisma.agentTask.findMany({
    where: {
      organizationId,
      status: { in: ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'] },
      agentId: { in: agents.map((a) => a.id) },
    },
    orderBy: { createdAt: 'desc' },
    select: { agentId: true, status: true },
  });
  const taskByAgent = new Map<string, string>();
  for (const t of activeTasks) {
    if (t.agentId && !taskByAgent.has(t.agentId)) taskByAgent.set(t.agentId, t.status);
  }

  const layout = createLayout(Math.max(1, agents.length));
  const ordered = [...agents].sort((a, b) =>
    a.id === leaderId ? -1 : b.id === leaderId ? 1 : a.name.localeCompare(b.name),
  );

  const plans: BriefingParticipantPlan[] = [];
  const skipped: BriefingParticipantPlan[] = [];
  let seatIndex = 0;
  for (const agent of ordered) {
    // Posisi awal agent sekarang (meja bila Working, lounge bila Idle).
    const taskStatus = taskByAgent.get(agent.id) ?? null;
    const agentStatus = agent.currentStatus;
    const state: KantorStation['state'] =
      agentStatus === 'WAITING_APPROVAL' || taskStatus === 'WAITING_APPROVAL'
        ? 'Reviewing'
        : agentStatus === 'EXECUTING_TASK' ||
            agentStatus === 'THINKING' ||
            agentStatus === 'WORKING' ||
            agentStatus === 'COMPLETED' ||
            taskStatus === 'RUNNING' ||
            taskStatus === 'QUEUED'
          ? 'Working'
          : 'Idle';
    const room: KantorStation['room'] = state === 'Idle' ? 'Lounge' : 'Workspace';
    const roomPosition: KantorStation['roomPosition'] = state === 'Idle' ? 'lounge-seat' : 'desk';
    const station = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      avatarColor: agent.avatarColor,
      room,
      roomPosition,
      seat: agents.findIndex((x) => x.id === agent.id) + 1,
      state,
    } as KantorStation;
    const initialPosition = placementFor(station, layout);

    const isSkipped = runningIds.has(agent.id);
    const placement = meetingSeat(seatIndex, layout);
    const plan: BriefingParticipantPlan = {
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      avatarColor: agent.avatarColor,
      isLeader: agent.id === leaderId,
      kind: seatIndex === 0 ? 'presenter' : placement.seated ? 'seated' : 'standing',
      meetingPosition: placement,
      initialRoom: room,
      initialPosition,
      skipped: isSkipped,
      skipReason: isSkipped ? 'Sedang menjalankan tugas (RUNNING) — tidak diganggu.' : null,
    };
    if (isSkipped) skipped.push(plan);
    else {
      plans.push(plan);
      seatIndex += 1;
    }
  }

  const leader = plans.find((p) => p.isLeader) ?? null;
  return { leader, participants: plans, skipped };
}

/** Apakah sekarang berada dalam jendela briefing (persiapan s.d. selesai)? */
export async function isBriefingTimeNow(
  organizationId: string,
  now: Date = new Date(),
): Promise<{ inWindow: boolean; phase: BriefingPhase; window: BriefingWindow }> {
  const settings = await getBriefingSettings(organizationId);
  const window = getBriefingWindow(settings, now);
  const phase = deriveBriefingPhase(window.prepStartAt, window.scheduledAt, window.endsAt, now);
  return { inWindow: phase !== 'SCHEDULED' && phase !== 'COMPLETED', phase, window };
}

// ---------------------------------------------------------------------------
// Konten monitor + agenda (data NYATA — tanpa angka karangan)
// ---------------------------------------------------------------------------

export interface BriefingContentSection {
  available: boolean;
  note: string | null;
}

export interface BriefingContent {
  date: string;
  dateLong: string;
  greeting: string;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  overview: BriefingContentSection & {
    meetingsToday: { id: string; title: string; time: string; status: string }[];
    meetingsCount: number;
    announcement: { id: string; title: string; summary: string; priority: string } | null;
  };
  calendar: BriefingContentSection & {
    events: { id: string; title: string; time: string; category: string }[];
    eventsCount: number;
  };
  tasks: BriefingContentSection & {
    total: number;
    done: number;
    pending: number;
    overdue: { id: string; title: string; taskDate: string }[];
    overdueCount: number;
  };
  agents: BriefingContentSection & {
    activeCount: number;
    runningCount: number;
    runningAgents: string[];
    unavailableCount: number;
  };
}

/**
 * Data monitor ruang meeting + agenda briefing, dari modul nyata:
 * Meeting (agenda hari ini), Announcement (terbaru, published),
 * CalendarEvent (event hari ini, COMPANY/TEAM/DEPARTMENT), TalTask
 * (tugas hari ini + overdue), Agent + AgentTask RUNNING (status agent).
 * Bagian tanpa data mengembalikan available:false + note — bukan angka
 * karangan. Nominal invoice dan alasan cuti tidak pernah dibaca.
 */
export async function getBriefingContent(
  organizationId: string,
  dateStr?: string,
): Promise<BriefingContent> {
  const settings = await getBriefingSettings(organizationId);
  const tz = settings.timezone;

  // Tanggal target: `dateStr` (YYYY-MM-DD) atau "hari ini" di timezone org.
  let ref = new Date();
  if (dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (m) ref = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  }
  const parts = orgDateParts(ref, tz);
  const dayStart = orgDayStartUtc(parts.year, parts.month, parts.day, tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const dateOnly = orgDateOnly(parts.year, parts.month, parts.day);

  const [meetings, announcement, events, tasksToday, overdueTasks, agents, disabledCount] =
    await Promise.all([
      prisma.meeting.findMany({
        where: {
          organizationId,
          status: { in: ['SCHEDULED', 'ONGOING'] },
          startsAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { startsAt: 'asc' },
        select: { id: true, title: true, startsAt: true, endsAt: true, status: true },
      }),
      prisma.announcement.findFirst({
        where: { organizationId, status: 'published' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, summary: true, priority: true },
      }),
      prisma.calendarEvent.findMany({
        where: {
          organizationId,
          visibility: { in: ['COMPANY', 'TEAM', 'DEPARTMENT'] },
          status: 'SCHEDULED',
          startAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { startAt: 'asc' },
        take: 5,
        select: { id: true, title: true, startAt: true, category: true },
      }),
      prisma.talTask.findMany({
        where: { organizationId, taskDate: dateOnly },
        select: { id: true, status: true },
      }),
      prisma.talTask.findMany({
        where: { organizationId, taskDate: { lt: dateOnly }, status: { not: 'done' } },
        orderBy: { taskDate: 'desc' },
        take: 5,
        select: { id: true, title: true, taskDate: true },
      }),
      prisma.agent.findMany({
        where: { organizationId, isEnabled: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.agent.count({ where: { organizationId, isEnabled: false } }),
    ]);

  const runningTasks = await prisma.agentTask.findMany({
    where: {
      organizationId,
      status: 'RUNNING',
      agentId: { in: agents.map((a) => a.id) },
    },
    select: { agentId: true },
  });
  const runningNames = new Set(
    runningTasks
      .map((t) => agents.find((a) => a.id === t.agentId)?.name)
      .filter((n): n is string => Boolean(n)),
  );

  const doneCount = tasksToday.filter((t) => t.status === 'done').length;
  const overviewAvailable = meetings.length > 0 || announcement !== null;

  return {
    date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    dateLong: formatDateLongOrg(ref, tz),
    greeting: 'Good Morning, WOORK Team!',
    startTime: settings.startTime,
    durationMinutes: settings.durationMinutes,
    timezone: tz,
    overview: {
      available: overviewAvailable,
      note: overviewAvailable ? null : 'Belum ada meeting dan pengumuman hari ini.',
      meetingsToday: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        time: `${formatHHMM(m.startsAt, tz)}${m.endsAt ? `–${formatHHMM(m.endsAt, tz)}` : ''}`,
        status: m.status,
      })),
      meetingsCount: meetings.length,
      announcement: announcement
        ? {
            id: announcement.id,
            title: announcement.title,
            summary: announcement.summary,
            priority: announcement.priority,
          }
        : null,
    },
    calendar: {
      available: events.length > 0,
      note: events.length > 0 ? null : 'Belum ada event kalender hari ini.',
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        time: formatHHMM(e.startAt, tz),
        category: e.category,
      })),
      eventsCount: events.length,
    },
    tasks: {
      available: tasksToday.length > 0 || overdueTasks.length > 0,
      note:
        tasksToday.length > 0 || overdueTasks.length > 0
          ? null
          : 'Belum ada tugas yang dijadwalkan hari ini.',
      total: tasksToday.length,
      done: doneCount,
      pending: tasksToday.length - doneCount,
      overdue: overdueTasks.map((t) => ({
        id: t.id,
        title: t.title,
        taskDate: t.taskDate ? t.taskDate.toISOString().slice(0, 10) : '',
      })),
      overdueCount: overdueTasks.length,
    },
    agents: {
      available: agents.length > 0,
      note: agents.length > 0 ? null : 'Belum ada AI-Agent aktif di kantor ini.',
      activeCount: agents.length,
      runningCount: runningNames.size,
      runningAgents: [...runningNames],
      unavailableCount: disabledCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Validasi input settings (dipakai PUT /api/kantor/briefing/settings)
// ---------------------------------------------------------------------------

export interface BriefingSettingsInput {
  isEnabled?: boolean;
  startTime?: string;
  timezone?: string;
  durationMinutes?: number;
  preparationMinutes?: number;
  meetingLeaderId?: string | null;
  participantMode?: string;
  excludedAgentIds?: string[];
  autoReturn?: boolean;
}

export function validateBriefingSettingsInput(
  body: unknown,
): { ok: true; data: BriefingSettingsInput } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Body harus berupa objek JSON.' };
  }
  const b = body as Record<string, unknown>;
  const data: BriefingSettingsInput = {};

  if ('isEnabled' in b) {
    if (typeof b.isEnabled !== 'boolean') return { ok: false, message: 'isEnabled harus boolean.' };
    data.isEnabled = b.isEnabled;
  }
  if ('startTime' in b) {
    if (typeof b.startTime !== 'string' || !parseHHMM(b.startTime)) {
      return { ok: false, message: 'startTime harus format "HH:MM" (mis. "08:00").' };
    }
    data.startTime = b.startTime;
  }
  if ('timezone' in b) {
    if (typeof b.timezone !== 'string' || !(BRIEFING_TIMEZONES as readonly string[]).includes(b.timezone)) {
      return { ok: false, message: 'timezone harus Asia/Jakarta, Asia/Makassar, atau Asia/Jayapura.' };
    }
    data.timezone = b.timezone;
  }
  if ('durationMinutes' in b) {
    if (typeof b.durationMinutes !== 'number' || !Number.isInteger(b.durationMinutes) || b.durationMinutes < 1 || b.durationMinutes > 60) {
      return { ok: false, message: 'durationMinutes harus bilangan bulat 1–60 menit.' };
    }
    data.durationMinutes = b.durationMinutes;
  }
  if ('preparationMinutes' in b) {
    if (typeof b.preparationMinutes !== 'number' || !Number.isInteger(b.preparationMinutes) || b.preparationMinutes < 0 || b.preparationMinutes > 10) {
      return { ok: false, message: 'preparationMinutes harus bilangan bulat 0–10 menit.' };
    }
    data.preparationMinutes = b.preparationMinutes;
  }
  if ('meetingLeaderId' in b) {
    if (b.meetingLeaderId !== null && typeof b.meetingLeaderId !== 'string') {
      return { ok: false, message: 'meetingLeaderId harus string atau null.' };
    }
    data.meetingLeaderId = b.meetingLeaderId as string | null;
  }
  if ('participantMode' in b) {
    if (b.participantMode !== 'all' && b.participantMode !== 'selected') {
      return { ok: false, message: 'participantMode harus "all" atau "selected".' };
    }
    data.participantMode = b.participantMode;
  }
  if ('excludedAgentIds' in b) {
    if (!Array.isArray(b.excludedAgentIds) || !b.excludedAgentIds.every((x) => typeof x === 'string')) {
      return { ok: false, message: 'excludedAgentIds harus array string.' };
    }
    data.excludedAgentIds = b.excludedAgentIds as string[];
  }
  if ('autoReturn' in b) {
    if (typeof b.autoReturn !== 'boolean') return { ok: false, message: 'autoReturn harus boolean.' };
    data.autoReturn = b.autoReturn;
  }
  return { ok: true, data };
}
