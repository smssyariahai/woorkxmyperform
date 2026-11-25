// GET /api/daily/meetings — meeting berikutnya (7 hari ke depan) yang saya
// ikuti (host atau peserta). Tombol Join hanya aktif bila ada joinUrl atau
// roomName (video internal).
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getUserTimezone } from '@/lib/daily/helpers';
import { attachMeetingUsers } from '@/lib/daily/schedule';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const now = new Date();
    const until = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    // Meeting TIDAK punya relasi `host` dan MeetingParticipant TIDAK punya
    // relasi `user` di tenant client — digabung via `attachMeetingUsers`
    // (bentuk hasil sama).
    const rows = await attachMeetingUsers(
      await prisma.meeting.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: 'SCHEDULED',
          startsAt: { gte: now, lte: until },
          OR: [
            { hostId: ctx.userId },
            { participants: { some: { userId: ctx.userId } } },
          ],
        },
        include: { participants: true },
        orderBy: { startsAt: 'asc' },
        take: 50,
      })
    );

    const meetings = rows.map((m) => {
      const start = new Date(m.startsAt);
      const end = m.endsAt
        ? new Date(m.endsAt)
        : new Date(start.getTime() + 60 * 60 * 1000);
      const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      return {
        id: m.id,
        title: m.title,
        description: m.description ?? null,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        durationMinutes,
        location: m.location ?? null,
        locationType: m.locationType,
        joinUrl: m.joinUrl ?? null,
        roomName: m.roomName ?? null,
        joinActive: !!(m.joinUrl || m.roomName),
        status: m.status,
        organizer: { id: m.host.id, name: m.host.name, email: m.host.email },
        attendees: m.participants.map((p) => ({
          userId: p.userId,
          name: p.user?.name ?? p.guestName ?? null,
          email: p.user?.email ?? p.guestEmail ?? null,
          role: p.role,
          status: p.status,
        })),
        sourceUrl: `/meet/${m.id}`,
      };
    });
    return apiOk({ timezone: tz, meetings });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/meetings GET]', e);
    return apiErr('Gagal memuat meeting.', 500);
  }
}
