// GET/POST /api/kantor/briefing/session — sesi Morning Briefing.
// GET: sesi aktif hari ini + riwayat 7 hari terakhir (auth + modul kantor).
// POST {action}: 'start' = "Start Briefing Now" (manual, persiapan dimulai
// sekarang), 'stop' = hentikan sesi aktif, 'preview' = konten + daftar
// peserta + posisi meeting TANPA memulai sesi. Ketiganya hanya OWNER /
// ADMIN kantor atau Super Admin (pola Kelola Agent). Start/stop dicatat
// di AuditLog (BRIEFING_START / BRIEFING_END).
import { prisma } from '@/lib/db';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { canManageAgents } from '@/lib/agents/manage';
import {
  getBriefingContent,
  getBriefingSettings,
  getBriefingWindow,
  orgDayStartUtc,
  orgDateParts,
  resolveParticipants,
} from '@/lib/kantor/briefing';
import {
  endBriefingSession,
  getBriefingState,
  startBriefingSession,
} from '@/lib/kantor/briefing-session';

export const dynamic = 'force-dynamic';

function serializeSession(
  s: {
    id: string;
    scheduledDate: Date;
    scheduledAt: Date;
    startedAt: Date | null;
    endedAt: Date | null;
    status: string;
    participantCount: number;
    meetingLeaderId: string | null;
    errorMessage: string | null;
  },
  participants?: unknown,
) {
  return {
    id: s.id,
    scheduledDate: s.scheduledDate.toISOString().slice(0, 10),
    scheduledAt: s.scheduledAt.toISOString(),
    startedAt: s.startedAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
    status: s.status,
    participantCount: s.participantCount,
    meetingLeaderId: s.meetingLeaderId,
    errorMessage: s.errorMessage,
    ...(participants !== undefined ? { participants } : {}),
  };
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    const settings = await getBriefingSettings(ctx.organizationId);
    const now = new Date();
    const today = getBriefingWindow(settings, now);
    const parts = orgDateParts(now, settings.timezone);
    const sevenDaysAgo = orgDayStartUtc(parts.year, parts.month, parts.day, settings.timezone);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

    const [active, history] = await Promise.all([
      prisma.briefingSession.findFirst({
        where: {
          organizationId: ctx.organizationId,
          scheduledDate: today.scheduledDate,
        },
        include: {
          participants: {
            orderBy: [{ isLeader: 'desc' }, { agentName: 'asc' }],
            select: {
              id: true,
              agentId: true,
              agentName: true,
              isLeader: true,
              status: true,
              meetingPosition: true,
              initialRoom: true,
              arrivedAt: true,
              leftAt: true,
            },
          },
        },
      }),
      prisma.briefingSession.findMany({
        where: {
          organizationId: ctx.organizationId,
          scheduledDate: { gte: sevenDaysAgo },
        },
        orderBy: { scheduledDate: 'desc' },
        select: {
          id: true,
          scheduledDate: true,
          scheduledAt: true,
          startedAt: true,
          endedAt: true,
          status: true,
          participantCount: true,
          meetingLeaderId: true,
          errorMessage: true,
          _count: { select: { participants: true } },
        },
      }),
    ]);

    const state = await getBriefingState(ctx.organizationId);
    return apiOk({
      state,
      active: active
        ? serializeSession(active, active.participants)
        : null,
      history: history.map((h) => serializeSession(h)),
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat sesi briefing.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengendalikan briefing.', 403);
    }
    const body = await req.json().catch(() => null);
    const action = (body as { action?: unknown } | null)?.action;
    if (action !== 'start' && action !== 'stop' && action !== 'preview') {
      return apiErr("action harus 'start', 'stop', atau 'preview'.", 400);
    }

    if (action === 'preview') {
      const settings = await getBriefingSettings(ctx.organizationId);
      const [content, resolved] = await Promise.all([
        getBriefingContent(ctx.organizationId),
        resolveParticipants(ctx.organizationId, settings),
      ]);
      return apiOk({
        content,
        leader: resolved.leader,
        participants: resolved.participants,
        skipped: resolved.skipped,
      });
    }

    if (action === 'start') {
      try {
        const result = await startBriefingSession(ctx.organizationId, {
          userId: ctx.userId,
          manual: true,
        });
        const state = await getBriefingState(ctx.organizationId);
        return apiOk({
          state,
          session: result.session ? serializeSession(result.session) : null,
          alreadyExists: result.alreadyExists,
          leaderName: result.leaderName,
          participantCount: result.participantCount,
          skippedCount: result.skippedCount,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Gagal memulai briefing.';
        const conflict =
          message.includes('sudah') || message.includes('salat');
        return apiErr(message, conflict ? 409 : 400);
      }
    }

    // action === 'stop'
    const ended = await endBriefingSession(ctx.organizationId, 'manual_stop', {
      userId: ctx.userId,
    });
    if (!ended) return apiErr('Tidak ada sesi briefing aktif hari ini.', 404);
    const state = await getBriefingState(ctx.organizationId);
    return apiOk({ state, session: serializeSession(ended) });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memproses sesi briefing.', 500);
  }
}
