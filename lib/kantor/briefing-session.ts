/**
 * WOORK VIRTUAL OFFICE — Morning Briefing session state (state machine).
 *
 * State bersama PER KANTOR (per org): in-memory di server (pola
 * lib/kantor/sleep.ts + lib/kantor/theme.ts) + persistensi DB
 * BriefingSession/BriefingParticipant. Fase diturunkan dari JAM
 * (prepStartAt/scheduledAt/endsAt), BUKAN dari setTimeout panjang —
 * jadi tidak ada timer yang bocor dan fase selalu benar walau proses
 * restart: `getBriefingState` membaca ulang sesi aktif hari ini dari DB
 * bila state in-memory kosong.
 *
 * State machine: SCHEDULED → PREPARING → AGENTS_MOVING → GATHERING →
 * IN_PROGRESS → CLOSING → RETURNING → COMPLETED (atau FAILED).
 * CLOSING/RETURNING hanya diset eksplisit saat endBriefingSession.
 *
 * Catatan arsitektur: scheduler cron jalan sebagai proses tsx terpisah,
 * jadi publish SSE dari sana tidak mencapai client (broker SSE in-process
 * di `next start`). Yang membuat layar ikut berubah adalah snapshot
 * GET /api/kantor/office (`briefing`, dibaca dari state ini / DB) yang
 * di-reload client tiap batas langkah idle (~32 dtk) + tiap event SSE.
 * Start/stop manual lewat API jalan di proses Next.js, jadi SSE-nya
 * langsung sampai.
 *
 * Aturan keras:
 * - Satu sesi per org per hari (@@unique organizationId+scheduledDate).
 * - Sesi yang terlewat TIDAK diputar ulang (FAILED, bukan replay).
 * - Agent dengan AgentTask RUNNING tidak dipaksa ikut (SKIPPED).
 * - Briefing tidak dimulai bila ada PrayerSession IN_PROGRESS (guard).
 */
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { publishAgentEvent } from '@/lib/agents/events';
import { markBriefingArrivals } from './session-arrival';
import type { KantorBriefingState } from '@/lib/kantor/types';
import {
  deriveBriefingPhase,
  getBriefingSettings,
  getBriefingWindow,
  resolveParticipants,
  type BriefingPhase,
  type BriefingWindow,
} from './briefing';

/** Status sesi yang masih dianggap "aktif" (belum terminal). */
export const ACTIVE_BRIEFING_STATUSES: string[] = [
  'SCHEDULED',
  'PREPARING',
  'AGENTS_MOVING',
  'GATHERING',
  'IN_PROGRESS',
  'CLOSING',
  'RETURNING',
];

const TERMINAL_STATUSES: string[] = ['COMPLETED', 'FAILED'];

interface BriefingLiveState {
  sessionId: string;
  phase: BriefingPhase;
  prepStartAt: Date;
  scheduledAt: Date;
  endsAt: Date;
  leaderName: string | null;
  startedAt: Date;
  updatedAt: number;
}

const liveByOrg = new Map<string, BriefingLiveState>();

function toSnapshotState(
  live: BriefingLiveState,
  now: Date,
): KantorBriefingState {
  // Sesi terminal (COMPLETED/FAILED) tetap terminal — JANGAN diturunkan
  // ulang dari jam (jam masih bisa berada dalam jendela briefing).
  if (live.phase === 'COMPLETED' || live.phase === 'FAILED') {
    return {
      active: false,
      phase: live.phase,
      startedAt: live.startedAt.toISOString(),
      endsAt: live.endsAt.toISOString(),
      sessionId: live.sessionId,
      leaderName: live.leaderName,
    };
  }
  const derived = deriveBriefingPhase(live.prepStartAt, live.scheduledAt, live.endsAt, now);
  // CLOSING/RETURNING hanya dari transisi eksplisit — pertahankan.
  const phase =
    live.phase === 'CLOSING' || live.phase === 'RETURNING' ? live.phase : derived;
  const active = phase !== 'COMPLETED' && phase !== 'FAILED';
  return {
    active,
    phase,
    startedAt: live.startedAt.toISOString(),
    endsAt: live.endsAt.toISOString(),
    sessionId: live.sessionId,
    leaderName: live.leaderName,
  };
}

function inactiveState(): KantorBriefingState {
  return { active: false, phase: null, startedAt: null, endsAt: null, sessionId: null, leaderName: null };
}

