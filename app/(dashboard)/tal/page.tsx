// app/(dashboard)/tal/page.tsx — Hub TAL (Dashboard To Achieve List).
// Porting src/pages/TalMain.tsx (backup MyPerform, 810 baris) ke WOORK,
// dengan komponen dashboard/* + komponen tal/* bersama yang di-port terpisah.
// Perubahan vs backup:
// - Auth backup (useAuth/Firebase) -> session NextAuth + API /api/tal/*;
//   data sudah session-scoped server-side, jadi tidak ada pengambilan
//   user/email manual.
// - fetchAllTasksForAdmin/fetchAllLocksReportsForAdmin (admin) TIDAK dipakai:
//   hub hanya menampilkan TAL milik sendiri (Wave 4 §5.1).
// - evaluateUserGamification (talGamificationService) TIDAK diimpor ke client
//   (lib/tal/gamification.ts server-only, memakai Prisma) -> gamifikasi
//   diambil dari GET /api/tal/gamification?year= dan katalog badge dari
//   GET /api/tal/badges?year= (unwrap body.data ?? body).
// - Kewajiban harian/mingguan/bulanan dari GET /api/tal/obligations?mine=1
//   (fetchMyObligation), bukan dari level/posisi userData backup.
// - Cuti user diambil dari GET /api/tal/cuti dan dipakai dalam hitung
//   deadline (backup memakai fetchTalCuti).
// - navigate (react-router-dom) -> router.push (next/navigation); Link ->
//   next/link. Pemilih tahun di header mengganti musim gamifikasi
//   (seasonYear); metrik & tugas tetap memakai tahun kalender berjalan.
// - TalDashboardQuickActions dirender di hub (di backup komponen ini ada
//   tapi tidak dipakai TalMain); "Terapkan Template" mengarah ke
//   /tal/templates, kartu chip template dari implementasi WOORK sebelumnya
//   dipertahankan di kolom kiri.
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Target, RefreshCw, ArrowRight } from 'lucide-react';
import {
  fetchMyLocks, fetchMyObligation, fetchTalCuti, fetchTalDeadlineSettings,
  fetchTalHolidays, fetchTalRoutineTemplates, fetchTalTasks,
} from '@/lib/tal/client';
import type { TalCutiItem } from '@/lib/tal/client';
import type {
  TalDeadlineSettings, TalHolidayItem, TalRoutineTemplate, TalScopeLockReport,
  TalTaskItem,
} from '@/lib/tal/types';
import type { TalBadgeDto, UserGamificationSummary } from '@/lib/tal/gamification';
import {
  calculatePlanDeadline, calculateReportDeadline, formatDateKey,
  getEndOfWeek, getStartOfWeek, getWeekNumberAndYear,
  getWeeksInMonth, INDONESIAN_MONTHS, scopeKeyFor,
  type TalDeadlineSettingsInput,
} from '@/lib/tal/date';
import { TalDashboardMetrics, type ScopeMetricData } from '@/components/tal/dashboard/TalDashboardMetrics';
import { TalDashboardAlertBanners, type TalAlertBannerItem } from '@/components/tal/dashboard/TalDashboardAlertBanners';
import { TalDashboardShortcuts } from '@/components/tal/dashboard/TalDashboardShortcuts';
import { TalDashboardQuickActions } from '@/components/tal/dashboard/TalDashboardQuickActions';
import { TalDashboardPerformanceChart, type WeekPerformanceItem } from '@/components/tal/dashboard/TalDashboardPerformanceChart';
import { TalDashboardShowcaseBadges } from '@/components/tal/dashboard/TalDashboardShowcaseBadges';
import { TalDashboardMiniCalendar, type DayStatusMap } from '@/components/tal/dashboard/TalDashboardMiniCalendar';
import { TalDashboardGuideCard } from '@/components/tal/dashboard/TalDashboardGuideCard';
import { TalHeatmapStreak } from '@/components/tal/TalHeatmapStreak';
import TalApplyTemplateModal from '@/components/tal/TalApplyTemplateModal';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof json.message === 'string' ? json.message : `Gagal memuat data (${res.status}).`;
    throw new Error(msg);
  }
  return (json.data ?? json) as T;
}

