// GET /api/absensi/team — siapa sedang hadir / meeting / cuti / off hari ini.
// ATTENDANCE_MANAGE; OWNER/ADMIN melihat seluruh organisasi, SUPERVISOR/
// Manager hanya departemennya. Alasan cuti TIDAK ditampilkan.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getManageScope, todayKeyJakarta } from '@/lib/attendance/http';
import { loadScopeMembers } from '@/lib/attendance/stats';
import { recordInclude, serializeRecords } from '@/lib/attendance/serialize';
import { isHoliday } from '@/lib/attendance/schedule';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const todayKey = todayKeyJakarta();
    const now = new Date();
    const scope = await getManageScope(ctx);
    const members = await loadScopeMembers(
      ctx.organizationId,
      scope.orgWide ? null : scope.departmentId
    );
    const memberIds = members.map((m) => m.userId);

    const [records, leaves, holiday, meetings] = await Promise.all([
      memberIds.length === 0
        ? Promise.resolve([])
        : prisma.attendanceRecord.findMany({
            where: {
              organizationId: ctx.organizationId,
              userId: { in: memberIds },
              date: new Date(`${todayKey}T00:00:00Z`),
            },
            include: recordInclude,
          }),
      memberIds.length === 0
        ? Promise.resolve([])
        : prisma.talCuti.findMany({
            where: {
              organizationId: ctx.organizationId,
              userId: { in: memberIds },
              cutiDate: new Date(`${todayKey}T00:00:00Z`),
            },
            select: { userId: true },
          }),
      isHoliday(ctx.organizationId, todayKey),
      prisma.meeting.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: { in: ['ONGOING', 'SCHEDULED'] },
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
        select: {
          id: true,
          title: true,
          hostId: true,
          startsAt: true,
          endsAt: true,
          participants: { select: { userId: true } },
        },
      }),
    ]);

    const serialized = await serializeRecords(ctx.organizationId, records);
    const recordByUser = new Map(serialized.map((r) => [r.userId, r]));
    const leaveSet = new Set(leaves.map((l) => l.userId));

    // userId -> meeting yang sedang berlangsung.
    const meetingByUser = new Map<string, { id: string; title: string; startsAt: string; endsAt: string | null }>();
    for (const m of meetings) {
      const info = {
        id: m.id,
        title: m.title,
        startsAt: m.startsAt.toISOString(),
        endsAt: m.endsAt?.toISOString() ?? null,
      };
      meetingByUser.set(m.hostId, info);
      for (const p of m.participants) {
        if (p.userId && !meetingByUser.has(p.userId)) meetingByUser.set(p.userId, info);
      }
    }

    const online: Array<Record<string, unknown>> = [];
    const inMeeting: Array<Record<string, unknown>> = [];
    const onLeave: Array<Record<string, unknown>> = [];
    const off: Array<Record<string, unknown>> = [];
    for (const m of members) {
      const rec = recordByUser.get(m.userId);
      const base = {
        userId: m.userId,
        name: m.name,
        email: m.email,
        position: m.position,
        department: m.departmentName ?? m.departmentHr,
      };
      if (leaveSet.has(m.userId)) {
        onLeave.push({ ...base, status: 'ON_LEAVE' });
        continue;
      }
      if (rec && rec.checkInAt && !rec.checkOutAt) {
        const meeting = meetingByUser.get(m.userId);
        if (meeting) {
          inMeeting.push({ ...base, status: 'IN_MEETING', checkInAt: rec.checkInAt, locationName: rec.locationName, meeting });
        } else {
          online.push({ ...base, status: 'ONLINE', checkInAt: rec.checkInAt, locationName: rec.locationName, shiftName: rec.shiftName });
        }
        continue;
      }
      if (rec && rec.checkOutAt) {
        off.push({ ...base, status: 'CHECKED_OUT', checkOutAt: rec.checkOutAt });
        continue;
      }
      off.push({
        ...base,
        status: holiday.isHoliday ? 'HOLIDAY' : 'NOT_CHECKED_IN',
        note: holiday.isHoliday ? holiday.name ?? 'Hari libur' : 'Belum check in',
      });
    }

    return apiOk({
      date: todayKey,
      isHoliday: holiday.isHoliday,
      holidayName: holiday.name,
      scope: scope.orgWide ? 'organization' : 'department',
      counts: { online: online.length, inMeeting: inMeeting.length, onLeave: onLeave.length, off: off.length },
      online,
      inMeeting,
      onLeave,
      off,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/team GET]', e);
    return apiErr('Gagal memuat status tim.', 500);
  }
}