async function publishBriefingChanged(
  organizationId: string,
  state: KantorBriefingState,
): Promise<void> {
  await publishAgentEvent(organizationId, 'kantor.briefing_changed', {
    active: state.active,
    phase: state.phase,
    sessionId: state.sessionId,
    leaderName: state.leaderName,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
  });
}

/**
 * State briefing kantor ini — dipakai snapshot GET /api/kantor/office.
 * In-memory dulu; bila kosong, baca sesi aktif hari ini dari DB (dipakai
 * setelah restart / sesi dimulai scheduler cron dari proses terpisah).
 */
export async function getBriefingState(organizationId: string): Promise<KantorBriefingState> {
  const now = new Date();
  const live = liveByOrg.get(organizationId);
  if (live) {
    if (live.phase !== 'COMPLETED' && live.phase !== 'FAILED') {
      live.phase = deriveBriefingPhase(live.prepStartAt, live.scheduledAt, live.endsAt, now);
      live.updatedAt = now.getTime();
    }
    return toSnapshotState(live, now);
  }

  const settings = await getBriefingSettings(organizationId);
  const today = getBriefingWindow(settings, now);
  const session = await prisma.briefingSession.findFirst({
    where: {
      organizationId,
      scheduledDate: today.scheduledDate,
      status: { in: [...ACTIVE_BRIEFING_STATUSES, ...TERMINAL_STATUSES] },
    },
    orderBy: { scheduledDate: 'desc' },
    include: { participants: { where: { isLeader: true }, select: { agentName: true }, take: 1 } },
  });
  if (!session) return inactiveState();

  const prepStartAt = new Date(session.scheduledAt.getTime() - settings.preparationMinutes * 60 * 1000);
  const endsAt = new Date(session.scheduledAt.getTime() + settings.durationMinutes * 60 * 1000);
  const rebuilt: BriefingLiveState = {
    sessionId: session.id,
    phase: session.status as BriefingPhase,
    prepStartAt,
    scheduledAt: session.scheduledAt,
    endsAt,
    leaderName: session.participants[0]?.agentName ?? null,
    startedAt: session.startedAt ?? session.scheduledAt,
    updatedAt: now.getTime(),
  };
  if ([...ACTIVE_BRIEFING_STATUSES].includes(session.status)) {
    liveByOrg.set(organizationId, rebuilt);
  }
  return toSnapshotState(rebuilt, now);
}

// ---------------------------------------------------------------------------
// Mulai sesi
// ---------------------------------------------------------------------------

export interface StartBriefingResult {
  session: Awaited<ReturnType<typeof prisma.briefingSession.findUnique>>;
  alreadyExists: boolean;
  leaderName: string | null;
  participantCount: number;
  skippedCount: number;
}

/**
 * Mulai sesi briefing. Idempotent: satu sesi per org per hari — bila sesi
 * hari ini sudah ada (aktif), kembalikan sesi itu tanpa membuat duplikat;
 * bila sudah COMPLETED/FAILED, tolak (satu kali per hari).
 * `manual=true` = tombol "Start Briefing Now" (persiapan dimulai sekarang,
 * mengabaikan isEnabled); `manual=false` = pemicu scheduler 08:00.
 */
