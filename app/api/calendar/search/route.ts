// GET /api/calendar/search — cari event (judul/deskripsi) dalam 30 hari
// ke belakang + 90 hari ke depan. Visibilitas tetap ditegakkan.
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
    const sp = new URL(req.url).searchParams;
    const q = sp.get('q')?.trim() ?? '';
    if (q.length < 2) return apiErr('Kata kunci pencarian minimal 2 karakter.', 400);
    const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '50', 10) || 50, 1), 100);

    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const events = await loadEventsForResponse(
      {
        organizationId: ctx.organizationId,
        AND: [
          {
            OR: [
              { startAt: { lte: to }, endAt: { gte: from } },
              { recurrenceRule: { not: null }, startAt: { lte: to } },
            ],
          },
        ],
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      { take: limit, orderBy: { startAt: 'asc' } }
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

    const out = [];
    for (const e of visible) {
      out.push(serializeEvent(e));
      if (e.recurrenceRule) {
        for (const o of expandRecurrence(e, from, to, exceptionStarts.get(e.id))) {
          out.push(serializeOccurrence(e, o));
        }
      }
    }
    out.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return apiOk({ events: out.slice(0, limit), total: out.length });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/search GET]', e);
    return apiErr('Gagal mencari event.', 500);
  }
}
