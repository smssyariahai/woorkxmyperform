// GET /api/calendar/upcoming — 10 event berikutnya (30 hari ke depan)
// yang bisa dilihat user. Untuk sidebar "Upcoming Events".
// Event berulang diekspansi; yang dikembalikan adalah 10 occurrence
// terdekat (induk + instance digabung, diurutkan startAt).
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  canSeeEvent,
  getViewerDepartmentId,
  getCreatorDepartmentIds,
} from '@/lib/calendar/visibility';
import { expandRecurrence } from '@/lib/calendar/recurrence';
import { serializeEvent, serializeOccurrence, loadEventsForResponse } from '@/lib/calendar/serialize';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('CALENDAR_VIEW', req);
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const events = await loadEventsForResponse(
      {
        organizationId: ctx.organizationId,
        status: 'SCHEDULED',
        AND: [
          {
            OR: [
              { endAt: { gte: now } },
              { recurrenceRule: { not: null }, startAt: { lte: horizon } },
            ],
          },
        ],
      },
      { take: 200, orderBy: { startAt: 'asc' } }
    );

    const viewerDepartmentId = await getViewerDepartmentId(ctx.userId, ctx.organizationId);
    const creatorDept = await getCreatorDepartmentIds(
      ctx.organizationId,
      events.map((e) => e.createdById)
    );
    const visible = events.filter((e) =>
      canSeeEvent(
        { id: ctx.userId, departmentId: viewerDepartmentId },
        {
          createdById: e.createdById,
          visibility: e.visibility,
          attendeeIds: e.attendees.map((a) => a.userId),
        },
        creatorDept.get(e.createdById) ?? null
      )
    );

    const parentIds = visible.filter((e) => e.recurrenceRule).map((e) => e.id);
    const exceptionStarts = new Map<string, Set<number>>();
    if (parentIds.length > 0) {
      const exceptions = await prisma.calendarEvent.findMany({
        where: { recurrenceParentId: { in: parentIds } },
        select: { recurrenceParentId: true, recurrenceOriginalStartAt: true },
      });
      for (const ex of exceptions) {
        if (!ex.recurrenceParentId || !ex.recurrenceOriginalStartAt) continue;
        const set = exceptionStarts.get(ex.recurrenceParentId) ?? new Set<number>();
        set.add(ex.recurrenceOriginalStartAt.getTime());
        exceptionStarts.set(ex.recurrenceParentId, set);
      }
    }

    const items: Array<ReturnType<typeof serializeEvent>> = [];
    for (const e of visible) {
      if (e.recurrenceRule) {
        // Occurrence di dalam 30 hari ke depan (yang sudah lewat dilewati).
        const occs = expandRecurrence(e, now, horizon, exceptionStarts.get(e.id)).filter(
          (o) => o.endAt >= now
        );
        for (const o of occs) items.push(serializeOccurrence(e, o));
        // Induknya sendiri TIDAK dimasukkan (occurrence sudah mewakili).
      } else if (e.endAt >= now) {
        items.push(serializeEvent(e));
      }
    }
    items.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return apiOk({ events: items.slice(0, 10) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/upcoming GET]', e);
    return apiErr('Gagal memuat event mendatang.', 500);
  }
}