export async function startBriefingSession(
  organizationId: string,
  opts: { userId?: string | null; manual?: boolean } = {},
): Promise<StartBriefingResult> {
  const now = new Date();
  const settings = await getBriefingSettings(organizationId);
  if (!settings.isEnabled && !opts.manual) {
    throw new Error('Morning Briefing dinonaktifkan untuk kantor ini.');
  }

  const window: BriefingWindow = opts.manual
    ? {
        scheduledDate: getBriefingWindow(settings, now).scheduledDate,
        prepStartAt: now,
        scheduledAt: new Date(now.getTime() + settings.preparationMinutes * 60 * 1000),
        endsAt: new Date(
          now.getTime() + (settings.preparationMinutes + settings.durationMinutes) * 60 * 1000,
        ),
      }
    : getBriefingWindow(settings, now);

  // Guard Prayer: jangan mulai briefing bila ada sesi salat berjalan.
  const praying = await prisma.prayerSession.findFirst({
    where: { organizationId, status: 'IN_PROGRESS' },
    select: { id: true, prayerName: true },
  });
  if (praying) {
    throw new Error(
      `Ada sesi salat (${praying.prayerName}) yang sedang berjalan — briefing ditunda.`,
    );
  }

  const existing = await prisma.briefingSession.findUnique({
    where: {
      organizationId_scheduledDate: { organizationId, scheduledDate: window.scheduledDate },
    },
    include: { participants: { where: { isLeader: true }, select: { agentName: true }, take: 1 } },
  });
  if (existing) {
    if ([...TERMINAL_STATUSES].includes(existing.status)) {
      throw new Error(
        `Briefing hari ini sudah ${existing.status === 'COMPLETED' ? 'selesai' : 'dilewati'} — hanya satu sesi per hari.`,
      );
    }
    const live: BriefingLiveState = {
      sessionId: existing.id,
      phase: existing.status as BriefingPhase,
      prepStartAt: window.prepStartAt,
      scheduledAt: existing.scheduledAt,
      endsAt: new Date(
        existing.scheduledAt.getTime() + settings.durationMinutes * 60 * 1000,
      ),
      leaderName: existing.participants[0]?.agentName ?? null,
      startedAt: existing.startedAt ?? existing.scheduledAt,
      updatedAt: now.getTime(),
    };
    liveByOrg.set(organizationId, live);
    return {
      session: existing,
      alreadyExists: true,
      leaderName: live.leaderName,
      participantCount: existing.participantCount,
      skippedCount: 0,
    };
  }

  const { leader, participants, skipped } = await resolveParticipants(
    organizationId,
    settings,
  );
  const leaderName = leader?.agentName ?? null;

  let session;
  try {
    session = await prisma.$transaction(async (tx) => {
      const created = await tx.briefingSession.create({
        data: {
          organizationId,
          scheduledDate: window.scheduledDate,
          scheduledAt: window.scheduledAt,
          startedAt: now,
          status: 'PREPARING',
          participantCount: participants.length,
          meetingLeaderId: leader?.agentId ?? null,
        },
      });
      const rows = [
        ...participants.map((p) => ({
          sessionId: created.id,
          agentId: p.agentId,
          agentName: p.agentName,
          isLeader: p.isLeader,
          initialRoom: p.initialRoom,
          initialPosition: p.initialPosition as unknown as object,
          meetingPosition: p.meetingPosition as unknown as object,
          status: 'INVITED' as const,
        })),
        ...skipped.map((p) => ({
          sessionId: created.id,
          agentId: p.agentId,
          agentName: p.agentName,
          isLeader: false,
          initialRoom: p.initialRoom,
          initialPosition: p.initialPosition as unknown as object,
          meetingPosition: p.meetingPosition as unknown as object,
          status: 'SKIPPED' as const,
        })),
      ];
      if (rows.length > 0) {
        await tx.briefingParticipant.createMany({ data: rows });
      }
      return created;
    });
  } catch (e: unknown) {
    // Race: dua pemicu bersamaan — @@unique menolak yang kedua.
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') {
      const raced = await prisma.briefingSession.findUnique({
        where: {
          organizationId_scheduledDate: { organizationId, scheduledDate: window.scheduledDate },
        },
      });
      if (raced) {
        return {
          session: raced,
          alreadyExists: true,
          leaderName: null,
          participantCount: raced.participantCount,
          skippedCount: 0,
        };
      }
    }
    throw e;
  }

  // Pemicu scheduler (keputusan user 2026-11-24): tandai kedatangan peserta
  // SAAT SESI DIMULAI (arrivedAt = waktu mulai sesi), supaya kedatangan
  // tercatat meski tidak ada browser yang membuka /kantor selama sesi.
  // Idempotent (hanya baris arrivedAt NULL yang disentuh; SKIPPED tidak
  // disentuh) — pemanggilan yang sama dari snapshot route nanti
  // menghasilkan 0 baris. Gagal mencatat bukan alasan menggagalkan start.
  try {
    await markBriefingArrivals(prisma, session.id, now);
  } catch {
    // Kedatangan gagal dicatat — sesi tetap berjalan; snapshot berikutnya
    // akan mencoba lagi.
  }

  const live: BriefingLiveState = {
    sessionId: session.id,
    phase: 'PREPARING',
    prepStartAt: window.prepStartAt,
    scheduledAt: window.scheduledAt,
    endsAt: window.endsAt,
    leaderName,
    startedAt: now,
    updatedAt: now.getTime(),
  };
  liveByOrg.set(organizationId, live);

  await publishBriefingChanged(organizationId, toSnapshotState(live, now));
  await audit({
    organizationId,
    userId: opts.userId ?? null,
    action: 'BRIEFING_START',
    module: 'KANTOR',
    description: `Morning Briefing dimulai (${opts.manual ? 'manual' : 'jadwal 08:00'}), leader: ${leaderName ?? '-'}, peserta: ${participants.length}${skipped.length > 0 ? `, dilewati: ${skipped.length}` : ''}.`,
  });

  return {
    session,
    alreadyExists: false,
    leaderName,
    participantCount: participants.length,
    skippedCount: skipped.length,
  };
}

