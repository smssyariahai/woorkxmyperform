// GET /api/absensi/records — daftar record absensi + ringkasan.
// Tanpa ATTENDANCE_MANAGE: hanya record sendiri (userId dipaksa = saya).
// Dengan MANAGE: bisa filter userId/departmentId (scope manager = departemen
// sendiri kecuali OWNER/ADMIN). GET ?id= untuk detail satu record.
// Ringkasan alpha hanya dihitung bila scope satu pengguna (milik sendiri
// atau userId tertentu); untuk daftar org-wide alpha ada di /dashboard.
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePermission, getUserPermissions } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { parseDateKey, parsePagination, getManageScope } from '@/lib/attendance/http';
import { getWorkdaysInRange } from '@/lib/attendance/schedule';
import { recordInclude, serializeRecords } from '@/lib/attendance/serialize';

export const dynamic = 'force-dynamic';

const STATUSES = ['PRESENT', 'LATE', 'EARLY_LEAVE', 'INCOMPLETE'];

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_VIEW', req);
    const sp = new URL(req.url).searchParams;
    const perms = await getUserPermissions(ctx);
    const canManage = perms.has('ATTENDANCE_MANAGE');

    // Detail satu record.
    const id = sp.get('id');
    if (id) {
      const row = await prisma.attendanceRecord.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: recordInclude,
      });
      if (!row) return apiErr('Record absensi tidak ditemukan.', 404);
      if (!canManage && row.userId !== ctx.userId) {
        return apiErr('Anda hanya bisa melihat absensi sendiri.', 403);
      }
      const [one] = await serializeRecords(ctx.organizationId, [row]);
      return apiOk({ record: one });
    }

    const fromKey = parseDateKey(sp.get('from'));
    const toKey = parseDateKey(sp.get('to'));
    if ((sp.get('from') && !fromKey) || (sp.get('to') && !toKey)) {
      return apiErr('Format tanggal from/to tidak valid (YYYY-MM-DD).', 400);
    }
    if (fromKey && toKey && fromKey > toKey) return apiErr('from tidak boleh lebih besar dari to.', 400);
    const status = sp.get('status');
    if (status && !STATUSES.includes(status)) return apiErr(`Status tidak valid: ${status}.`, 400);
    const { page, limit, skip } = parsePagination(sp);

    let userId = ctx.userId;
    let departmentId: string | null = null;
    if (canManage) {
      const scope = await getManageScope(ctx);
      const reqUser = sp.get('userId');
      const reqDept = sp.get('departmentId');
      if (reqUser) {
        // Pastikan user yang diminta anggota org ini (dan departemen scope).
        const m = await prisma.membership.findFirst({
          where: { organizationId: ctx.organizationId, userId: reqUser, status: 'ACTIVE' },
          select: { userId: true, departmentId: true },
        });
        if (!m) return apiErr('Pengguna tidak ditemukan di kantor ini.', 404);
        if (!scope.orgWide && scope.departmentId && m.departmentId !== scope.departmentId) {
          return apiErr('Pengguna tersebut bukan anggota departemen Anda.', 403);
        }
        userId = reqUser;
      } else if (reqDept) {
        if (!scope.orgWide && scope.departmentId && reqDept !== scope.departmentId) {
          return apiErr('Anda hanya bisa melihat departemen sendiri.', 403);
        }
        departmentId = reqDept;
        userId = '';
      } else if (!scope.orgWide && scope.departmentId) {
        departmentId = scope.departmentId;
        userId = '';
      } else {
        userId = '';
      }
    }

    // Filter departemen tidak bisa memakai relasi `user.memberships` pada
    // AttendanceRecord di tenant client — selesaikan dulu daftar anggota
    // departemen, lalu filter dengan `userId in [...]` (Lapisan F).
    let deptUserIds: string[] | null = null;
    if (departmentId) {
      const members = await prisma.membership.findMany({
        where: { organizationId: ctx.organizationId, departmentId, status: 'ACTIVE' },
        select: { userId: true },
      });
      deptUserIds = members.map((m) => m.userId);
    }
    const where: Prisma.AttendanceRecordWhereInput = {
      organizationId: ctx.organizationId,
      ...(userId ? { userId } : {}),
      ...(deptUserIds ? { userId: { in: deptUserIds } } : {}),
      ...(fromKey ? { date: { gte: new Date(`${fromKey}T00:00:00Z`) } } : {}),
      ...(toKey ? { date: { lte: new Date(`${toKey}T00:00:00Z`) } } : {}),
      ...(status ? { status } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.attendanceRecord.count({ where }),
      prisma.attendanceRecord.findMany({
        where,
        include: recordInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip,
      }),
    ]);
    const records = await serializeRecords(ctx.organizationId, rows);

    // Ringkasan untuk scope yang difilter (tanpa paginasi).
    const all = await prisma.attendanceRecord.findMany({
      where,
      select: { status: true, lateMinutes: true, earlyMinutes: true, overtimeMinutes: true, workMinutes: true, date: true },
    });
    const summary = {
      total: all.length,
      present: all.filter((r) => r.status === 'PRESENT').length,
      late: all.filter((r) => r.status === 'LATE').length,
      earlyLeave: all.filter((r) => r.status === 'EARLY_LEAVE').length,
      incomplete: all.filter((r) => r.status === 'INCOMPLETE').length,
      totalLateMinutes: all.reduce((a, r) => a + r.lateMinutes, 0),
      totalEarlyMinutes: all.reduce((a, r) => a + r.earlyMinutes, 0),
      totalOvertimeMinutes: all.reduce((a, r) => a + r.overtimeMinutes, 0),
      totalWorkMinutes: all.reduce((a, r) => a + r.workMinutes, 0),
      alpha: null as number | null,
      leaveDays: 0,
      holidayDays: 0,
    };
    if (userId && fromKey && toKey) {
      const workdays = await getWorkdaysInRange(ctx.organizationId, userId, fromKey, toKey);
      const workdayKeys = new Set(workdays.filter((w) => w.isWorkDay).map((w) => w.dateKey));
      const presentKeys = new Set(all.map((r) => r.date.toISOString().slice(0, 10)));
      let alpha = 0;
      for (const k of workdayKeys) if (!presentKeys.has(k)) alpha += 1;
      summary.alpha = alpha;
      summary.leaveDays = workdays.filter((w) => w.isOnLeave).length;
      summary.holidayDays = workdays.filter((w) => w.isHoliday).length;
    }

    return apiOk({ records, total, page, limit, summary });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/records GET]', e);
    return apiErr('Gagal memuat record absensi.', 500);
  }
}
