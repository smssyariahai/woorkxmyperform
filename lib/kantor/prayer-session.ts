/**
 * WOORK VIRTUAL OFFICE — Prayer Session state (Musala).
 *
 * State bersama PER KANTOR (per org), in-memory di server (pola yang
 * sama dengan lib/kantor/sleep.ts + lib/kantor/theme.ts), dengan
 * persistensi DB di tabel PrayerSession (+ PrayerSessionParticipant).
 * Diubah lewat POST /api/kantor/prayer/session dan scheduler cron
 * (scripts/kantor-prayer-scheduler.ts); disiarkan lewat event SSE
 * `kantor.prayer_changed` (pola Wave 10/11).
 *
 * Batasan yang disadari (sama seperti Tidur/Tema): in-memory kembali
 * kosong saat proses `next start` restart / VM ke-reset. Bedanya dengan
 * Tidur: sesi salat punya jejak DB, jadi `getPrayerState()` melakukan
 * re-hidrasi — bila ada PrayerSession IN_PROGRESS yang masih dalam
 * durasinya, state aktif dikembalikan dari DB; bila sudah lewat,
 * sesi itu ditandai COMPLETED (recovery).
 *
 * PRINSIP (§7 prompt): peserta yang sedang menjalankan tugas KRITIS
 * (AgentTask status RUNNING) TIDAK dipaksa ikut — ditandai SKIPPED.
 * Tugas yang sedang berjalan tidak dihentikan, tidak dibatalkan, dan
 * statusnya tidak dihapus. Setelah sesi selesai, agent kembali ke
 * aktivitas sebelumnya lewat placement normal snapshot (state-derived),
 * bukan lewat posisi yang disimpan — kolom initialRoom/initialPosition
 * hanya jejak audit.
 */
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { publishAgentEvent } from '@/lib/agents/events';
import { markPrayerArrivals } from './session-arrival';
import type { KantorPrayerState } from './types';
import {
  dateKeyInZone,
  dateKeyToMidnightUTC,
  getPrayerSettings,
  getTodaySchedule,
  combineDateTime,
  tzOffsetHours,
  PRAYER_LABELS,
  type PrayerName,
} from './prayer';

const IDLE_STATE: KantorPrayerState = {
  active: false,
  prayerName: null,
  prayerLabel: null,
  startedAt: null,
  endsAt: null,
  sessionId: null,
};

const prayerByOrg = new Map<string, KantorPrayerState>();

// ---------------------------------------------------------------------------
// Getter (dipakai snapshot GET /api/kantor/office oleh parent)
// ---------------------------------------------------------------------------

/**
 * State sesi salat kantor ini. Bila in-memory kosong, cek DB: sesi
 * IN_PROGRESS yang masih dalam durasinya dihidupkan kembali (re-hidrasi);
 * yang sudah lewat ditandai COMPLETED.
 */
export async function getPrayerState(organizationId: string): Promise<KantorPrayerState> {
  const mem = prayerByOrg.get(organizationId);
  if (mem?.active) return mem;

  const active = await prisma.prayerSession.findFirst({
    where: { organizationId, status: 'IN_PROGRESS' },
    orderBy: { startedAt: 'desc' },
  });
  if (!active?.startedAt) return { ...IDLE_STATE };

  const settings = await getPrayerSettings(organizationId);
  const endsAt = new Date(active.startedAt.getTime() + settings.sessionDurationMinutes * 60 * 1000);
  if (Date.now() >= endsAt.getTime()) {
    // Basi (mis. restart di tengah sesi) — pulihkan sebagai COMPLETED.
    await endPrayerSession(organizationId, 'completed');
    return { ...IDLE_STATE };
  }

  const state: KantorPrayerState = {
    active: true,
    prayerName: active.prayerName as PrayerName,
    prayerLabel: PRAYER_LABELS[active.prayerName as PrayerName] ?? active.prayerName,
    startedAt: active.startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
    sessionId: active.id,
  };
  prayerByOrg.set(organizationId, state);
  return state;
}