// ---------------------------------------------------------------------------
// Akhiri sesi
// ---------------------------------------------------------------------------

type BriefingSessionRow = Awaited<
  ReturnType<typeof prisma.briefingSession.findFirst>
>;

async function finalizeSessionRow(
  session: NonNullable<BriefingSessionRow>,
  organizationId: string,
  reason: string,
  userId?: string | null,
): Promise<NonNullable<BriefingSessionRow>> {
  const now = new Date();
  const failed = reason.startsWith('error');
  // CLOSING -> RETURNING -> COMPLETED/FAILED (tiap transisi dicatat + SSE).
  await prisma.briefingSession.update({
    where: { id: session.id },
    data: { status: 'CLOSING' },
  });
  const live = liveByOrg.get(organizationId);
  if (live && live.sessionId === session.id) {
    live.phase = 'CLOSING';
    live.updatedAt = now.getTime();
    await publishBriefingChanged(organizationId, toSnapshotState(live, now));
  }

  const reachedBriefing = ['IN_PROGRESS', 'CLOSING', 'RETURNING'].includes(session.status);
  await prisma.briefingParticipant.updateMany({
    where: {
      sessionId: session.id,
      status: { in: ['INVITED', 'MOVING', 'SEATED', 'PRESENTING'] },
    },
    data: {
      status: reachedBriefing ? 'COMPLETED' : 'RETURNED',
      leftAt: now,
    },
  });
  await prisma.briefingSession.update({
    where: { id: session.id },
    data: { status: 'RETURNING' },
  });
  if (live && live.sessionId === session.id) {
    live.phase = 'RETURNING';
    live.updatedAt = now.getTime();
    await publishBriefingChanged(organizationId, toSnapshotState(live, now));
  }

  const ended = await prisma.briefingSession.update({
    where: { id: session.id },
    data: {
      status: failed ? 'FAILED' : 'COMPLETED',
      endedAt: now,
      errorMessage: failed ? reason : session.errorMessage,
    },
  });
  if (live && live.sessionId === session.id) {
    liveByOrg.delete(organizationId);
  }
  await publishBriefingChanged(organizationId, {
    active: false,
    phase: failed ? 'FAILED' : 'COMPLETED',
    startedAt: session.startedAt?.toISOString() ?? null,
    endsAt: now.toISOString(),
    sessionId: session.id,
    leaderName: live?.leaderName ?? null,
  });
  await audit({
    organizationId,
    userId: userId ?? null,
    action: 'BRIEFING_END',
    module: 'KANTOR',
    description: `Morning Briefing ${failed ? 'gagal' : 'selesai'} (${reason}).`,
  });
  return ended;
}

/**
 * Akhiri sesi briefing hari ini (manual stop / waktu habis / recovery).
 * `reason`: 'manual_stop' | 'waktu_habis' | 'recovery: ...' | 'error: ...'.
 * Mengembalikan sesi yang diakhiri, atau null bila tidak ada sesi aktif.
 */
export async function endBriefingSession(
  organizationId: string,
  reason: string,
  opts: { userId?: string | null } = {},
): Promise<NonNullable<BriefingSessionRow> | null> {
  const settings = await getBriefingSettings(organizationId);
  const today = getBriefingWindow(settings, new Date());
  const session = await prisma.briefingSession.findFirst({
    where: {
      organizationId,
      scheduledDate: today.scheduledDate,
      status: { in: [...ACTIVE_BRIEFING_STATUSES] },
    },
    orderBy: { scheduledDate: 'desc' },
  });
  if (!session) return null;
  return finalizeSessionRow(session, organizationId, reason, opts.userId);
}

// ---------------------------------------------------------------------------
// Sinkronisasi fase (dipakai scheduler tiap 1 menit) + recovery
// ---------------------------------------------------------------------------

/**
 * Majukan fase sesi aktif hari ini berdasarkan jam. Bila waktu sudah lewat
 * endsAt, akhiri sesi (COMPLETED). Bila fase berubah, simpan + siarkan SSE.
 */
