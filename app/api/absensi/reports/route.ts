// GET /api/absensi/reports — laporan rekap absensi (ATTENDANCE_MANAGE).
// ?from=&to= (wajib, maks 62 hari), ?userId=&departmentId=, ?format=json|csv.
// CSV: header Indonesia, tanggal Asia/Jakarta. Alasan cuti TIDAK disertakan.
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { parseDateKey, getManageScope } from '@/lib/attendance/http';
import { computeRangeStats, loadScopeMembers } from '@/lib/attendance/stats';

export const dynamic = 'force-dynamic';

const MAX_RANGE_DAYS = 62;

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const sp = new URL(req.url).searchParams;
    const fromKey = parseDateKey(sp.get('from'));
    const toKey = parseDateKey(sp.get('to'));
    if (!fromKey || !toKey) return apiErr('Parameter from dan to wajib diisi (YYYY-MM-DD).', 400);
    if (fromKey > toKey) return apiErr('from tidak boleh lebih besar dari to.', 400);
    const days = Math.round(
      (new Date(`${toKey}T00:00:00Z`).getTime() - new Date(`${fromKey}T00:00:00Z`).getTime()) /
        (24 * 60 * 60 * 1000)
    ) + 1;
    if (days > MAX_RANGE_DAYS) return apiErr(`Rentang maksimal ${MAX_RANGE_DAYS} hari.`, 400);
    const format = sp.get('format') ?? 'json';
    if (!['json', 'csv'].includes(format)) return apiErr('Format harus json atau csv.', 400);

    const scope = await getManageScope(ctx);
    let members = await loadScopeMembers(
      ctx.organizationId,
      scope.orgWide ? null : scope.departmentId
    );
    const userId = sp.get('userId');
    const departmentId = sp.get('departmentId');
    if (userId) {
      members = members.filter((m) => m.userId === userId);
      if (members.length === 0) return apiErr('Pengguna tidak ditemukan di ruang lingkup Anda.', 404);
    } else if (departmentId) {
      if (!scope.orgWide && scope.departmentId && departmentId !== scope.departmentId) {
        return apiErr('Anda hanya bisa melihat departemen sendiri.', 403);
      }
      members = members.filter((m) => m.departmentId === departmentId);
    }

    const stats = await computeRangeStats(ctx.organizationId, members, fromKey, toKey);
    const rows = stats.users.map((u) => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      position: u.position,
      department: u.departmentName ?? u.departmentHr,
      workDays: u.workDays,
      present: u.present,
      late: u.late,
      lateMinutes: u.lateMinutes,
      earlyLeave: u.earlyLeave,
      earlyMinutes: u.earlyMinutes,
      incomplete: u.incomplete,
      overtimeMinutes: u.overtimeMinutes,
      workMinutes: u.workMinutes,
      absent: u.absent,
      leaveDays: u.leaveDays,
      holidayDays: u.holidayDays,
    }));

    if (format === 'csv') {
      const header = [
        'Nama', 'Email', 'Jabatan', 'Departemen', 'Hari Kerja', 'Hadir',
        'Terlambat (kali)', 'Total Menit Terlambat', 'Pulang Awal (kali)',
        'Total Menit Pulang Awal', 'Belum Check Out', 'Lembur (menit)',
        'Jam Kerja (menit)', 'Alpha', 'Cuti (hari)',
      ];
      const lines = [header.map(csvCell).join(',')];
      for (const r of rows) {
        lines.push(
          [
            r.name, r.email, r.position, r.department, r.workDays, r.present,
            r.late, r.lateMinutes, r.earlyLeave, r.earlyMinutes, r.incomplete,
            r.overtimeMinutes, r.workMinutes, r.absent, r.leaveDays,
          ].map(csvCell).join(',')
        );
      }
      const t = stats.totals;
      lines.push(
        [
          'TOTAL', '', '', '', t.workDays, t.present, t.late, t.lateMinutes,
          t.earlyLeave, t.earlyMinutes, t.incomplete, t.overtimeMinutes,
          t.workMinutes, t.absent, t.leaveDays,
        ].map(csvCell).join(',')
      );
      const csv = '\uFEFF' + lines.join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="laporan-absensi-${fromKey}-${toKey}.csv"`,
        },
      });
    }

    return apiOk({
      from: fromKey,
      to: toKey,
      scope: scope.orgWide ? 'organization' : 'department',
      totals: stats.totals,
      rows,
      days: stats.days,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/reports GET]', e);
    return apiErr('Gagal membuat laporan absensi.', 500);
  }
}