/** Sesi IN_PROGRESS terbaru untuk org ini (atau null). */
export async function getActiveSession(organizationId: string) {
  return prisma.prayerSession.findFirst({
    where: { organizationId, status: 'IN_PROGRESS' },
    orderBy: { startedAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Peserta
// ---------------------------------------------------------------------------

export interface EligibleAgent {
  id: string;
  name: string;
  role: string;
  isImam: boolean;
  /** Ruang asal (turunan dari currentStatus, sama seperti office route). */
  initialRoom: 'Workspace' | 'Lounge';
}

export interface SkippedAgent {
  id: string;
  name: string;
  reason: string;
}

export interface Eligibility {
  participants: EligibleAgent[];
  skipped: SkippedAgent[];
  imam: EligibleAgent | null;
}

function parseExcludedIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  return [];
}

/**
 * Daftar agent yang memenuhi syarat ikut sesi salat: agent aktif
 * (isEnabled) di org ini, bukan di excludedAgentIds, dan TIDAK sedang
 * menjalankan AgentTask RUNNING (tugas kritis — ditandai SKIPPED).
 *
 * Imam: defaultImamAgentId dari settings bila ada dan memenuhi syarat;
 * bila tidak, agent pertama berdasarkan urutan nama (deterministik —
 * TIDAK hardcode nama agent).
 */
export async function getEligibleAgents(organizationId: string): Promise<Eligibility> {
  const settings = await getPrayerSettings(organizationId);
  const excluded = new Set(parseExcludedIds(settings.excludedAgentIds));

  const agents = await prisma.agent.findMany({
    where: { organizationId, isEnabled: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, role: true, currentStatus: true },
  });

  const running = await prisma.agentTask.findMany({
    where: { organizationId, agentId: { in: agents.map((a) => a.id) }, status: 'RUNNING' },
    select: { agentId: true },
  });
  const runningIds = new Set(running.map((t) => t.agentId));

  const participants: EligibleAgent[] = [];
  const skipped: SkippedAgent[] = [];
  for (const a of agents) {
    if (excluded.has(a.id)) {
      skipped.push({ id: a.id, name: a.name, reason: 'Dikecualikan di pengaturan salat' });
      continue;
    }
    if (runningIds.has(a.id)) {
      skipped.push({ id: a.id, name: a.name, reason: 'Sedang menjalankan tugas (RUNNING) — tidak dipaksa ikut' });
      continue;
    }
    const initialRoom: 'Workspace' | 'Lounge' =
      a.currentStatus === 'EXECUTING_TASK' ||
      a.currentStatus === 'THINKING' ||
      a.currentStatus === 'WORKING' ||
      a.currentStatus === 'COMPLETED'
        ? 'Workspace'
        : 'Lounge';
    participants.push({ id: a.id, name: a.name, role: a.role, isImam: false, initialRoom });
  }

  let imam: EligibleAgent | null = null;
  if (settings.defaultImamAgentId) {
    imam = participants.find((p) => p.id === settings.defaultImamAgentId) ?? null;
  }
  if (!imam) imam = participants[0] ?? null;
  if (imam) imam.isImam = true;

  return { participants, skipped, imam };
}

// ---------------------------------------------------------------------------
// Start / End
// ---------------------------------------------------------------------------

export interface StartResult {
  session: NonNullable<Awaited<ReturnType<typeof prisma.prayerSession.findUnique>>>;
  participants: EligibleAgent[];
  skipped: SkippedAgent[];
  imam: EligibleAgent | null;
  /** true bila sesi sudah ada sebelumnya (idempotent — tidak dibuat ganda). */
  alreadyExisted: boolean;
}

/**
 * Mulai sesi salat. IDEMPOTENT: bila sudah ada PrayerSession untuk
 * (org, tanggal lokal, nama salat) dengan status IN_PROGRESS atau
 * COMPLETED, sesi itu yang dikembalikan (tidak dibuat ganda). Bila
 * statusnya MISSED/STOPPED, baris yang sama dipakai ulang (direset ke
 * IN_PROGRESS) — unik @@unique(org, tanggal, nama) tetap terjaga.
 */
export async function startPrayerSession(
  organizationId: string,
  prayerName: PrayerName,
  opts?: { userId?: string | null; scheduledAt?: Date; manual?: boolean }
): Promise<StartResult> {
  const settings = await getPrayerSettings(organizationId);
  const offset = tzOffsetHours(settings.timezone);
  const now = new Date();
  const dateKey = dateKeyInZone(opts?.scheduledAt ?? now, offset);
  const prayerDate = dateKeyToMidnightUTC(dateKey);
  const schedule = await getTodaySchedule(organizationId, dateKey, now);
  const timeField: Record<PrayerName, string> = {
    subuh: schedule.fajr,
    dzuhur: schedule.dhuhr,
    ashar: schedule.asr,
    maghrib: schedule.maghrib,
    isya: schedule.isha,
  };
  const scheduledAt = opts?.scheduledAt ?? combineDateTime(dateKey, timeField[prayerName], offset);
  const endsAt = new Date(now.getTime() + settings.sessionDurationMinutes * 60 * 1000);

  const existing = await prisma.prayerSession.findUnique({
    where: { organizationId_prayerDate_prayerName: { organizationId, prayerDate, prayerName } },
  });
  if (existing && (existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED')) {
    const state: KantorPrayerState = {
      active: existing.status === 'IN_PROGRESS',
      prayerName,
      prayerLabel: PRAYER_LABELS[prayerName],
      startedAt: existing.startedAt?.toISOString() ?? null,
      endsAt: existing.startedAt
        ? new Date(existing.startedAt.getTime() + settings.sessionDurationMinutes * 60 * 1000).toISOString()
        : null,
      sessionId: existing.id,
    };
    if (state.active) prayerByOrg.set(organizationId, state);
    const parts = await prisma.prayerSessionParticipant.findMany({ where: { sessionId: existing.id } });
    return {
      session: existing,
      participants: parts
        .filter((p) => p.status !== 'SKIPPED')
        .map((p) => ({ id: p.agentId, name: p.agentName ?? '', role: '', isImam: p.isImam, initialRoom: (p.initialRoom as 'Workspace' | 'Lounge') ?? 'Lounge' })),
      skipped: parts
        .filter((p) => p.status === 'SKIPPED')
        .map((p) => ({ id: p.agentId, name: p.agentName ?? '', reason: 'Ditandai SKIPPED pada sesi ini' })),
      imam: parts.find((p) => p.isImam)
        ? { id: parts.find((p) => p.isImam)!.agentId, name: parts.find((p) => p.isImam)!.agentName ?? '', role: '', isImam: true, initialRoom: 'Lounge' }
        : null,
      alreadyExisted: true,
    };
  }

  const { participants, skipped, imam } = await getEligibleAgents(organizationId);

  let session;
  if (existing) {
    // MISSED / STOPPED — pakai ulang barisnya.
    await prisma.prayerSessionParticipant.deleteMany({ where: { sessionId: existing.id } });
    session = await prisma.prayerSession.update({
      where: { id: existing.id },
      data: {
        status: 'IN_PROGRESS',
        scheduledAt,
        startedAt: now,
        endedAt: null,
        participantCount: participants.length,
      },
    });
  } else {
    session = await prisma.prayerSession.create({
      data: {
        organizationId,
        prayerName,
        prayerDate,
        scheduledAt,
        startedAt: now,
        status: 'IN_PROGRESS',
        participantCount: participants.length,
      },
    });
  }

  if (participants.length > 0) {
    await prisma.prayerSessionParticipant.createMany({
      data: participants.map((p) => ({
        sessionId: session.id,
        agentId: p.id,
        agentName: p.name,
        isImam: p.isImam,
        initialRoom: p.initialRoom,
        status: 'INVITED',
      })),
    });
  }
  if (skipped.length > 0) {
    await prisma.prayerSessionParticipant.createMany({
      data: skipped.map((s) => ({
        sessionId: session.id,
        agentId: s.id,
        agentName: s.name,
        isImam: false,
        initialRoom: null,
        status: 'SKIPPED',
      })),
    });
  }

  // Pemicu scheduler (keputusan user 2026-11-24): tandai kedatangan peserta
  // SAAT SESI DIMULAI (arrivedAt = waktu mulai sesi), supaya kedatangan
  // tercatat meski tidak ada browser yang membuka /kantor selama sesi.
  // Idempotent (hanya baris arrivedAt NULL yang disentuh; SKIPPED tidak
  // disentuh) — pemanggilan yang sama dari snapshot route nanti
  // menghasilkan 0 baris. Gagal mencatat bukan alasan menggagalkan start.
  try {
    await markPrayerArrivals(prisma, session.id, now);
  } catch {
    // Kedatangan gagal dicatat — sesi tetap berjalan; snapshot berikutnya
    // akan mencoba lagi.
  }

  const state: KantorPrayerState = {
    active: true,
    prayerName,
    prayerLabel: PRAYER_LABELS[prayerName],
    startedAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    sessionId: session.id,
  };
  prayerByOrg.set(organizationId, state);
  await publishAgentEvent(organizationId, 'kantor.prayer_changed', { ...state });

  await audit({
    organizationId,
    userId: opts?.userId ?? null,
    action: 'PRAYER_SESSION_START',
    module: 'KANTOR',
    description: `Sesi salat ${PRAYER_LABELS[prayerName]} dimulai${opts?.manual ? ' (manual)' : ''} — ${participants.length} peserta, ${skipped.length} dilewati.`,
  });

  return { session, participants, skipped, imam, alreadyExisted: false };
}

/**
 * Akhiri sesi salat yang sedang berjalan. `reason` = 'completed'
 * (durasi habis / scheduler) atau 'stopped' (dihentikan manual admin).
 * Peserta INVITED/WALKING/PRAYING → COMPLETED (atau RETURNED bila
 * dihentikan); SKIPPED tetap SKIPPED. State in-memory dibersihkan dan
 * event SSE disiarkan.
 */
export async function endPrayerSession(
  organizationId: string,
  reason: 'completed' | 'stopped',
  opts?: { userId?: string | null }
) {
  const mem = prayerByOrg.get(organizationId);
  const session = mem?.sessionId
    ? await prisma.prayerSession.findUnique({ where: { id: mem.sessionId } })
    : await getActiveSession(organizationId);
  if (!session || session.status !== 'IN_PROGRESS') {
    prayerByOrg.set(organizationId, { ...IDLE_STATE });
    return null;
  }

  const now = new Date();
  const status = reason === 'stopped' ? 'STOPPED' : 'COMPLETED';
  const participantStatus = reason === 'stopped' ? 'RETURNED' : 'COMPLETED';
  const updated = await prisma.prayerSession.update({
    where: { id: session.id },
    data: { status, endedAt: now },
  });
  await prisma.prayerSessionParticipant.updateMany({
    where: { sessionId: session.id, status: { in: ['INVITED', 'WALKING', 'PRAYING'] } },
    data: { status: participantStatus, completedAt: now },
  });

  prayerByOrg.set(organizationId, { ...IDLE_STATE });
  await publishAgentEvent(organizationId, 'kantor.prayer_changed', { ...IDLE_STATE, sessionId: session.id });

  await audit({
    organizationId,
    userId: opts?.userId ?? null,
    action: reason === 'stopped' ? 'PRAYER_SESSION_STOP' : 'PRAYER_SESSION_END',
    module: 'KANTOR',
    description: `Sesi salat ${PRAYER_LABELS[session.prayerName as PrayerName] ?? session.prayerName} ${reason === 'stopped' ? 'dihentikan' : 'selesai'} (${status}).`,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Recovery (dipakai scheduler saat start + cron)
// ---------------------------------------------------------------------------

/**
 * Pulihkan sesi yang basi: IN_PROGRESS yang sudah lewat durasinya →
 * COMPLETED; SCHEDULED yang waktu salatnya sudah lewat durasi → MISSED
 * (tanpa memutar ulang). Bersihkan juga state in-memory yang basi.
 * Mengembalikan jumlah yang dipulihkan.
 */
export async function recoverStaleSessions(): Promise<{ completed: number; missed: number }> {
  const now = new Date();
  let completed = 0;
  let missed = 0;

  const inProgress = await prisma.prayerSession.findMany({
    where: { status: 'IN_PROGRESS' },
    select: { id: true, organizationId: true, startedAt: true, scheduledAt: true },
  });
  for (const s of inProgress) {
    const settings = await getPrayerSettings(s.organizationId);
    const base = s.startedAt ?? s.scheduledAt;
    const endsAt = new Date(base.getTime() + settings.sessionDurationMinutes * 60 * 1000);
    if (now >= endsAt) {
      await prisma.prayerSession.update({ where: { id: s.id }, data: { status: 'COMPLETED', endedAt: now } });
      await prisma.prayerSessionParticipant.updateMany({
        where: { sessionId: s.id, status: { in: ['INVITED', 'WALKING', 'PRAYING'] } },
        data: { status: 'COMPLETED', completedAt: now },
      });
      const mem = prayerByOrg.get(s.organizationId);
      if (mem?.sessionId === s.id) prayerByOrg.set(s.organizationId, { ...IDLE_STATE });
      completed++;
    }
  }

  const scheduled = await prisma.prayerSession.findMany({
    where: { status: 'SCHEDULED' },
    select: { id: true, organizationId: true, scheduledAt: true },
  });
  for (const s of scheduled) {
    const settings = await getPrayerSettings(s.organizationId);
    const endsAt = new Date(s.scheduledAt.getTime() + settings.sessionDurationMinutes * 60 * 1000);
    if (now >= endsAt) {
      await prisma.prayerSession.update({ where: { id: s.id }, data: { status: 'MISSED', endedAt: now } });
      missed++;
    }
  }

  return { completed, missed };
}
