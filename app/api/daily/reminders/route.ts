// GET /api/daily/reminders — pengingat saya: Notification belum dibaca
// (terbaru 10) + CalendarReminder yang jatuh tempo hari ini.
// POST /api/daily/reminders?notificationId= {action:'read'} — tandai dibaca
// (hanya milik sendiri).
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getUserTimezone, dateKeyInTz, dayBounds } from '@/lib/daily/helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const todayKey = dateKeyInTz(new Date(), tz);
    const { start, end } = dayBounds(todayKey, tz);

    const [notifications, reminders] = await Promise.all([
      prisma.notification.findMany({
        where: { organizationId: ctx.organizationId, userId: ctx.userId, isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.calendarReminder.findMany({
        where: {
          userId: ctx.userId,
          remindAt: { gte: start, lt: end },
          event: { organizationId: ctx.organizationId },
        },
        include: {
          event: { select: { id: true, title: true, startAt: true, endAt: true, category: true } },
        },
        orderBy: { remindAt: 'asc' },
        take: 20,
      }),
    ]);

    return apiOk({
      today: todayKey,
      timezone: tz,
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
      calendarReminders: reminders.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        eventTitle: r.event?.title ?? 'Event',
        eventStartAt: r.event ? new Date(r.event.startAt).toISOString() : null,
        minutesBefore: r.minutesBefore,
        remindAt: r.remindAt.toISOString(),
        deliveryStatus: r.deliveryStatus,
        sourceUrl: '/kalender',
      })),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/reminders GET]', e);
    return apiErr('Gagal memuat pengingat.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const sp = new URL(req.url).searchParams;
    const notificationId = sp.get('notificationId')?.trim();
    if (!notificationId) return apiErr('Parameter notificationId wajib diisi.', 400);
    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'read') return apiErr("Action tidak dikenal (hanya 'read').", 400);

    const row = await prisma.notification.findFirst({
      where: { id: notificationId, organizationId: ctx.organizationId, userId: ctx.userId },
    });
    if (!row) return apiErr('Notifikasi tidak ditemukan.', 404);
    const updated = await prisma.notification.update({
      where: { id: row.id },
      data: { isRead: true },
    });
    return apiOk({ id: updated.id, isRead: updated.isRead });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/reminders POST]', e);
    return apiErr('Gagal menandai pengingat.', 500);
  }
}
