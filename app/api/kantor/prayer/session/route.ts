// GET/POST /api/kantor/prayer/session — sesi salat Kantor Virtual.
//
// GET: sesi aktif saat ini + riwayat 7 hari terakhir (auth + modul
// 'kantor' — semua yang melihat kantor boleh membaca).
//
// POST (hanya OWNER / ADMIN / Super Admin — canManageAgents):
//   { action: 'preview' }  — jadwal + daftar peserta yang akan ikut,
//                            TANPA memulai sesi.
//   { action: 'start', prayerName } — "Start Prayer Simulation Now"
//                            (idempotent: sesi yang sama tidak dibuat
//                            ganda).
//   { action: 'stop' }     — "Stop Prayer Simulation" (status STOPPED,
//                            agent kembali ke aktivitas sebelumnya).
import { prisma } from '@/lib/db';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { canManageAgents } from '@/lib/agents/manage';
import {
  getNextPrayer,
  getTodaySchedule,
  isPrayerTimeNow,
  PRAYER_LABELS,
  PRAYER_NAMES,
  dateKeyInZone,
  tzOffsetHours,
  getPrayerSettings,
  type PrayerName,
} from '@/lib/kantor/prayer';
import {
  endPrayerSession,
  getEligibleAgents,
  getPrayerState,
  startPrayerSession,
} from '@/lib/kantor/prayer-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');

    const settings = await getPrayerSettings(ctx.organizationId);
    const offset = tzOffsetHours(settings.timezone);
    const todayKey = dateKeyInZone(new Date(), offset);
    const [ty, tm, td] = todayKey.split('-').map(Number);
    const fromDate = new Date(Date.UTC(ty, tm - 1, td - 6));

    const [state, history] = await Promise.all([
      getPrayerState(ctx.organizationId),
      prisma.prayerSession.findMany({
        where: { organizationId: ctx.organizationId, prayerDate: { gte: fromDate } },
        orderBy: { scheduledAt: 'desc' },
        take: 35,
        include: {
          participants: {
            select: { id: true, agentId: true, agentName: true, isImam: true, status: true },
            orderBy: { agentName: 'asc' },
          },
        },
      }),
    ]);

    return apiOk({
      state,
      history: history.map((s) => ({
        id: s.id,
        prayerName: s.prayerName,
        prayerLabel: PRAYER_LABELS[s.prayerName as PrayerName] ?? s.prayerName,
        prayerDate: s.prayerDate,
        scheduledAt: s.scheduledAt,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        status: s.status,
        participantCount: s.participantCount,
        participants: s.participants,
      })),
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat sesi salat.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengendalikan sesi salat.', 403);
    }

    const body: unknown = await req.json().catch(() => null);
    const action = (body as { action?: unknown } | null)?.action;

    if (action === 'preview') {
      const [schedule, next, inWindow, eligibility] = await Promise.all([
        getTodaySchedule(ctx.organizationId),
        getNextPrayer(ctx.organizationId),
        isPrayerTimeNow(ctx.organizationId),
        getEligibleAgents(ctx.organizationId),
      ]);
      return apiOk({
        schedule,
        next,
        inWindow,
        participants: eligibility.participants,
        skipped: eligibility.skipped,
        imam: eligibility.imam,
      });
    }

    if (action === 'start') {
      const prayerName = (body as { prayerName?: unknown } | null)?.prayerName;
      if (typeof prayerName !== 'string' || !(PRAYER_NAMES as string[]).includes(prayerName)) {
        return apiErr(`prayerName harus salah satu dari: ${PRAYER_NAMES.join(', ')}.`, 400);
      }
      const result = await startPrayerSession(ctx.organizationId, prayerName as PrayerName, {
        userId: ctx.userId,
        manual: true,
      });
      const state = await getPrayerState(ctx.organizationId);
      return apiOk({
        session: {
          id: result.session.id,
          prayerName: result.session.prayerName,
          prayerLabel: PRAYER_LABELS[prayerName as PrayerName],
          scheduledAt: result.session.scheduledAt,
          startedAt: result.session.startedAt,
          endedAt: result.session.endedAt,
          status: result.session.status,
          participantCount: result.session.participantCount,
        },
        participants: result.participants,
        skipped: result.skipped,
        imam: result.imam,
        alreadyExisted: result.alreadyExisted,
        state,
      });
    }

    if (action === 'stop') {
      const session = await endPrayerSession(ctx.organizationId, 'stopped', { userId: ctx.userId });
      if (!session) {
        return apiOk({ active: false, message: 'Tidak ada sesi salat yang sedang berjalan.' });
      }
      return apiOk({
        active: false,
        session: {
          id: session.id,
          prayerName: session.prayerName,
          prayerLabel: PRAYER_LABELS[session.prayerName as PrayerName] ?? session.prayerName,
          scheduledAt: session.scheduledAt,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          status: session.status,
          participantCount: session.participantCount,
        },
      });
    }

    return apiErr("action harus 'preview', 'start', atau 'stop'.", 400);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengendalikan sesi salat.', 500);
  }
}
