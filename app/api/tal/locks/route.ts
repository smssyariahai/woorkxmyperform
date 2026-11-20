// GET /api/tal/locks — baca TalLockReport (scope+scopeKey).
// User biasa: hanya milik sendiri (param userId orang lain diabaikan,
// pola §5.1). Admin (OWNER/ADMIN/isSuperAdmin): boleh ?all=1 / ?userId=.
// (Porting GET /api/pg/tal/locks. POST /api/tal/locks milik sub-tahap (a)
//  — sengaja TIDAK dibuat di sini agar tidak bentrok.)
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { talIsHrAdmin } from '@/lib/tal/team';
import {
  applyRolloverDecisions,
  buildReportSummary,
  mapLockReport,
  mapTalTask,
  parseScopeKey,
  scopeDeadlines,
  scopeKeyFor,
  taskPeriodWhere,
} from '@/lib/tal/server';
import { dispatchTalNotification } from '@/lib/tal/notify';
import { getWeekNumberAndYear, parseDateKey } from '@/lib/tal/date';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') || undefined;
    const scopeKey = url.searchParams.get('scopeKey') || undefined;
    const admin = talIsHrAdmin(ctx);
    let userId = ctx.userId;
    if (admin && url.searchParams.get('all') === '1') {
      userId = url.searchParams.get('userId') || '';
    } else if (admin && url.searchParams.get('userId')) {
      userId = url.searchParams.get('userId')!;
    }
    const where: Record<string, unknown> = { organizationId: ctx.organizationId };
    if (scope) where.scope = scope;
    if (scopeKey) where.scopeKey = scopeKey;
    if (userId) where.userId = userId;
    const rows = await prisma.talLockReport.findMany({
      where: where as never,
      orderBy: [{ scopeKey: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return apiOk({ locks: rows });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat lock TAL.', 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/tal/locks — sub-tahap (a): kunci plan / laporkan realisasi.
// Body: { scope, scopeKey, action: 'lock-plan' | 'report', notes?,
// rolloverDecisions?: [{taskId, action, targetDate?, targetWeekNumber?,
// targetWeekYear?, targetMonth?, targetYear?, cancelNotes?}] }
// Scope key kanonik WOORK: daily "2026-11-12", weekly "2026-W46",
// monthly "2026-11".
// ---------------------------------------------------------------------------
const SCOPES = ['daily', 'weekly', 'monthly'] as const;

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const scope = body.scope as string;
    const scopeKey = body.scopeKey as string;
    const action = body.action as string;
    if (!(SCOPES as readonly string[]).includes(scope))
      return apiErr('scope harus daily, weekly, atau monthly.', 400);
    if (!scopeKey || typeof scopeKey !== 'string') return apiErr('scopeKey wajib diisi.', 400);
    if (!['lock-plan', 'report'].includes(action))
      return apiErr('action harus lock-plan atau report.', 400);

    const s = scope as 'daily' | 'weekly' | 'monthly';
    const params = parseScopeKey(s, scopeKey);
    const dl = await scopeDeadlines(ctx.organizationId, ctx.userId, s, params);
    const existing = await prisma.talLockReport.findFirst({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, scope, scopeKey },
    });
    const existingPayload = ((existing?.payload ?? {}) as Record<string, any>) ?? {};
    const now = new Date();

    if (action === 'lock-plan') {
      if (existing?.isPlanLocked) return apiOk({ lock: mapLockReport(existing) });
      const planScore = dl.planScore(now);
      const tasks = await prisma.talTask.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          type: scope,
          ...taskPeriodWhere(s, params),
        },
      });
      const payload = {
        ...existingPayload,
        lockedBy: ctx.name,
        lockNotes: typeof body.notes === 'string' ? body.notes : existingPayload.lockNotes,
        taskCount: tasks.length,
        planScore,
        planDeadlineAt: dl.planDeadlineAt?.toISOString() ?? null,
        infoTglTask: scopeKey,
        ...params,
      };
      const saved = existing
        ? await prisma.talLockReport.update({
            where: { id: existing.id },
            data: { isPlanLocked: true, planLockedAt: now, payload },
          })
        : await prisma.talLockReport.create({
            data: {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              scope,
              scopeKey,
              isPlanLocked: true,
              planLockedAt: now,
              payload,
            },
          });
      return apiOk({ lock: mapLockReport(saved) });
    }

    // action === 'report'
    if (existing?.isReported) return apiOk({ lock: mapLockReport(existing) });
    const tasks = await prisma.talTask.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        type: scope,
        ...taskPeriodWhere(s, params),
      },
      orderBy: [{ orderNo: 'asc' }, { createdAt: 'asc' }],
    });
    const items = tasks.map(mapTalTask);
    const { detail, reportSummary } = buildReportSummary(s, items);
    reportSummary.notes = typeof body.notes === 'string' ? body.notes : '';

    let weeklyPlanScore: number | undefined;
    if (scope === 'daily' && params.dateStr) {
      const wi = getWeekNumberAndYear(parseDateKey(params.dateStr));
      const wLock = await prisma.talLockReport.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          scope: 'weekly',
          scopeKey: scopeKeyFor('weekly', wi),
        },
      });
      const wp = ((wLock?.payload ?? {}) as Record<string, any>).planScore;
      if (typeof wp === 'number') weeklyPlanScore = wp;
    }
    const reportScore = dl.reportScore(now, weeklyPlanScore);
    const planScore =
      typeof existingPayload.planScore === 'number'
        ? existingPayload.planScore
        : dl.planScore(existing?.planLockedAt ?? now);

    const decisions = Array.isArray(body.rolloverDecisions) ? body.rolloverDecisions : [];
    const roll = await applyRolloverDecisions(ctx, s, scopeKey, decisions);

    const payload = {
      ...existingPayload,
      reportedBy: ctx.name,
      reportNotes: typeof body.notes === 'string' ? body.notes : existingPayload.reportNotes,
      taskCount: existingPayload.taskCount ?? tasks.length,
      planScore,
      planDeadlineAt: dl.planDeadlineAt?.toISOString() ?? existingPayload.planDeadlineAt ?? null,
      progressScore: detail.scorePercent,
      reportScore,
      reportDeadlineAt: dl.reportDeadlineAt?.toISOString() ?? null,
      totalTaskCount: detail.totalTasks,
      mainTaskCount: detail.totalMain,
      additionalTaskCount: detail.totalAdditional,
      doneTaskCount: detail.totalDone,
      pendingTaskCount: detail.totalPending,
      scorePercent: detail.scorePercent,
      mainDoneCount: detail.mainDone,
      mainPendingCount: detail.mainPending,
      additionalDoneCount: detail.additionalDone,
      additionalPendingCount: detail.additionalPending,
      reportSummary,
      rollover: roll,
      infoTglTask: scopeKey,
      ...params,
    };
    const saved = existing
      ? await prisma.talLockReport.update({
          where: { id: existing.id },
          data: {
            isPlanLocked: true,
            planLockedAt: existing.planLockedAt ?? now,
            isReported: true,
            reportedAt: now,
            payload,
          },
        })
      : await prisma.talLockReport.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            scope,
            scopeKey,
            isPlanLocked: true,
            planLockedAt: now,
            isReported: true,
            reportedAt: now,
            payload,
          },
        });

    await dispatchTalNotification(prisma, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      category: 'scoring',
      title: `Laporan TAL ${scopeKey} dinilai: ${detail.scorePercent}%`,
      body: `Skor realisasi ${detail.scorePercent}% (${detail.totalDone}/${detail.totalTasks} tugas selesai). Skor laporan ${reportScore}.`,
    }).catch(() => {});

    return apiOk({ lock: mapLockReport(saved) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan kunci/laporan TAL.', 500);
  }
}
