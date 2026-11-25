// POST /api/calendar/events/[id]/duplicate — salin event.
// Salinan selalu event manual baru (tanpa recurrence, tanpa attendee),
// judul ditambah " (salinan)".
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { canSeeEvent, getViewerDepartmentId, getCreatorDepartmentIds } from '@/lib/calendar/visibility';
import { serializeEvent, loadEventForResponse } from '@/lib/calendar/serialize';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CALENDAR_CREATE', req);
    const event = await loadEventForResponse(params.id, ctx.organizationId, false);
    if (!event) return apiErr('Event tidak ditemukan.', 404);
    const viewerDepartmentId = await getViewerDepartmentId(ctx.userId, ctx.organizationId);
    const creatorDept = await getCreatorDepartmentIds(ctx.organizationId, [event.createdById]);
    const visible = canSeeEvent(
      { id: ctx.userId, departmentId: viewerDepartmentId },
      {
        createdById: event.createdById,
        visibility: event.visibility,
        attendeeIds: event.attendees.map((a) => a.userId),
      },
      creatorDept.get(event.createdById) ?? null
    );
    if (!visible) return apiErr('Event tidak ditemukan.', 404);

    const copy = await prisma.calendarEvent.create({
      data: {
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        sourceModule: null,
        sourceRecordId: null,
        title: `${event.title} (salinan)`,
        description: event.description,
        category: event.category,
        startAt: event.startAt,
        endAt: event.endAt,
        timezone: event.timezone,
        isAllDay: event.isAllDay,
        location: event.location,
        meetingLink: event.meetingLink,
        visibility: event.visibility,
        status: 'SCHEDULED',
        recurrenceRule: null,
        metadata: (event.metadata ?? {}) as object,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CALENDAR_CREATE_EVENT',
      module: 'CALENDAR',
      description: `Menduplikasi event kalender: ${event.title}`,
      ipAddress: getClientIp(req),
    });
    const full = await loadEventForResponse(copy.id, ctx.organizationId, false);
    return apiOk({ event: full ? serializeEvent(full) : null }, 201);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/events/[id]/duplicate POST]', e);
    return apiErr('Gagal menduplikasi event.', 500);
  }
}