export async function syncBriefingState(
  organizationId: string,
  now: Date = new Date(),
): Promise<KantorBriefingState | null> {
  const settings = await getBriefingSettings(organizationId);
  const today = getBriefingWindow(settings, now);
  const session = await prisma.briefingSession.findFirst({
    where: {
      organizationId,
      scheduledDate: today.scheduledDate,
      status: { in: [...ACTIVE_BRIEFING_STATUSES] },
    },
    orderBy: { scheduledDate: 'desc' },
  });
  if (!session) return null;

  const prepStartAt = new Date(
    session.scheduledAt.getTime() - settings.preparationMinutes * 60 * 1000,
  );
  const endsAt = new Date(
    session.scheduledAt.getTime() + settings.durationMinutes * 60 * 1000,
  );
  const derived = deriveBriefingPhase(prepStartAt, session.scheduledAt, endsAt, now);
  if (derived === 'COMPLETED') {
    await endBriefingSession(organizationId, 'waktu_habis');
    return inactiveState();
  }
  if (derived !== session.status) {
    await prisma.briefingSession.update({
      where: { id: session.id },
      data: { status: derived },
    });
    const live = liveByOrg.get(organizationId);
    if (live && live.sessionId === session.id) {
      live.phase = derived;
      live.updatedAt = now.getTime();
    }
    const leader = await prisma.briefingParticipant.findFirst({
      where: { sessionId: session.id, isLeader: true },
      select: { agentName: true },
    });
    await publishBriefingChanged(organizationId, {
      active: true,
      phase: derived,
      startedAt: session.startedAt?.toISOString() ?? null,
      endsAt: endsAt.toISOString(),
      sessionId: session.id,
      leaderName: leader?.agentName ?? null,
    });
  }
  return getBriefingState(organizationId);
}

/**
 * Tandai briefing hari ini sebagai FAILED (terlewat) TANPA memutar ulang.
 * Dipakai scheduler bila jam sudah lewat startTime+duration+30 mnt dan
 * tidak ada sesi sama sekali. Idempotent (@@unique).
 */
export async function markMissedBriefing(
  organizationId: string,
  window: BriefingWindow,
): Promise<NonNullable<BriefingSessionRow>> {
  const now = new Date();
  try {
    return await prisma.briefingSession.create({
      data: {
        organizationId,
        scheduledDate: window.scheduledDate,
        scheduledAt: window.scheduledAt,
        status: 'FAILED',
        endedAt: now,
        errorMessage: 'Terlewat — briefing tidak diputar ulang.',
        participantCount: 0,
      },
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') {
      const existing = await prisma.briefingSession.findUnique({
        where: {
          organizationId_scheduledDate: { organizationId, scheduledDate: window.scheduledDate },
        },
      });
      if (existing) return existing;
    }
    throw e;
  }
}

/**
 * Pulihkan sesi basi setelah restart / scheduler tertinggal:
 * - sesi aktif di hari KEMARIN (atau lebih lama) -> FAILED (tidak diputar ulang),
 * - sesi aktif hari ini yang sudah lewat endsAt -> COMPLETED.
 * Mengembalikan {recovered, failed}.
 */
export async function recoverStaleSessions(): Promise<{ recovered: number; failed: number }> {
  const now = new Date();
  const stale = await prisma.briefingSession.findMany({
    where: { status: { in: [...ACTIVE_BRIEFING_STATUSES] } },
    orderBy: { scheduledDate: 'asc' },
    select: { id: true, organizationId: true, scheduledAt: true, scheduledDate: true, status: true, startedAt: true, errorMessage: true },
  });
  let recovered = 0;
  let failed = 0;
  const settingsCache = new Map<string, Awaited<ReturnType<typeof getBriefingSettings>>>();
  for (const session of stale) {
    let settings = settingsCache.get(session.organizationId);
    if (!settings) {
      settings = await getBriefingSettings(session.organizationId);
      settingsCache.set(session.organizationId, settings);
    }
    const todayWindow = getBriefingWindow(settings, now);
    const endsAt = new Date(
      session.scheduledAt.getTime() + settings.durationMinutes * 60 * 1000,
    );
    if (session.scheduledDate.getTime() < todayWindow.scheduledDate.getTime()) {
      await prisma.briefingSession.update({
        where: { id: session.id },
        data: {
          status: 'FAILED',
          endedAt: now,
          errorMessage: 'Terlewat — tidak diputar ulang setelah restart.',
        },
      });
      liveByOrg.delete(session.organizationId);
      failed += 1;
    } else if (now.getTime() > endsAt.getTime()) {
      await finalizeSessionRow(
        session as NonNullable<BriefingSessionRow>,
        session.organizationId,
        'recovery: waktu habis',
      );
      recovered += 1;
    }
  }
  return { recovered, failed };
}
