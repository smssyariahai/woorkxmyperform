// POST /api/calendar/events/[id]/rsvp — RSVP undangan event.
// Upsert CalendarAttendee untuk user yang login.
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { RSVP_STATUSES } from '@/lib/calendar/constants';
import { canSeeEvent, getViewerDepartmentId, getCreatorDepartmentIds } from '@/lib/calendar/visibility';
import { serializeEvent, loadEventForResponse } from '@/lib/calendar/serialize';

export const dynamic = 'force-dynamic';

const rsvpSchema = z.object({
  responseStatus: z
    .string()
    .refine((v) => (RSVP_STATUSES as readonly string[]).includes(v), 'responseStatus tidak valid.'),
});

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

    const isAttendee = event.attendees.some((a) => a.userId === ctx.userId);
    // RSVP diizinkan bila user adalah attendee, atau event terbuka untuk
    // seluruh kantor/tim (COMPANY/TEAM/DEPARTMENT). Event PRIVATE/CUSTOM
    // hanya bisa di-RSVP oleh attendee-nya.
    const openVisibility = ['COMPANY', 'TEAM', 'DEPARTMENT'].includes(event.visibility);
    if (!isAttendee && !openVisibility) {
      return apiErr('Anda tidak diundang ke event ini.', 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = rsvpSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data RSVP tidak valid.', 400);
    }
    await prisma.calendarAttendee.upsert({
      where: { eventId_userId: { eventId: event.id, userId: ctx.userId } },
      update: { responseStatus: parsed.data.responseStatus, respondedAt: new Date() },
      create: {
        eventId: event.id,
        userId: ctx.userId,
        responseStatus: parsed.data.responseStatus,
        respondedAt: new Date(),
      },
    });
    const full = await loadEventForResponse(event.id, ctx.organizationId, false);
    return apiOk({ event: full ? serializeEvent(full) : null });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/events/[id]/rsvp POST]', e);
    return apiErr('Gagal menyimpan RSVP.', 500);
  }
}
