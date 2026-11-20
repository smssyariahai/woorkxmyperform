// Rekap KINERJA TAL semua karyawan (bukan rekrutmen) — porting
// TalRekapitulasiHr.tsx. GATE §5.2: hanya isSuperAdmin / OWNER / ADMIN.
// BUKAN permission HR_VIEW/HR_MANAGE, dan TIDAK menyentuh model HR woork.
// Filter backup 'perusahaan' DIBUANG (WOORK = satu organisasi aktif per sesi).
// Filter yang dipertahankan: cabang (UserEmployment.branch), divisi
// (Department), posisi (UserEmployment.position), level (UserEmployment.jobLevel,
// String bebas — dicocokkan persis, bukan level numerik 1-5 backup), user.
// Skor mengikuti rumus backup (calculateTalReportScore + bobot mingguan
// 40% plan / 40% realisasi / 20% report; TAL mingguan = 40% mingguan +
// 60% harian). scopeKey lock dicocokkan dua bentuk ("2026-09-07" dan
// "daily_2026-09-07") karena backup memakai keduanya.
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  talIsHrAdmin,
  talLoadOrgUsers,
  talTeamTaskOfUser,
  talReportScore,
  talDateKey,
  talWibParts,
  talDateStr,
  TAL_MONTHS_ID,
} from '@/lib/tal/team';
import { getWeeksInMonth } from '@/lib/tal/date';

export const dynamic = 'force-dynamic';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

function scopeKeysFor(scope: string, key: string): string[] {
  return [key, `${scope}_${key}`];
}

function findLock(
  locks: any[],
  scope: string,
  key: string,
  user: { id: string; email: string },
) {
  const keys = scopeKeysFor(scope, key);
  return locks.find((l) => {
    if (l.scope !== scope) return false;
    if (!keys.includes(l.scopeKey)) return false;
    if (String(l.userId || '') === user.id) return true;
    const p = (l.payload || {}) as any;
    const lEmail = String(p.userEmail || l.userEmail || '').toLowerCase();
    return !!lEmail && lEmail === user.email.toLowerCase();
  });
}