export default function TalHubPage() {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => formatDateKey(today), [today]);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const { weekNumber: currentWeekNumber, weekYear: currentWeekYear } = useMemo(
    () => getWeekNumberAndYear(today),
    [today]
  );

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<UserGamificationSummary | null>(null);
  const [badges, setBadges] = useState<TalBadgeDto[]>([]);
  const [tasks, setTasks] = useState<TalTaskItem[]>([]);
  const [locks, setLocks] = useState<TalScopeLockReport[]>([]);
  const [holidays, setHolidays] = useState<TalHolidayItem[]>([]);
  const [deadlineSettings, setDeadlineSettings] = useState<TalDeadlineSettings | null>(null);
  const [obligation, setObligation] = useState({ daily: true, weekly: true, monthly: true });
  const [cutiRecords, setCutiRecords] = useState<TalCutiItem[]>([]);
  const [templates, setTemplates] = useState<TalRoutineTemplate[]>([]);
  const [selectedPerformanceMonth, setSelectedPerformanceMonth] = useState(currentMonth);
  const [seasonYear, setSeasonYear] = useState(currentYear);
  const [applyTemplate, setApplyTemplate] = useState<TalRoutineTemplate | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [daily, weekly, monthly, allLocks, hols, dl, obl, tmpls, cutis] = await Promise.all([
        fetchTalTasks({ type: 'daily', year: currentYear }),
        fetchTalTasks({ type: 'weekly', year: currentYear }),
        fetchTalTasks({ type: 'monthly', year: currentYear }),
        fetchMyLocks({}),
        fetchTalHolidays(),
        fetchTalDeadlineSettings(),
        fetchMyObligation(),
        fetchTalRoutineTemplates(),
        fetchTalCuti({ month: currentMonth, year: currentYear }),
      ]);
      setTasks([...daily, ...weekly, ...monthly]);
      setLocks(allLocks);
      setHolidays(hols);
      setDeadlineSettings(dl);
      setObligation({ daily: obl.daily, weekly: obl.weekly, monthly: obl.monthly });
      setTemplates(tmpls);
      setCutiRecords(cutis);
    } catch (e: any) {
      setLoadError(e?.message ?? 'Gagal memuat data TAL. Pastikan migrasi 20261112133613_add_tal_models sudah di-apply ke database.');
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth]);

  const loadGamification = useCallback(async (year: number) => {
    try {
      const [{ summary: s }, { badges: b }] = await Promise.all([
        fetchJson<{ summary: UserGamificationSummary }>(`/api/tal/gamification?year=${year}`),
        fetchJson<{ badges: TalBadgeDto[] }>(`/api/tal/badges?year=${year}`),
      ]);
      setSummary(s);
      setBadges(b ?? []);
    } catch (e) {
      // Gamifikasi gagal -> heatmap & showcase badge disembunyikan (placeholder),
      // dashboard inti tetap jalan.
      console.warn('Gagal memuat gamifikasi TAL:', e);
      setSummary(null);
      setBadges([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadGamification(seasonYear);
  }, [seasonYear, loadGamification]);

  const findLock = useCallback(
    (scope: 'daily' | 'weekly' | 'monthly', scopeKey: string) =>
      locks.find((l) => l.scope === scope && l.scopeKey === scopeKey),
    [locks]
  );

  // --------------------------------------------------------------------------
  // 1. COMPUTE SCOPE METRICS (Hari Ini, Minggu Ini, Bulan Ini)
  // --------------------------------------------------------------------------
  const metricsData = useMemo(() => {
    const mk = (list: TalTaskItem[], lock: TalScopeLockReport | undefined, lateCheck?: boolean): ScopeMetricData => {
      const done = list.filter((t) => t.status === 'done').length;
      const pending = list.filter((t) => t.status === 'pending').length;
      let reportStatus: ScopeMetricData['reportStatus'] = 'not_reported';
      let label = 'Belum Laporkan';
      if (lock?.isReported) {
        reportStatus = 'reported';
        label = 'Sudah Laporkan';
      } else if (lateCheck) {
        reportStatus = 'late';
        label = 'Terlambat Laporkan';
      }
      return { total: list.length, done, pending, reportStatus, reportStatusLabel: label, isPlanLocked: !!lock?.isPlanLocked };
    };
    const dailyTasks = tasks.filter((t) => t.type === 'daily' && t.date === todayStr);
    const weeklyTasks = tasks.filter((t) => t.type === 'weekly' && t.weekNumber === currentWeekNumber && t.weekYear === currentWeekYear);
    const monthlyTasks = tasks.filter((t) => t.type === 'monthly' && t.month === currentMonth && t.year === currentYear);
    const dailyLock = findLock('daily', scopeKeyFor('daily', { dateStr: todayStr }));
    const weeklyLock = findLock('weekly', scopeKeyFor('weekly', { weekNumber: currentWeekNumber, weekYear: currentWeekYear }));
    const monthlyLock = findLock('monthly', scopeKeyFor('monthly', { month: currentMonth, year: currentYear }));
    const now = new Date();
    return {
      daily: {
        ...mk(dailyTasks, dailyLock, now.getHours() >= 23 && now.getMinutes() >= 59),
        // Rencana harian mengikuti kunci rencana mingguan (backup).
        isPlanLocked: !!dailyLock?.isPlanLocked || !!weeklyLock?.isPlanLocked,
      },
      weekly: mk(weeklyTasks, weeklyLock, today > getEndOfWeek(today)),
      monthly: mk(monthlyTasks, monthlyLock, false),
      isDailyReported: !!dailyLock?.isReported,
    };
  }, [tasks, locks, todayStr, currentWeekNumber, currentWeekYear, currentMonth, currentYear, today, findLock]);

  const isMonthlyRequired = obligation.monthly;

  // --------------------------------------------------------------------------
  // 2. DEADLINE COUNTDOWNS & ALERTS (Module 5)
  // --------------------------------------------------------------------------
  const deadlineAlerts = useMemo(() => {
    const effectiveSettings: TalDeadlineSettingsInput = {
      planLockWeeklyDays: deadlineSettings?.planLockWeeklyDays ?? 2,
      planLockWeeklyTime: deadlineSettings?.planLockWeeklyTime || '23:59',
      planLockMonthlyDays: deadlineSettings?.planLockMonthlyDays ?? 3,
      planLockMonthlyTime: deadlineSettings?.planLockMonthlyTime || '23:59',
      reportDailyDays: deadlineSettings?.reportDailyDays ?? 1,
      reportDailyTime: deadlineSettings?.reportDailyTime || '23:59',
      reportWeeklyDays: deadlineSettings?.reportWeeklyDays ?? 2,
      reportWeeklyTime: deadlineSettings?.reportWeeklyTime || '23:59',
      reportMonthlyDays: deadlineSettings?.reportMonthlyDays ?? 3,
      reportMonthlyTime: deadlineSettings?.reportMonthlyTime || '23:59',
    };

    const list: TalAlertBannerItem[] = [];
    const nowTime = today.getTime();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    const dateOfMonth = today.getDate();
    const lastDateOfMonth = new Date(currentYear, currentMonth, 0).getDate();

    // 1. REPORT HARIAN — muncul hanya bila belum reported.
    if (!metricsData.isDailyReported) {
      const calculatedDailyDeadline = calculateReportDeadline('daily', { dateStr: todayStr }, effectiveSettings, holidays, cutiRecords);
      const targetTime = calculatedDailyDeadline || (() => {
        const d = new Date(today);
        const [h, m] = (effectiveSettings.reportDailyTime || '23:59').split(':').map(Number);
        d.setHours(h || 23, m !== undefined ? m : 59, 59, 999);
        return d;
      })();

      list.push({
        id: 'daily_report',
        scope: 'daily',
        type: 'report',
        label: 'Batas Laporan Harian Hari Ini',
        targetTime,
        isPassed: nowTime > targetTime.getTime(),
        actionText: 'Lapor',
        onAction: () => router.push(`/tal/tasks?type=daily&date=${todayStr}`)
      });
    }

    // 2. LOCK PLAN MINGGUAN — muncul pas hari Sabtu sampai batas lock bila belum di-lock.
    if (!metricsData.weekly.isPlanLocked) {
      const calculatedWeeklyPlanDeadline = calculatePlanDeadline('weekly', { weekYear: currentWeekYear, weekNumber: currentWeekNumber }, effectiveSettings, holidays, cutiRecords);
      const targetTime = calculatedWeeklyPlanDeadline || (() => {
        const sunday = getStartOfWeek(today);
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + effectiveSettings.planLockWeeklyDays);
        const [h, m] = (effectiveSettings.planLockWeeklyTime || '23:59').split(':').map(Number);
        d.setHours(h || 23, m !== undefined ? m : 59, 59, 999);
        return d;
      })();

      const isPastSaturday = dayOfWeek === 6 || dayOfWeek === 0;
      const isBeforeOrAtDeadline = nowTime <= targetTime.getTime() || dayOfWeek <= (effectiveSettings.planLockWeeklyDays + 1);
      if (isPastSaturday || isBeforeOrAtDeadline) {
        list.push({
          id: 'weekly_plan',
          scope: 'weekly',
          type: 'plan',
          label: `Kunci Rencana Pekan W-${currentWeekNumber}`,
          targetTime,
          isPassed: nowTime > targetTime.getTime(),
          actionText: 'Kunci',
          onAction: () => router.push(`/tal/tasks?type=weekly&week=${currentWeekNumber}&year=${currentWeekYear}`)
        });
      }
    }

    // 3. REPORT MINGGUAN — muncul hanya bila <= 2 hari lagi (atau sudah lewat) & belum dilaporkan.
    if (metricsData.weekly.reportStatus !== 'reported') {
      const calculatedWeeklyReportDeadline = calculateReportDeadline('weekly', { weekYear: currentWeekYear, weekNumber: currentWeekNumber }, effectiveSettings, holidays, cutiRecords);
      const targetTime = calculatedWeeklyReportDeadline || (() => {
        const sunday = getStartOfWeek(today);
        const saturday = new Date(sunday);
        saturday.setDate(sunday.getDate() + 6);
        const d = new Date(saturday);
        d.setDate(saturday.getDate() + effectiveSettings.reportWeeklyDays);
        const [h, m] = (effectiveSettings.reportWeeklyTime || '23:59').split(':').map(Number);
        d.setHours(h || 23, m !== undefined ? m : 59, 59, 999);
        return d;
      })();

      const diffMs = targetTime.getTime() - nowTime;
      if (diffMs <= 2 * 24 * 60 * 60 * 1000) {
        list.push({
          id: 'weekly_report',
          scope: 'weekly',
          type: 'report',
          label: `Laporan Mingguan Pekan W-${currentWeekNumber}`,
          targetTime,
          isPassed: nowTime > targetTime.getTime(),
          actionText: 'Lapor',
          onAction: () => router.push(`/tal/tasks?type=weekly&week=${currentWeekNumber}&year=${currentWeekYear}`)
        });
      }
    }

    // 4. PLAN BULANAN — hanya bila user wajib isi bulanan; muncul 3 hari sebelum
    // awal bulan sampai deadline lock bila belum di-lock.
    if (isMonthlyRequired && !metricsData.monthly.isPlanLocked) {
      const calculatedMonthlyPlanDeadline = calculatePlanDeadline('monthly', { year: currentYear, month: currentMonth }, effectiveSettings, holidays, cutiRecords);
      const targetTime = calculatedMonthlyPlanDeadline || (() => {
        const d = new Date(currentYear, currentMonth - 1, 1);
        d.setDate(1 + effectiveSettings.planLockMonthlyDays);
        const [h, m] = (effectiveSettings.planLockMonthlyTime || '23:59').split(':').map(Number);
        d.setHours(h || 23, m !== undefined ? m : 59, 59, 999);
        return d;
      })();

      const daysUntilEndOfMonth = lastDateOfMonth - dateOfMonth;
      const is3DaysBeforeNewMonth = daysUntilEndOfMonth <= 3;
      const isEarlyInMonth = dateOfMonth <= 10 || nowTime <= targetTime.getTime();

      if (is3DaysBeforeNewMonth || isEarlyInMonth) {
        list.push({
          id: 'monthly_plan',
          scope: 'monthly',
          type: 'plan',
          label: `Kunci Rencana Bulanan (${INDONESIAN_MONTHS[currentMonth - 1]})`,
          targetTime,
          isPassed: nowTime > targetTime.getTime(),
          actionText: 'Kunci',
          onAction: () => router.push(`/tal/tasks?type=monthly&month=${currentMonth}&year=${currentYear}`)
        });
      }
    }

    // 5. REPORT BULANAN — hanya bila wajib bulanan; muncul bila <= 3 hari lagi & belum dilaporkan.
    if (isMonthlyRequired && metricsData.monthly.reportStatus !== 'reported') {
      const calculatedMonthlyReportDeadline = calculateReportDeadline('monthly', { year: currentYear, month: currentMonth }, effectiveSettings, holidays, cutiRecords);
      const targetTime = calculatedMonthlyReportDeadline || (() => {
        const d = new Date(currentYear, currentMonth, 0); // Last day of month
        d.setDate(d.getDate() + effectiveSettings.reportMonthlyDays);
        const [h, m] = (effectiveSettings.reportMonthlyTime || '23:59').split(':').map(Number);
        d.setHours(h || 23, m !== undefined ? m : 59, 59, 999);
        return d;
      })();

      const diffMs = targetTime.getTime() - nowTime;
      if (diffMs <= 3 * 24 * 60 * 60 * 1000) {
        list.push({
          id: 'monthly_report',
          scope: 'monthly',
          type: 'report',
          label: `Laporan Bulanan (${INDONESIAN_MONTHS[currentMonth - 1]})`,
          targetTime,
          isPassed: nowTime > targetTime.getTime(),
          actionText: 'Lapor',
          onAction: () => router.push(`/tal/tasks?type=monthly&month=${currentMonth}&year=${currentYear}`)
        });
      }
    }

    return list;
  }, [
    deadlineSettings,
    today,
    currentYear,
    currentMonth,
    currentWeekNumber,
    currentWeekYear,
    todayStr,
    metricsData,
    isMonthlyRequired,
    holidays,
    cutiRecords,
    router
  ]);

  // --------------------------------------------------------------------------
  // 3. PERFORMANCE TREND CHART DATA (Module 6)
  // --------------------------------------------------------------------------
  const performanceTrends = useMemo(() => {
    const weeksInMonth = getWeeksInMonth(currentYear, selectedPerformanceMonth);
    const trends: WeekPerformanceItem[] = [];
    const weeklyScoresInMonth: number[] = [];

    weeksInMonth.forEach(w => {
      const wKey = scopeKeyFor('weekly', { weekNumber: w.weekNumber, weekYear: w.weekYear });
      const lr = locks.find(l => l.scope === 'weekly' && l.scopeKey === wKey);
      const wTasks = tasks.filter(t => t.type === 'weekly' && t.weekNumber === w.weekNumber && (t.weekYear === w.weekYear || !t.weekYear));

      // Weekly task calculation (Plan 40% + Realisasi 40% + Report 20%)
      const wPlanScore = lr?.isPlanLocked ? (lr.planScore ?? 100) : (wTasks.length > 0 ? 100 : 0);
      let wRealisasiScore = 0;
      if (lr?.isReported && typeof lr.scorePercent === 'number') {
        wRealisasiScore = lr.scorePercent;
      } else if (wTasks.length > 0) {
        const done = wTasks.filter(t => t.status === 'done').length;
        wRealisasiScore = Math.round((done / wTasks.length) * 100);
      }
      const wReportScore = lr?.isReported ? (lr.reportScore ?? 100) : 0;
      const wNilaiTaskMingguan = (wPlanScore * 0.4) + (wRealisasiScore * 0.4) + (wReportScore * 0.2);

      // Daily tasks inside this week
      const weekDateStrings = new Set(w.days.map(d => d.dateStr));
      const dailyTasksInWeek = tasks.filter(t => t.type === 'daily' && t.date && weekDateStrings.has(t.date));
      const dailyScores: { realisasi: number; report: number }[] = [];

      w.days.forEach(day => {
        const dayTasks = dailyTasksInWeek.filter(t => t.date === day.dateStr);
        const dayLock = locks.find(l =>
          l.scope === 'daily' && l.scopeKey === scopeKeyFor('daily', { dateStr: day.dateStr })
        );

        if (dayTasks.length > 0 || dayLock) {
          let dRealisasi = 0;
          if (dayLock?.isReported && typeof dayLock.scorePercent === 'number') {
            dRealisasi = dayLock.scorePercent;
          } else if (dayTasks.length > 0) {
            const dDone = dayTasks.filter(t => t.status === 'done').length;
            dRealisasi = Math.round((dDone / dayTasks.length) * 100);
          }
          const dReport = dayLock?.isReported ? (dayLock.reportScore ?? 100) : 0;
          dailyScores.push({ realisasi: dRealisasi, report: dReport });
        }
      });

      let avgDRealisasi = 0;
      let avgDReport = 0;
      if (dailyScores.length > 0) {
        avgDRealisasi = dailyScores.reduce((a, b) => a + b.realisasi, 0) / dailyScores.length;
        avgDReport = dailyScores.reduce((a, b) => a + b.report, 0) / dailyScores.length;
      }

      const dNilaiTaskHarian = (avgDRealisasi * (66.67 / 100)) + (avgDReport * (33.33 / 100));

      let finalWeeklyTal = 0;
      if (wTasks.length > 0 || lr) {
        finalWeeklyTal = dailyScores.length > 0
          ? (wNilaiTaskMingguan * 0.4) + (dNilaiTaskHarian * 0.6)
          : wNilaiTaskMingguan;
      } else if (dailyScores.length > 0) {
        finalWeeklyTal = dNilaiTaskHarian;
      }

      const weekScore = Math.round(finalWeeklyTal);
      if (weekScore > 0 || wTasks.length > 0 || dailyScores.length > 0) {
        weeklyScoresInMonth.push(weekScore);
      }

      trends.push({
        weekLabel: `W-${w.weekNumber}`,
        score: weekScore,
        isCurrent: w.weekNumber === currentWeekNumber && w.weekYear === currentWeekYear
      });
    });

    // 2. Average Nilai TAL Mingguan for the month
    const avgNilaiTalMingguan = weeklyScoresInMonth.length > 0
      ? Math.round((weeklyScoresInMonth.reduce((a, b) => a + b, 0) / weeklyScoresInMonth.length) * 100) / 100
      : 0;

    // 3. Monthly Tasks Score (Nilai Task Bulanan)
    const mKey = scopeKeyFor('monthly', { month: selectedPerformanceMonth, year: currentYear });
    const mLock = locks.find(l => l.scope === 'monthly' && l.scopeKey === mKey);
    const mTasks = tasks.filter(t => t.type === 'monthly' && t.month === selectedPerformanceMonth && (t.year === currentYear || !t.year));

    const mPlanScore = mLock?.isPlanLocked ? (mLock.planScore ?? 100) : (mTasks.length > 0 ? 100 : 0);
    let mRealisasiScore = 0;
    if (mLock?.isReported && typeof mLock.scorePercent === 'number') {
      mRealisasiScore = mLock.scorePercent;
    } else if (mTasks.length > 0) {
      const mDone = mTasks.filter(t => t.status === 'done').length;
      mRealisasiScore = Math.round((mDone / mTasks.length) * 100);
    }
    const mReportScore = mLock?.isReported ? (mLock.reportScore ?? 100) : 0;
    const nilaiTaskBulanan = Math.round(((mPlanScore * 0.4) + (mRealisasiScore * 0.4) + (mReportScore * 0.2)) * 100) / 100;

    // 4. Final Monthly TAL Score based on Role Formula:
    // - Struktural: (Nilai Task Bulanan × 20%) + (Avg Nilai TAL Mingguan × 80%)
    // - Staff: Avg Nilai TAL Mingguan (100% / tanpa kali 80%)
    let monthlyScore = 0;
    if (isMonthlyRequired) {
      monthlyScore = Math.round(((nilaiTaskBulanan * 0.2) + (avgNilaiTalMingguan * 0.8)));
    } else {
      monthlyScore = Math.round(avgNilaiTalMingguan);
    }

    const selMonthName = INDONESIAN_MONTHS[selectedPerformanceMonth - 1] || `Bulan ${selectedPerformanceMonth}`;

    return {
      weeklyTrends: trends,
      monthlyScore,
      monthName: selMonthName,
      scoreBreakdown: {
        nilaiTaskBulanan,
        avgNilaiTalMingguan
      }
    };
  }, [selectedPerformanceMonth, currentWeekNumber, currentWeekYear, currentYear, locks, tasks, isMonthlyRequired]);

  // --------------------------------------------------------------------------
  // 4. MINI CALENDAR DAY STATUS MAP (Module 8)
  // --------------------------------------------------------------------------
  const dayStatusMap = useMemo(() => {
    const map: DayStatusMap = {};

    locks.forEach(lr => {
      if (lr.scope === 'daily') {
        map[lr.scopeKey] = {
          isReported: !!lr.isReported,
          isLate: lr.reportScore !== undefined && lr.reportScore < 100
        };
      }
    });

    tasks.forEach(t => {
      if (t.type === 'daily' && t.date) {
        if (!map[t.date]) {
          map[t.date] = { isReported: false, hasTasks: true };
        } else {
          map[t.date].hasTasks = true;
        }
      }
    });

    return map;
  }, [locks, tasks]);

  const sortedHolidays = useMemo(
    () => [...holidays].sort((a, b) => a.date.localeCompare(b.date)),
    [holidays]
  );

  const yearOptions = useMemo(
    () => [currentYear - 2, currentYear - 1, currentYear, currentYear + 1],
    [currentYear]
  );

  return (
    <div className="w-full space-y-3 sm:space-y-4 pb-20">
      {/* 1. HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center border border-blue-400/30 shrink-0">
            <Target size={17} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white truncate">
              Dashboard To Achieve List (TAL)
            </h1>
            <p className="text-[11px] text-blue-200/80 truncate">
              Manajemen komitmen target, kedisiplinan pelaporan, dan pencapaian kinerja
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => { load(); loadGamification(seasonYear); }}
            title="Muat Ulang Data Dashboard"
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <select
            value={seasonYear}
            onChange={(e) => setSeasonYear(Number(e.target.value))}
            title="Pilih tahun musim gamifikasi"
            aria-label="Pilih Tahun"
            className="hidden sm:inline-flex text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-1 rounded-full appearance-none cursor-pointer outline-none"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y} className="text-slate-900">Tahun {y}</option>
            ))}
          </select>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{loadError}</div>
      )}

      {/* 2. NOTIFIKASI PENTING (ALERT BANNERS) (Module 5) */}
      <TalDashboardAlertBanners
        alerts={deadlineAlerts}
        upcomingHolidays={sortedHolidays}
      />

      {/* 3. RINGKASAN STATUS TASK (METRIC CARDS) (Module 1) */}
      <TalDashboardMetrics
        daily={metricsData.daily}
        weekly={metricsData.weekly}
        monthly={metricsData.monthly}
        showDaily={obligation.daily}
        showWeekly={obligation.weekly}
        showMonthly={obligation.monthly}
        onSelectScope={(scope) => {
          if (scope === 'daily') {
            router.push(`/tal/tasks?type=daily&date=${todayStr}`);
          } else if (scope === 'weekly') {
            router.push(`/tal/tasks?type=weekly&week=${currentWeekNumber}&year=${currentWeekYear}&date=${todayStr}`);
          } else if (scope === 'monthly') {
            router.push(`/tal/tasks?type=monthly&month=${currentMonth}&year=${currentYear}`);
          }
        }}
      />

      {/* 4. AKSES CEPAT DINAMIS (QUICK ACTIONS) */}
      <TalDashboardQuickActions
        isDailyReported={metricsData.isDailyReported}
        onCreateDailyPlan={() => router.push(`/tal/tasks?type=daily&date=${todayStr}`)}
        onApplyRoutineTemplate={() => router.push('/tal/templates')}
        onReportToday={() => router.push(`/tal/tasks?type=daily&date=${todayStr}`)}
        onReportWeeklyOrMonthly={() => router.push('/tal/rekapitulasi')}
      />

      {/* 5. SHORTCUT CARDS (Module 4) */}
      <TalDashboardShortcuts />

      {/* 6. DUAL COLUMN WORKSPACE: PROGRESS & HEATMAP VS CALENDAR & BADGES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        {/* LEFT COLUMN (7 Cols): Performance Chart + Consistency Heatmap */}
        <div className="lg:col-span-7 space-y-3 sm:space-y-4">
          {/* Progress Kinerja (Nilai TAL) (Module 6) */}
          <TalDashboardPerformanceChart
            weeklyTrends={performanceTrends.weeklyTrends}
            monthlyScore={performanceTrends.monthlyScore}
            monthName={performanceTrends.monthName}
            selectedMonth={selectedPerformanceMonth}
            onMonthChange={setSelectedPerformanceMonth}
            isStructural={isMonthlyRequired}
            scoreBreakdown={performanceTrends.scoreBreakdown}
          />

          {/* Consistency Heatmap & Streak (Module 2) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Konsistensi & Matriks 365 Hari
              </span>
              <span className="text-[11px] font-extrabold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                🔥 {summary?.currentStreak ?? 0} Hari Streak Aktif
              </span>
            </div>
            {summary ? (
              <TalHeatmapStreak
                heatmapData={summary.heatmapData}
                currentStreak={summary.currentStreak}
                bestStreak={summary.bestStreak}
                seasonYear={seasonYear}
              />
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-xs text-slate-500">
                Data konsistensi belum tersedia — coba muat ulang halaman.
              </div>
            )}
          </div>

          {/* Terapkan Template Rutinitas */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Terapkan Template Rutinitas</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Buat paket tugas bulanan/mingguan/harian sekaligus dari template.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {templates.slice(0, 3).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setApplyTemplate(t)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t.name}
                </button>
              ))}
              <Link href="/tal/templates" className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                Semua Template <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 Cols): Mini Calendar + Showcase Badges Widget */}
        <div className="lg:col-span-5 space-y-3 sm:space-y-4">
          {/* Mini Calendar (Module 8) */}
          <TalDashboardMiniCalendar
            holidays={holidays}
            heatmapData={summary?.heatmapData}
            dayStatusMap={dayStatusMap}
            onSelectDate={(dateKey) => {
              router.push(`/tal/tasks?type=daily&date=${dateKey}`);
            }}
            onSelectWeek={(weekNumber, weekYear, sundayKey) => {
              router.push(`/tal/tasks?type=weekly&week=${weekNumber}&year=${weekYear}&date=${sundayKey}`);
            }}
          />

          {/* Showcase Badges & Quick Progress Widget (Module 3) */}
          {summary ? (
            <TalDashboardShowcaseBadges
              summary={summary}
              seasonYear={seasonYear}
              badges={badges}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                  <Target size={15} />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-slate-900 block truncate">
                    Lencana & Prestasi Musim {seasonYear}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Data lencana belum tersedia — coba muat ulang halaman.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 7. PETUNJUK & PANDUAN SINGKAT SOP (Module 9) */}
      <TalDashboardGuideCard />

      {/* MODAL: Apply Routine Template */}
      <TalApplyTemplateModal
        isOpen={!!applyTemplate}
        template={applyTemplate}
        scopeType="daily"
        targetDateStr={todayStr}
        targetWeekNumber={currentWeekNumber}
        targetWeekYear={currentWeekYear}
        targetMonth={currentMonth}
        targetYear={currentYear}
        onClose={() => setApplyTemplate(null)}
        onSuccess={() => {
          setApplyTemplate(null);
          load();
        }}
      />
    </div>
  );
}
