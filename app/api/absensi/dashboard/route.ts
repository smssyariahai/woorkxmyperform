// GET /api/absensi/dashboard — ringkasan HRD (ATTENDANCE_MANAGE).
// ?date= (default hari ini), ?days=7|30 (tren, default 7).
// OWNER/ADMIN: seluruh organisasi; SUPERVISOR/Manager: departemen sendiri.
// Alpha dihitung on-the-fly untuk hari kerja yang sudah lewat (tanpa record
// ABSENT palsu); hari ini memakai notYetCheckedIn.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { parseDateKey, getManageScope, todayKeyJakarta } from '@/lib/attendance/http';
import { addDaysToKey } from '@/lib/daily/helpers';
import { computeRangeStats, loadScopeMembers } from '@/lib/attendance/stats';
import { recordInclude, serializeRecords } from '@/lib/attendance/serialize';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const sp = new URL(req.url).searchParams;
    const dateKey = parseDateKey(sp.get('date')) ?? todayKeyJakarta();
    const days = Math.min(Math.max(parseInt(sp.get('days') ?? '7', 10) || 7, 1), 30);
    const fromKey = addDaysToKey(dateKey, -(days - 1));

    const scope = await getManageScope(ctx);
    const members = await loadScopeMembers(
      ctx.organizationId,
      scope.orgWide ? null : scope.departmentId
    );

    const stats = await computeRangeStats(ctx.organizationId, members, fromKey, dateKey);
    const today = stats.days.find((d) => d.date === dateKey);
    const isToday = dateKey === todayKeyJakarta();

    // Detail hari ini: yang terlambat + yang belum check out.
    const todayRecords = await prisma.attendanceRecord.findMany({
      where: {
        organizationId: ctx.organizationId,
        date: new Date(`${dateKey}T00:00:00Z`),
        ...(members.length > 0 ? { userId: { in: members.map((m) => m.userId) } } : { userId: '__none__' }),
      },
      include: recordInclude,
      orderBy: { checkInAt: 'asc' },
    });
    const serialized = await serializeRecords(ctx.organizationId, todayRecords);
    const lateToday = serialized.filter((r) => r.status === 'LATE');
    const notCheckedOut = serialized.filter((r) => r.status === 'INCOMPLETE');

    // Per departemen (hari ini): hadir/terlambat dari record; alpha/cuti
    // dari statistik 1 hari (agar konsisten dengan definisi alpha).
    const byDepartment = new Map<string, { departmentId: string | null; departmentName: string; total: number; present: number; late: number; absent: number; leave: number }>();
    for (const m of members) {
      const key = m.departmentId ?? '__none__';
      const entry = byDepartment.get(key) ?? {
        departmentId: m.departmentId,
        departmentName: m.departmentName ?? m.departmentHr ?? 'Tanpa Departemen',
        total: 0,
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
      };
      entry.total += 1;
      byDepartment.set(key, entry);
    }
    for (const rec of todayRecords) {
      const m = members.find((x) => x.userId === rec.userId);
      if (!m) continue;
      const entry = byDepartment.get(m.departmentId ?? '__none__')!;
      entry.present += 1;
      if (rec.status === 'LATE') entry.late += 1;
    }
    // Alpha/cuti per departemen dihitung dari stats per pengguna (rentang 1 hari).
    const oneDay = await computeRangeStats(ctx.organizationId, members, dateKey, dateKey);
    for (const u of oneDay.users) {
      const key = u.departmentId ?? '__none__';
      const entry = byDepartment.get(key);
      if (!entry) continue;
      entry.absent += u.absent;
      entry.leave += u.leaveDays;
    }
    // notYetCheckedIn hari ini = anggota hari kerja tanpa record & bukan cuti/libur.
    let notYetCheckedIn = 0;
    if (isToday) {
      for (const u of oneDay.users) {
        const rec = todayRecords.find((r) => r.userId === u.userId);
        if (!rec && u.workDays > 0 && u.leaveDays === 0 && u.holidayDays === 0) notYetCheckedIn += 1;
      }
    }

    // Per lokasi (check-in hari ini).
    const byLocation = new Map<string, { locationId: string | null; locationName: string; count: number }>();
    for (const r of serialized) {
      const key = r.locationId ?? '__remote__';
      const entry = byLocation.get(key) ?? {
        locationId: r.locationId,
        locationName: r.locationName ?? (r.isRemote ? 'Remote' : 'Tanpa Lokasi'),
        count: 0,
      };
      entry.count += 1;
      byLocation.set(key, entry);
    }

    return apiOk({
      date: dateKey,
      isToday,
      scope: scope.orgWide ? 'organization' : 'department',
      departmentId: scope.departmentId,
      totals: {
        activeEmployees: members.length,
        present: today?.present ?? 0,
        late: today?.late ?? 0,
        earlyLeave: today?.earlyLeave ?? 0,
        incomplete: today?.incomplete ?? 0,
        absent: today?.absent ?? 0,
        notYetCheckedIn,
        leave: today?.leave ?? 0,
        holiday: today?.holiday ?? false,
        holidayName: today?.holidayName ?? null,
        workDays: today?.workDays ?? 0,
      },
      byDepartment: [...byDepartment.values()],
      byLocation: [...byLocation.values()],
      trend: stats.days.map((d) => ({
        date: d.date,
        present: d.present,
        late: d.late,
        earlyLeave: d.earlyLeave,
        incomplete: d.incomplete,
        absent: d.absent,
        leave: d.leave,
        holiday: d.holiday,
        workDays: d.workDays,
      })),
      lateToday,
      notCheckedOut,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/dashboard GET]', e);
    return apiErr('Gagal memuat dashboard absensi.', 500);
  }
}