function lockScores(lock: any | undefined, fallback: { plan: number; realisasi: number; report: number }) {
  const p = (lock?.payload || {}) as any;
  const plan = lock?.isPlanLocked ? (typeof p.planScore === 'number' ? p.planScore : 100) : fallback.plan;
  const realisasi =
    lock?.isReported && typeof p.scorePercent === 'number' ? p.scorePercent : fallback.realisasi;
  const report = lock?.isReported ? (typeof p.reportScore === 'number' ? p.reportScore : 100) : fallback.report;
  return { plan, realisasi, report };
}

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    if (!talIsHrAdmin(ctx)) {
      return apiErr('Anda tidak memiliki akses melihat TAL karyawan lain.', 403);
    }
    const url = new URL(req.url);
    const period = (url.searchParams.get('period') || 'daily') as Period;
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(period)) {
      return apiErr('period tidak valid (daily | weekly | monthly | yearly).', 400);
    }
    const cabang = (url.searchParams.get('cabang') || '').trim();
    const divisi = (url.searchParams.get('divisi') || '').trim();
    const posisi = (url.searchParams.get('posisi') || '').trim();
    const level = (url.searchParams.get('level') || '').trim();
    const userId = (url.searchParams.get('userId') || '').trim();
    const startRaw = url.searchParams.get('start') || '';
    const endRaw = url.searchParams.get('end') || '';

    const users = (await talLoadOrgUsers(ctx.organizationId)).filter((u) => {
      if (!u.isActive && u.id !== ctx.userId) return false;
      if (cabang && u.cabang !== cabang) return false;
      if (divisi && u.divisi !== divisi) return false;
      if (posisi && u.posisi !== posisi) return false;
      if (level && u.jobLevel !== level) return false;
      if (userId && u.id !== userId) return false;
      return true;
    });

    const [tasks, locks, obligations] = await Promise.all([
      prisma.talTask.findMany({ where: { organizationId: ctx.organizationId } }),
      prisma.talLockReport.findMany({ where: { organizationId: ctx.organizationId } }),
      prisma.talUserObligation.findMany({ where: { organizationId: ctx.organizationId } }),
    ]);

    const oblByUser = new Map(obligations.map((o) => [o.userId, o]));
    const tasksOf = (u: { id: string; email: string }) => tasks.filter((t) => talTeamTaskOfUser(t, u));

    const userMeta = users.map((u) => ({
      id: u.id, email: u.email, nama: u.nama, divisi: u.divisi, posisi: u.posisi,
      jobLevel: u.jobLevel, cabang: u.cabang,
      obligation: oblByUser.get(u.id)
        ? { daily: oblByUser.get(u.id)!.daily, weekly: oblByUser.get(u.id)!.weekly, monthly: oblByUser.get(u.id)!.monthly }
        : null,
    }));

    // ---------------- TAB HARIAN ----------------
    if (period === 'daily') {
      const { y, m, day } = talWibParts(new Date());
      const todayWib = talDateStr(y, m, day);
      const dMin = startRaw || todayWib;
      const dMax = endRaw || dMin;
      const [lo, hi] = dMin <= dMax ? [dMin, dMax] : [dMax, dMin];
      const dates: string[] = [];
      const cur = new Date(`${lo}T00:00:00.000Z`);
      const endD = new Date(`${hi}T00:00:00.000Z`);
      while (cur <= endD && dates.length <= 366) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      const groups = dates.map((dateStr) => {
        const rows = users.map((u) => {
          const uTasks = tasksOf(u).filter((t) => t.type === 'daily' && talDateKey(t.taskDate) === dateStr);
          const done = uTasks.filter((t) => t.status === 'done').length;
          const lock = findLock(locks, 'daily', dateStr, u);
          const sc = uTasks.length ? talReportScore('daily', uTasks) : { scorePercent: 0 };
          const realisasi =
            lock?.isReported && typeof (lock.payload as any)?.scorePercent === 'number'
              ? (lock.payload as any).scorePercent
              : sc.scorePercent;
          const report = lock?.isReported ? ((lock.payload as any)?.reportScore ?? 100) : 0;
          return {
            userId: u.id, totalTasks: uTasks.length, doneTasks: done,
            realisasiScore: realisasi, reportScore: report, isReported: !!lock?.isReported,
            isPlanLocked: !!lock?.isPlanLocked,
          };
        });
        const [yy, mm, dd] = dateStr.split('-').map(Number);
        const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
        return {
          groupId: dateStr,
          label: `${dd} ${TAL_MONTHS_ID[mm - 1]} ${yy}`,
          dayName: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][dow],
          date: dateStr,
          tasksCount: tasks.filter((t) => t.type === 'daily' && talDateKey(t.taskDate) === dateStr).length,
          rows,
        };
      });
      return apiOk({ period, users: userMeta, groups });
    }

    // ---------------- TAB MINGGUAN ----------------
    if (period === 'weekly') {
      const now = new Date();
      const sY = Number(url.searchParams.get('startYear') || now.getUTCFullYear());
      const sM = Number(url.searchParams.get('startMonth') || now.getUTCMonth() + 1);
      const eY = Number(url.searchParams.get('endYear') || sY);
      const eM = Number(url.searchParams.get('endMonth') || sM);
      const months: { year: number; month: number }[] = [];
      let cy = Math.min(sY, eY);
      let cm = sY <= eY ? (sY === eY ? Math.min(sM, eM) : sM) : eM;
      const endY = Math.max(sY, eY);
      const endM = sY === eY ? Math.max(sM, eM) : (sY < eY ? eM : sM);
      while (cy < endY || (cy === endY && cm <= endM)) {
        months.push({ year: cy, month: cm });
        cm++;
        if (cm > 12) { cm = 1; cy++; }
      }
      const weekMap = new Map<string, { weekNumber: number; weekYear: number; days: string[]; month: number }>();
      for (const { year, month } of months) {
        // Konvensi minggu backup (Minggu-Sabtu, lib/tal/date.ts) — SAMA
        // dengan weekNumber/weekYear yang disimpan saat task dibuat (a).
        for (const w of getWeeksInMonth(year, month)) {
          const key = `${w.weekYear}-W${w.weekNumber}`;
          if (!weekMap.has(key)) {
            weekMap.set(key, {
              weekNumber: w.weekNumber,
              weekYear: w.weekYear,
              days: w.days.map((d) => d.dateStr),
              month,
            });
          } else {
            const ex = weekMap.get(key)!;
            for (const d of w.days.map((x) => x.dateStr)) if (!ex.days.includes(d)) ex.days.push(d);
          }
        }
      }
      const groups = [...weekMap.values()]
        .sort((a, b) => a.weekYear - b.weekYear || a.weekNumber - b.weekNumber)
        .map((w) => {
          const weekKey = `${w.weekYear}-W${w.weekNumber}`;
          const rows = users.map((u) => {
            const weeklyLock = findLock(locks, 'weekly', weekKey, u);
            const userWeeklyTasks = tasksOf(u).filter(
              (t) => t.type === 'weekly' && t.weekYear === w.weekYear && t.weekNumber === w.weekNumber,
            );
            const weeklyFallback = {
              plan: userWeeklyTasks.length > 0 ? 100 : 0,
              realisasi: userWeeklyTasks.length > 0 ? talReportScore('weekly', userWeeklyTasks).scorePercent : 0,
              report: userWeeklyTasks.length > 0 ? 100 : 0,
            };
            const s = lockScores(weeklyLock, weeklyFallback);
            const nilaiTaskMingguan = Number(((s.plan * 0.4) + (s.realisasi * 0.4) + (s.report * 0.2)).toFixed(2));

            const userDailyTasks = tasksOf(u).filter(
              (t) => t.type === 'daily' && t.taskDate && w.days.includes(talDateKey(t.taskDate)),
            );
            const dailyScores: { realisasi: number; report: number }[] = [];
            for (const dayStr of w.days) {
              const dayTasks = userDailyTasks.filter((t) => talDateKey(t.taskDate) === dayStr);
              const dayLock = findLock(locks, 'daily', dayStr, u);
              if (dayTasks.length > 0 || dayLock) {
                let dRealisasi = 0;
                if (dayLock?.isReported && typeof (dayLock.payload as any)?.scorePercent === 'number') {
                  dRealisasi = (dayLock.payload as any).scorePercent;
                } else if (dayTasks.length > 0) {
                  dRealisasi = talReportScore('daily', dayTasks).scorePercent;
                }
                let dReport = 0;
                if (dayLock?.isReported) dReport = (dayLock.payload as any)?.reportScore ?? 100;
                dailyScores.push({ realisasi: dRealisasi, report: dReport });
              }
            }
            const avgRealisasiHarian = dailyScores.length
              ? Number((dailyScores.reduce((a, x) => a + x.realisasi, 0) / dailyScores.length).toFixed(2)) : 0;
            const avgReportHarian = dailyScores.length
              ? Number((dailyScores.reduce((a, x) => a + x.report, 0) / dailyScores.length).toFixed(2)) : 0;
            const nilaiTaskHarian = Number(
              ((avgRealisasiHarian * (66.67 / 100)) + (avgReportHarian * (33.33 / 100))).toFixed(2),
            );
            const nilaiTalMingguan = Number(((nilaiTaskMingguan * 0.4) + (nilaiTaskHarian * 0.6)).toFixed(2));
            return {
              userId: u.id,
              weeklyPlanScore: s.plan, weeklyRealisasiScore: s.realisasi, weeklyReportScore: s.report,
              nilaiTaskMingguan, avgNilaiRealisasiHarian: avgRealisasiHarian,
              avgNilaiReportingHarian: avgReportHarian, nilaiTaskHarian, nilaiTalMingguan,
              tasksCount: userWeeklyTasks.length + userDailyTasks.length,
            };
          });
          const avgGroupTal = rows.length
            ? Number((rows.reduce((a, r) => a + r.nilaiTalMingguan, 0) / rows.length).toFixed(2)) : 0;
          return {
            groupId: weekKey,
            label: `Week ${w.weekNumber} (${TAL_MONTHS_ID[w.month - 1]} ${w.weekYear})`,
            weekNumber: w.weekNumber, weekYear: w.weekYear, month: w.month,
            avgGroupTal, rows,
          };
        });
      return apiOk({ period, users: userMeta, groups });
    }

    // ---------------- TAB BULANAN ----------------
    if (period === 'monthly') {
      const now = new Date();
      const sY = Number(url.searchParams.get('startYear') || now.getUTCFullYear());
      const sM = Number(url.searchParams.get('startMonth') || now.getUTCMonth() + 1);
      const eY = Number(url.searchParams.get('endYear') || sY);
      const eM = Number(url.searchParams.get('endMonth') || sM);
      const months: { year: number; month: number }[] = [];
      let cy = Math.min(sY, eY);
      let cm = sY <= eY ? (sY === eY ? Math.min(sM, eM) : sM) : eM;
      const endY = Math.max(sY, eY);
      const endM = sY === eY ? Math.max(sM, eM) : (sY < eY ? eM : sM);
      while (cy < endY || (cy === endY && cm <= endM)) {
        months.push({ year: cy, month: cm });
        cm++;
        if (cm > 12) { cm = 1; cy++; }
      }
      const groups = months.map(({ year, month }) => {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const rows = users.map((u) => {
          const monthlyLock = findLock(locks, 'monthly', monthKey, u);
          const userMonthlyTasks = tasksOf(u).filter(
            (t) => t.type === 'monthly' && t.year === year && t.month === month,
          );
          const fallback = {
            plan: userMonthlyTasks.length > 0 ? 100 : 0,
            realisasi: userMonthlyTasks.length > 0 ? talReportScore('monthly', userMonthlyTasks).scorePercent : 0,
            report: userMonthlyTasks.length > 0 ? 100 : 0,
          };
          const s = lockScores(monthlyLock, fallback);
          const nilaiTalBulanan = Number(((s.plan * 0.4) + (s.realisasi * 0.4) + (s.report * 0.2)).toFixed(2));
          const userDailyTasks = tasksOf(u).filter((t) => {
            if (t.type !== 'daily' || !t.taskDate) return false;
            const ds = talDateKey(t.taskDate);
            return ds.startsWith(`${monthKey}-`);
          });
          const doneDaily = userDailyTasks.filter((t) => t.status === 'done').length;
          return {
            userId: u.id,
            monthlyPlanScore: s.plan, monthlyRealisasiScore: s.realisasi, monthlyReportScore: s.report,
            nilaiTalBulanan,
            tasksCount: userMonthlyTasks.length,
            dailyTotal: userDailyTasks.length, dailyDone: doneDaily,
            isPlanLocked: !!monthlyLock?.isPlanLocked, isReported: !!monthlyLock?.isReported,
          };
        });
        const avgGroupTal = rows.length
          ? Number((rows.reduce((a, r) => a + r.nilaiTalBulanan, 0) / rows.length).toFixed(2)) : 0;
        return {
          groupId: monthKey,
          label: `${TAL_MONTHS_ID[month - 1]} ${year}`,
          year, month, avgGroupTal, rows,
        };
      });
      return apiOk({ period, users: userMeta, groups });
    }

    // ---------------- TAB TAHUNAN ----------------
    const sY = Number(url.searchParams.get('startYear') || new Date().getUTCFullYear());
    const eY = Number(url.searchParams.get('endYear') || sY);
    const years: number[] = [];
    for (let y = Math.min(sY, eY); y <= Math.max(sY, eY); y++) years.push(y);
    const groups = years.map((year) => {
      const rows = users.map((u) => {
        const monthlyScores: number[] = [];
        let totalTasks = 0;
        let doneTasks = 0;
        for (let mo = 1; mo <= 12; mo++) {
          const monthKey = `${year}-${String(mo).padStart(2, '0')}`;
          const lock = findLock(locks, 'monthly', monthKey, u);
          const mTasks = tasksOf(u).filter((t) => t.type === 'monthly' && t.year === year && t.month === mo);
          totalTasks += mTasks.length;
          doneTasks += mTasks.filter((t) => t.status === 'done').length;
          if (lock?.isReported && typeof (lock.payload as any)?.scorePercent === 'number') {
            monthlyScores.push((lock.payload as any).scorePercent);
          } else if (mTasks.length) {
            monthlyScores.push(talReportScore('monthly', mTasks).scorePercent);
          }
        }
        const avgMonthly = monthlyScores.length
          ? Number((monthlyScores.reduce((a, x) => a + x, 0) / monthlyScores.length).toFixed(2)) : 0;
        return { userId: u.id, avgMonthlyScore: avgMonthly, monthsWithData: monthlyScores.length, totalTasks, doneTasks };
      });
      const avgGroupTal = rows.length
        ? Number((rows.reduce((a, r) => a + r.avgMonthlyScore, 0) / rows.length).toFixed(2)) : 0;
      return { groupId: String(year), label: `Tahun ${year}`, year, avgGroupTal, rows };
    });
    return apiOk({ period, users: userMeta, groups });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat rekap HR TAL.', 500);
  }
}
