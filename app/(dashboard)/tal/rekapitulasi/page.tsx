// app/(dashboard)/tal/rekapitulasi/page.tsx — Rekapitulasi PRIBADI TAL.
// Porting src/pages/TalRekapitulasi.tsx backup (1.558 baris) ke WOORK.
// Rekap PRIBADI (bukan rekap tim/HR — itu /tal/rekapitulasi-hr): tab
// harian/mingguan/bulanan/tahunan, per kategori (result/non_result), target
// vs realisasi, skor, export XLSX/CSV/PDF, + heatmap streak/konsistensi.
// Adaptasi WOORK:
// - useAuth/Firebase diganti session NextAuth (useSession; client.ts sudah
//   session-scoped, tanpa userId/email di parameter fetch).
// - fetchAllLocksReportsForAdmin (backup: semua user, lalu disaring ke user
//   aktif) diganti fetchMyLocks (API WOORK sudah mengembalikan kunci milik
//   sendiri). fetchTalUserObligations diganti fetchMyObligation.
// - Scope key memakai format kanonik WOORK (lib/tal/date.ts scopeKeyFor):
//   harian "2026-11-12", mingguan "2026-W46", bulanan "2026-11" — TANPA
//   prefix daily_/weekly_/monthly_ seperti backup.
// - TalMonthlyTable / TalYearlyTable / TalPills / TalDatePicker /
//   MonthYearPicker / YearPicker milik Grup 1/2 — diimpor apa adanya.
// - Heatmap: backup TalRekapitulasi TIDAK punya heatmap; seksinya ditambah
//   dari GET /api/tal/gamification?year= (pola halaman /tal/badges) dan
//   disembunyikan bila API gagal, agar halaman tidak ikut rusak.
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  BarChart3,
  Target,
  DollarSign,
  Layers,
  ChevronDown,
  Calculator,
  Award,
  Info,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { TalTaskItem, TalTaskType, TalScopeLockReport } from '@/lib/tal/types';
import { fetchTalTasks, fetchMyLocks, fetchMyObligation } from '@/lib/tal/client';
import {
  formatCurrencyIDR,
  INDONESIAN_MONTHS,
  INDONESIAN_MONTHS_SHORT,
  formatDateKey,
  getWeeksInMonth,
  calculateTalReportScore,
  scopeKeyFor,
  type WeekDetails,
} from '@/lib/tal/date';
import { PriorityPill, StatusPill } from '@/components/tal/TalPills';
import { MonthYearPicker, type MonthYearPickerValue } from '@/components/tal/MonthYearPicker';
import { TalDatePicker } from '@/components/tal/TalDatePicker';
import { TalMonthlyTable } from '@/components/tal/TalMonthlyTable';
import { YearPicker } from '@/components/tal/YearPicker';
import { TalYearlyTable } from '@/components/tal/TalYearlyTable';
import { TalHeatmapStreak } from '@/components/tal/TalHeatmapStreak';
import type { UserGamificationSummary } from '@/lib/tal/gamification';

export interface WeeklyRekapRow {
  weekKey: string; // e.g. "2026-W37"
  weekNumber: number;
  weekYear: number;
  month: number;
  monthName: string; // e.g. "September"
  label: string; // e.g. "Week 37"

  // Weekly task metrics
  weeklyPlanScore: number; // Nilai Planning Mingguan (100 / 50 / 0)
  weeklyRealisasiScore: number; // Nilai Realisasi Mingguan (0 - 100%)
  weeklyReportScore: number; // Nilai Report Mingguan (100 / 50 / 0)
  nilaiTaskMingguan: number; // Planning 40% + Realisasi 40% + Reporting 20%

  // Daily tasks aggregate inside this week
  avgNilaiRealisasiHarian: number; // Avg Nilai Realisasi Harian (%)
  avgNilaiReportingHarian: number; // Avg Nilai Reporting Harian (%)
  nilaiTaskHarian: number; // Realisasi 66.67% + Report 33.33%

  // Final TAL weekly score
  nilaiTalMingguan: number; // Nilai Task Mingguan 40% + Nilai Task Harian 60%

  // Raw counts for popover/details
  weeklyTasksCount: number;
  dailyTasksCount: number;
  dailyDaysWithTasks: number;
  hasWeeklyReport: boolean;
  hasWeeklyPlanLock: boolean;
}

export default function TalRekapitulasiPage() {
  const { data: session } = useSession();
  const currentUserId = ((session?.user as any)?.id as string) || '';
  const currentUserEmail = (session?.user?.email || '').toLowerCase().trim();
  const currentUserName = (session?.user?.name || '').trim();

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const todayDateKey = formatDateKey(new Date());

  const [periodType, setPeriodType] = useState<TalTaskType | 'yearly'>('daily');

  // Filter Tanggal (Awal & Akhir) for Tab Harian
  const [dailyStartDate, setDailyStartDate] = useState<string>(todayDateKey);
  const [dailyEndDate, setDailyEndDate] = useState<string>(todayDateKey);

  // Filter Bulan & Tahun (Awal & Akhir) for Tab Mingguan & Bulanan
  const [startFilter, setStartFilter] = useState<MonthYearPickerValue>({
    year: currentYear,
    month: currentMonth,
  });
  const [endFilter, setEndFilter] = useState<MonthYearPickerValue>({
    year: currentYear,
    month: currentMonth,
  });

  // Filter Tahun (Awal & Akhir) for Tab Tahunan
  const [startYearFilter, setStartYearFilter] = useState<number>(currentYear);
  const [endYearFilter, setEndYearFilter] = useState<number>(currentYear);

  const [tasks, setTasks] = useState<TalTaskItem[]>([]);
  const [dailyTasksForWeekly, setDailyTasksForWeekly] = useState<TalTaskItem[]>([]);
  const [weeklyTasksForWeekly, setWeeklyTasksForWeekly] = useState<TalTaskItem[]>([]);
  const [monthlyTasksForMonthly, setMonthlyTasksForMonthly] = useState<TalTaskItem[]>([]);
  const [isCurrentUserStructural, setIsCurrentUserStructural] = useState(true);
  const [allLocks, setAllLocks] = useState<TalScopeLockReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Heatmap streak/konsistensi (tambahan WOORK; lihat komentar header).
  const [heatmapYear, setHeatmapYear] = useState<number>(currentYear);
  const [heatmapSummary, setHeatmapSummary] = useState<UserGamificationSummary | null>(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.export-dropdown-container')) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Fetch kewajiban user (struktural = ada tugas bulanan wajib).
  useEffect(() => {
    fetchMyObligation()
      .then((obl) => setIsCurrentUserStructural(obl.monthly !== false))
      .catch(() => setIsCurrentUserStructural(true));
  }, []);

  // Fetch ringkasan gamifikasi (heatmap + streak) untuk tahun terpilih.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tal/gamification?year=${heatmapYear}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) throw new Error(typeof json.message === 'string' ? json.message : `HTTP ${res.status}`);
        return ((json.data ?? json) as { summary: UserGamificationSummary }).summary;
      })
      .then((summary) => {
        if (!cancelled) setHeatmapSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setHeatmapSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [heatmapYear]);

  // Load data when tab or filters change
  useEffect(() => {
    loadRecapData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, startFilter, endFilter, startYearFilter, endYearFilter, dailyStartDate, dailyEndDate]);

  const loadRecapData = async () => {
    setLoading(true);
    try {
      // 1. Fetch locks & reports for scores (milik sendiri, session-scoped)
      const locksData = await fetchMyLocks();
      setAllLocks(locksData);

      if (periodType === 'weekly' || periodType === 'monthly') {
        // Compute years involved in startFilter -> endFilter range
        const minYear = Math.min(startFilter.year, endFilter.year);
        const maxYear = Math.max(startFilter.year, endFilter.year);
        const yearsToFetch: number[] = [];
        for (let y = minYear; y <= maxYear; y++) {
          yearsToFetch.push(y);
        }

        // Fetch all monthly, weekly, and daily tasks for the involved years
        const monthlyPromises = yearsToFetch.map((y) => fetchTalTasks({ type: 'monthly', year: y }));
        const weeklyPromises = yearsToFetch.map((y) => fetchTalTasks({ type: 'weekly', weekYear: y }));
        const dailyPromises = yearsToFetch.map((y) => fetchTalTasks({ type: 'daily', year: y }));

        const [monthlyResults, weeklyResults, dailyResults] = await Promise.all([
          Promise.all(monthlyPromises),
          Promise.all(weeklyPromises),
          Promise.all(dailyPromises),
        ]);

        const flatMonthly = monthlyResults.flat();
        const flatWeekly = weeklyResults.flat();
        const flatDaily = dailyResults.flat();

        setMonthlyTasksForMonthly(flatMonthly);
        setWeeklyTasksForWeekly(flatWeekly);
        setDailyTasksForWeekly(flatDaily);

        if (periodType === 'weekly') {
          setTasks(flatWeekly);
        } else {
          setTasks(flatMonthly);
        }
      } else if (periodType === 'yearly') {
        // Compute years involved in startYearFilter -> endYearFilter range
        const minYear = Math.min(startYearFilter, endYearFilter);
        const maxYear = Math.max(startYearFilter, endYearFilter);
        const yearsToFetch: number[] = [];
        for (let y = minYear; y <= maxYear; y++) {
          yearsToFetch.push(y);
        }

        // Fetch all monthly, weekly, and daily tasks for the involved years
        const monthlyPromises = yearsToFetch.map((y) => fetchTalTasks({ type: 'monthly', year: y }));
        const weeklyPromises = yearsToFetch.map((y) => fetchTalTasks({ type: 'weekly', weekYear: y }));
        const dailyPromises = yearsToFetch.map((y) => fetchTalTasks({ type: 'daily', year: y }));

        const [monthlyResults, weeklyResults, dailyResults] = await Promise.all([
          Promise.all(monthlyPromises),
          Promise.all(weeklyPromises),
          Promise.all(dailyPromises),
        ]);

        const flatMonthly = monthlyResults.flat();
        const flatWeekly = weeklyResults.flat();
        const flatDaily = dailyResults.flat();

        setMonthlyTasksForMonthly(flatMonthly);
        setWeeklyTasksForWeekly(flatWeekly);
        setDailyTasksForWeekly(flatDaily);
        setTasks([...flatMonthly, ...flatWeekly, ...flatDaily]);
      } else if (periodType === 'daily') {
        // Compute years involved in dailyStartDate -> dailyEndDate
        const startY = parseInt((dailyStartDate || todayDateKey).split('-')[0], 10) || currentYear;
        const endY = parseInt((dailyEndDate || todayDateKey).split('-')[0], 10) || currentYear;
        const minYear = Math.min(startY, endY);
        const maxYear = Math.max(startY, endY);
        const yearsToFetch: number[] = [];
        for (let y = minYear; y <= maxYear; y++) {
          yearsToFetch.push(y);
        }

        const dailyPromises = yearsToFetch.map((y) => fetchTalTasks({ type: 'daily', year: y }));

        const dailyResults = await Promise.all(dailyPromises);
        const allDaily = dailyResults.flat();

        // Sort dates to ensure proper min/max comparison
        const dMin = dailyStartDate <= dailyEndDate ? dailyStartDate : dailyEndDate;
        const dMax = dailyStartDate <= dailyEndDate ? dailyEndDate : dailyStartDate;

        const filtered = allDaily.filter((t) => {
          if (!t.date) return false;
          return t.date >= dMin && t.date <= dMax;
        });

        // Sort descending or ascending by date
        filtered.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        setTasks(filtered);
      }
    } catch (e) {
      console.error('Error fetching recap data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Helper to match lock for current user (locks sudah milik sendiri).
  const findUserLock = (scope: TalTaskType, scopeKey: string) => {
    return allLocks.find((l) => {
      const lScope = l.scope || l.type;
      if (lScope !== scope) return false;
      if (l.scopeKey !== scopeKey) return false;
      return true;
    });
  };

  // Generate Weekly Rows based on startFilter & endFilter range
  const weeklyRecapRows = useMemo<WeeklyRekapRow[]>(() => {
    if (periodType !== 'weekly') return [];

    // Normalize start and end
    let startY = startFilter.year;
    let startM = startFilter.month;
    let endY = endFilter.year;
    let endM = endFilter.month;

    // If start is after end, swap them for sorting order
    if (startY > endY || (startY === endY && startM > endM)) {
      const tempY = startY;
      const tempM = startM;
      startY = endY;
      startM = endM;
      endY = tempY;
      endM = tempM;
    }

    // Collect all months in range
    const monthsInRange: { year: number; month: number }[] = [];
    let curY = startY;
    let curM = startM;
    while (curY < endY || (curY === endY && curM <= endM)) {
      monthsInRange.push({ year: curY, month: curM });
      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }

    // Collect unique weeks across these months
    const weekMap = new Map<string, { weekDetails: WeekDetails; month: number }>();
    monthsInRange.forEach(({ year, month }) => {
      const weeksInM = getWeeksInMonth(year, month);
      weeksInM.forEach((w) => {
        const key = `${w.weekYear}-W${w.weekNumber}`;
        if (!weekMap.has(key)) {
          weekMap.set(key, { weekDetails: w, month });
        }
      });
    });

    // Convert to row objects
    const rows: WeeklyRekapRow[] = [];

    weekMap.forEach(({ weekDetails, month }) => {
      const { weekNumber, weekYear, days } = weekDetails;
      const weeklyScopeKey = scopeKeyFor('weekly', { weekYear, weekNumber });
      const weeklyLock = findUserLock('weekly', weeklyScopeKey);

      // Tasks for this week
      const weeklyTasks = weeklyTasksForWeekly.filter((t) => t.weekYear === weekYear && t.weekNumber === weekNumber);

      // 1. Nilai Planning Mingguan
      // Default: If locked, planScore from lock (100 or 50). If not locked, 0.
      const weeklyPlanScore = weeklyLock?.isPlanLocked ? (weeklyLock.planScore ?? 100) : 0;

      // 2. Nilai Realisasi Mingguan
      // If reported in lock, scorePercent / progressScore. Otherwise calculated dynamically from tasks.
      let weeklyRealisasiScore = 0;
      if (weeklyLock?.isReported && typeof weeklyLock.scorePercent === 'number') {
        weeklyRealisasiScore = weeklyLock.scorePercent;
      } else if (weeklyTasks.length > 0) {
        const scoreDetail = calculateTalReportScore('weekly', weeklyTasks);
        weeklyRealisasiScore = scoreDetail.scorePercent;
      }

      // 3. Nilai Report Mingguan
      // If reported, reportScore from lock (100 or 50). Otherwise 0.
      const weeklyReportScore = weeklyLock?.isReported ? (weeklyLock.reportScore ?? 100) : 0;

      // 4. Nilai Task Mingguan = Planning 40% + Realisasi 40% + Reporting 20%
      const nilaiTaskMingguan = Number(
        (weeklyPlanScore * 0.4 + weeklyRealisasiScore * 0.4 + weeklyReportScore * 0.2).toFixed(2)
      );

      // 5. Daily tasks for days in this week (Sunday to Saturday)
      const weekDateStrings = new Set(days.map((d) => d.dateStr));
      const dailyTasksInWeek = dailyTasksForWeekly.filter((t) => t.date && weekDateStrings.has(t.date));

      // Group daily tasks by day (excluding Sunday if not used, or per working day)
      // Calculate daily realisasi and daily report scores per day
      const dailyScores: { realisasi: number; report: number }[] = [];

      days.forEach((day) => {
        // Exclude Sunday from standard KPI if no tasks and not working day
        const dayTasks = dailyTasksInWeek.filter((t) => t.date === day.dateStr);
        const dayScopeKey = scopeKeyFor('daily', { dateStr: day.dateStr });
        const dayLock = findUserLock('daily', dayScopeKey);

        if (dayTasks.length > 0 || dayLock) {
          // Realisasi harian
          let dRealisasi = 0;
          if (dayLock?.isReported && typeof dayLock.scorePercent === 'number') {
            dRealisasi = dayLock.scorePercent;
          } else if (dayTasks.length > 0) {
            const sc = calculateTalReportScore('daily', dayTasks);
            dRealisasi = sc.scorePercent;
          }

          // Report harian
          let dReport = 0;
          if (dayLock?.isReported) {
            dReport = dayLock.reportScore ?? (weeklyPlanScore === 50 ? 50 : 100);
          }

          dailyScores.push({ realisasi: dRealisasi, report: dReport });
        }
      });

      // Calculate averages for daily
      let avgNilaiRealisasiHarian = 0;
      let avgNilaiReportingHarian = 0;
      if (dailyScores.length > 0) {
        const sumRealisasi = dailyScores.reduce((acc, s) => acc + s.realisasi, 0);
        const sumReport = dailyScores.reduce((acc, s) => acc + s.report, 0);
        avgNilaiRealisasiHarian = Number((sumRealisasi / dailyScores.length).toFixed(2));
        avgNilaiReportingHarian = Number((sumReport / dailyScores.length).toFixed(2));
      }

      // 6. Nilai Task Harian = Realisasi 66.67% + Report 33.33%
      const nilaiTaskHarian = Number(
        (avgNilaiRealisasiHarian * (66.67 / 100) + avgNilaiReportingHarian * (33.33 / 100)).toFixed(2)
      );

      // 7. Nilai TAL Mingguan = Nilai Task Mingguan 40% + Nilai Task Harian 60%
      const nilaiTalMingguan = Number((nilaiTaskMingguan * 0.4 + nilaiTaskHarian * 0.6).toFixed(2));

      const monthName = INDONESIAN_MONTHS[month - 1] || `Bulan ${month}`;

      rows.push({
        weekKey: `${weekYear}-W${String(weekNumber).padStart(2, '0')}`,
        weekNumber,
        weekYear,
        month,
        monthName,
        label: `Week ${weekNumber}`,
        weeklyPlanScore,
        weeklyRealisasiScore,
        weeklyReportScore,
        nilaiTaskMingguan,
        avgNilaiRealisasiHarian,
        avgNilaiReportingHarian,
        nilaiTaskHarian,
        nilaiTalMingguan,
        weeklyTasksCount: weeklyTasks.length,
        dailyTasksCount: dailyTasksInWeek.length,
        dailyDaysWithTasks: dailyScores.length,
        hasWeeklyReport: !!weeklyLock?.isReported,
        hasWeeklyPlanLock: !!weeklyLock?.isPlanLocked,
      });
    });

    // Sort rows chronologically
    rows.sort((a, b) => {
      if (a.weekYear !== b.weekYear) return a.weekYear - b.weekYear;
      return a.weekNumber - b.weekNumber;
    });

    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, startFilter, endFilter, weeklyTasksForWeekly, dailyTasksForWeekly, allLocks]);

  // General KPI metrics computation
  const stats = useMemo(() => {
    const total = tasks.length;
    const mainTasks = tasks.filter((t) => !t.isAdditional);
    const additionalTasks = tasks.filter((t) => !!t.isAdditional);
    const mainDone = mainTasks.filter((t) => t.status === 'done').length;
    const additionalDone = additionalTasks.filter((t) => t.status === 'done').length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const onProgress = tasks.filter((t) => t.status === 'on_progress').length;
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const todo = tasks.filter((t) => t.status === 'todo').length;

    let completionRate = 0;
    if (periodType === 'daily') {
      if (mainTasks.length > 0) {
        completionRate = Math.min(100, Math.round(((mainDone + additionalDone) / mainTasks.length) * 100));
      } else if (total > 0) {
        completionRate = Math.min(100, Math.round((done / total) * 100));
      }
    } else {
      const effectiveTotalMain = mainTasks.length > 0 ? mainTasks.length : total;
      const effectiveDone = mainTasks.length > 0 ? mainDone : done;
      completionRate =
        effectiveTotalMain > 0 ? Math.min(100, Math.round((effectiveDone / effectiveTotalMain) * 100)) : 0;
    }

    // Financial & Result targets
    const resultTasks = tasks.filter((t) => t.category === 'result');
    const rupiahTasks = resultTasks.filter((t) => t.targetUnit === 'Rupiah');
    const totalTargetRp = rupiahTasks.reduce((acc, t) => acc + (t.targetValue || 0), 0);
    const totalActualRp = rupiahTasks.reduce((acc, t) => acc + (t.actualValue || 0), 0);
    const achievementRateRp = totalTargetRp > 0 ? Math.round((totalActualRp / totalTargetRp) * 100) : 0;

    const noaTasks = resultTasks.filter((t) => t.targetUnit === 'NOA');
    const totalTargetNoa = noaTasks.reduce((acc, t) => acc + (t.targetValue || 0), 0);
    const totalActualNoa = noaTasks.reduce((acc, t) => acc + (t.actualValue || 0), 0);

    const unitTasks = resultTasks.filter((t) => t.targetUnit === 'Unit');
    const totalTargetUnit = unitTasks.reduce((acc, t) => acc + (t.targetValue || 0), 0);
    const totalActualUnit = unitTasks.reduce((acc, t) => acc + (t.actualValue || 0), 0);

    // Priorities
    const highCount = tasks.filter((t) => t.priority === 'high').length;
    const mediumCount = tasks.filter((t) => t.priority === 'medium').length;
    const lowCount = tasks.filter((t) => t.priority === 'low').length;

    // Average TAL score for weekly tab
    const avgNilaiTal =
      weeklyRecapRows.length > 0
        ? Number((weeklyRecapRows.reduce((sum, r) => sum + r.nilaiTalMingguan, 0) / weeklyRecapRows.length).toFixed(2))
        : 0;

    return {
      total,
      done,
      onProgress,
      pending,
      todo,
      completionRate,
      totalTargetRp,
      totalActualRp,
      achievementRateRp,
      totalTargetNoa,
      totalActualNoa,
      totalTargetUnit,
      totalActualUnit,
      highCount,
      mediumCount,
      lowCount,
      resultCount: resultTasks.length,
      nonResultCount: tasks.length - resultTasks.length,
      avgNilaiTal,
    };
  }, [tasks, periodType, weeklyRecapRows]);

  // Score Badge Color Helper
  const getScoreBadgeClass = (score: number) => {
    if (score >= 85) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (score >= 70) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (score >= 50) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-red-50 text-red-700 border-red-200';
  };

  // Export to Excel (.xlsx)
  const handleExportXLSX = () => {
    setIsExportOpen(false);
    try {
      if (periodType === 'weekly') {
        const dataToExport = weeklyRecapRows.map((r, idx) => ({
          No: idx + 1,
          Bulan: `${r.monthName} ${r.weekYear}`,
          Week: r.label,
          'Nilai Planning Mingguan': r.weeklyPlanScore,
          'Nilai Realisasi Mingguan (%)': r.weeklyRealisasiScore,
          'Nilai Report Mingguan': r.weeklyReportScore,
          'Nilai Task Mingguan': r.nilaiTaskMingguan,
          'Avg Nilai Realisasi Harian (%)': r.avgNilaiRealisasiHarian,
          'Avg Nilai Reporting Harian': r.avgNilaiReportingHarian,
          'Nilai Task Harian': r.nilaiTaskHarian,
          'Nilai TAL Mingguan': r.nilaiTalMingguan,
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Matriks Nilai TAL');
        XLSX.writeFile(
          wb,
          `TAL_Rekapitulasi_Mingguan_${startFilter.year}_${startFilter.month}_sd_${endFilter.year}_${endFilter.month}.xlsx`
        );
      } else {
        const dataToExport = tasks.map((t, idx) => ({
          No: idx + 1,
          Tipe: t.type,
          'Periode / Tanggal':
            t.date ||
            (t.weekNumber
              ? `Week ${t.weekNumber} (${t.weekYear})`
              : `${INDONESIAN_MONTHS[(t.month || 1) - 1]} ${t.year}`),
          'Judul Tugas': t.title,
          Kategori: t.category === 'result' ? 'Result' : 'Non Result',
          Target:
            t.category === 'result'
              ? t.targetUnit === 'Rupiah'
                ? formatCurrencyIDR(t.targetValue || 0)
                : `${t.targetValue} ${t.targetUnit}`
              : '-',
          Realisasi:
            t.category === 'result'
              ? t.targetUnit === 'Rupiah'
                ? formatCurrencyIDR(t.actualValue || 0)
                : `${t.actualValue || 0} ${t.targetUnit}`
              : '-',
          Prioritas: t.priority,
          Status: t.status,
          Catatan: t.notes || '',
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Daftar Tugas');
        const fileName =
          periodType === 'daily'
            ? `TAL_Rekapitulasi_Harian_${dailyStartDate}_sd_${dailyEndDate}.xlsx`
            : `TAL_Rekapitulasi_${periodType}_${currentYear}.xlsx`;
        XLSX.writeFile(wb, fileName);
      }
    } catch (err) {
      console.error('Error exporting to Excel:', err);
    }
  };

  // Export to CSV (.csv)
  const handleExportCSV = () => {
    setIsExportOpen(false);
    try {
      let headers: string[] = [];
      let rows: (string | number)[][] = [];
      let fileName = '';

      if (periodType === 'weekly') {
        headers = [
          'No',
          'Bulan',
          'Week',
          'Nilai Planning Mingguan',
          'Nilai Realisasi Mingguan (%)',
          'Nilai Report Mingguan',
          'Nilai Task Mingguan',
          'Avg Nilai Realisasi Harian (%)',
          'Avg Nilai Reporting Harian',
          'Nilai Task Harian',
          'Nilai TAL Mingguan',
        ];

        rows = weeklyRecapRows.map((r, idx) => [
          idx + 1,
          `"${r.monthName} ${r.weekYear}"`,
          `"${r.label}"`,
          r.weeklyPlanScore,
          r.weeklyRealisasiScore,
          r.weeklyReportScore,
          r.nilaiTaskMingguan,
          r.avgNilaiRealisasiHarian,
          r.avgNilaiReportingHarian,
          r.nilaiTaskHarian,
          r.nilaiTalMingguan,
        ]);

        fileName = `TAL_Rekapitulasi_Mingguan_${startFilter.year}_${startFilter.month}_sd_${endFilter.year}_${endFilter.month}.csv`;
      } else {
        headers = ['No', 'Tipe', 'Periode / Tanggal', 'Judul Tugas', 'Kategori', 'Target', 'Realisasi', 'Prioritas', 'Status', 'Catatan'];

        rows = tasks.map((t, idx) => {
          const periode =
            t.date ||
            (t.weekNumber
              ? `Week ${t.weekNumber} (${t.weekYear})`
              : `${INDONESIAN_MONTHS[(t.month || 1) - 1]} ${t.year}`);
          const targetStr =
            t.category === 'result'
              ? t.targetUnit === 'Rupiah'
                ? formatCurrencyIDR(t.targetValue || 0)
                : `${t.targetValue} ${t.targetUnit}`
              : '-';
          const realisasiStr =
            t.category === 'result'
              ? t.targetUnit === 'Rupiah'
                ? formatCurrencyIDR(t.actualValue || 0)
                : `${t.actualValue || 0} ${t.targetUnit}`
              : '-';

          return [
            idx + 1,
            `"${t.type}"`,
            `"${periode}"`,
            `"${(t.title || '').replace(/"/g, '""')}"`,
            `"${t.category === 'result' ? 'Result' : 'Non Result'}"`,
            `"${targetStr}"`,
            `"${realisasiStr}"`,
            `"${t.priority}"`,
            `"${t.status}"`,
            `"${(t.notes || '').replace(/"/g, '""')}"`,
          ];
        });

        fileName =
          periodType === 'daily'
            ? `TAL_Rekapitulasi_Harian_${dailyStartDate}_sd_${dailyEndDate}.csv`
            : `TAL_Rekapitulasi_${periodType}_${currentYear}.csv`;
      }

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting to CSV:', err);
    }
  };

  // Export to PDF (.pdf) via print window
  const handleExportPDF = () => {
    setIsExportOpen(false);
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        window.print();
        return;
      }

      let contentHtml = '';
      const printDate = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      if (periodType === 'weekly') {
        const startLabel = `${INDONESIAN_MONTHS[startFilter.month - 1]} ${startFilter.year}`;
        const endLabel = `${INDONESIAN_MONTHS[endFilter.month - 1]} ${endFilter.year}`;

        let tableRowsHtml = '';
        weeklyRecapRows.forEach((r, idx) => {
          tableRowsHtml += `
            <tr style="border-bottom: 1px solid #cbd5e1; font-size: 11px;">
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1;">${idx + 1}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1; font-weight: bold;">${r.monthName} ${r.weekYear}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 2px solid #64748b; font-weight: bold;">${r.label}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1;">${r.weeklyPlanScore}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1; font-weight: bold;">${r.weeklyRealisasiScore}%</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1;">${r.weeklyReportScore}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 2px solid #64748b; font-weight: bold; background: #e0f2fe; color: #0369a1;">${r.nilaiTaskMingguan}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1; font-weight: bold;">${r.avgNilaiRealisasiHarian}%</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1; font-weight: bold;">${r.avgNilaiReportingHarian}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 2px solid #64748b; font-weight: bold; background: #fef3c7; color: #92400e;">${r.nilaiTaskHarian}</td>
              <td style="padding: 6px 8px; text-align: center; font-weight: bold; background: #d1fae5; color: #065f46;">${r.nilaiTalMingguan}</td>
            </tr>
          `;
        });

        contentHtml = `
          <html>
            <head>
              <title>Rekapitulasi TAL Mingguan</title>
              <style>
                @page { size: landscape; margin: 12mm; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; margin: 0; padding: 10px; }
                h1 { font-size: 16px; margin-bottom: 4px; color: #1e293b; }
                p.meta { font-size: 11px; color: #64748b; margin-top: 0; margin-bottom: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                th { background-color: #f1f5f9; color: #334155; font-size: 10px; text-transform: uppercase; padding: 8px 6px; border-bottom: 2px solid #94a3b8; }
                .footer { margin-top: 16px; font-size: 10px; color: #94a3b8; text-align: right; }
              </style>
            </head>
            <body>
              <h1>TAL: Rekapitulasi Matriks Nilai Task Mingguan & Harian</h1>
              <p class="meta">Karyawan: <strong>${currentUserName || currentUserEmail}</strong> | Rentang Periode: <strong>${startLabel} s/d ${endLabel}</strong> (${weeklyRecapRows.length} Pekan) | Dicetak: ${printDate}</p>
              <table>
                <thead>
                  <tr>
                    <th rowspan="2" style="border-right: 1px solid #cbd5e1;">No</th>
                    <th rowspan="2" style="border-right: 1px solid #cbd5e1;">Bulan</th>
                    <th rowspan="2" style="border-right: 2px solid #64748b;">Week</th>
                    <th colspan="4" style="border-right: 2px solid #64748b; background: #dbeafe; color: #1e3a8a;">Evaluasi Task Mingguan (Bobot 40%)</th>
                    <th colspan="3" style="border-right: 2px solid #64748b; background: #f3e8ff; color: #581c87;">Evaluasi Task Harian (Bobot 60%)</th>
                    <th rowspan="2" style="background: #d1fae5; color: #064e3b;">Nilai TAL Mingguan</th>
                  </tr>
                  <tr>
                    <th style="border-right: 1px solid #cbd5e1; background: #eff6ff;">Plan</th>
                    <th style="border-right: 1px solid #cbd5e1; background: #eff6ff;">Realisasi</th>
                    <th style="border-right: 1px solid #cbd5e1; background: #eff6ff;">Report</th>
                    <th style="border-right: 2px solid #64748b; background: #dbeafe; color: #1e3a8a;">Nilai Mingguan</th>
                    <th style="border-right: 1px solid #cbd5e1; background: #faf5ff;">Avg Realisasi</th>
                    <th style="border-right: 1px solid #cbd5e1; background: #faf5ff;">Avg Report</th>
                    <th style="border-right: 2px solid #64748b; background: #f3e8ff; color: #581c87;">Nilai Harian</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
              <div class="footer">Sistem Evaluasi TAL • Dokumen Resmi</div>
              <script>
                window.onload = function() {
                  window.print();
                };
              </script>
            </body>
          </html>
        `;
      } else {
        let tableRowsHtml = '';
        tasks.forEach((t, idx) => {
          const periode =
            t.date ||
            (t.weekNumber
              ? `Week ${t.weekNumber} (${t.weekYear})`
              : `${INDONESIAN_MONTHS[(t.month || 1) - 1]} ${t.year}`);
          const targetStr =
            t.category === 'result'
              ? t.targetUnit === 'Rupiah'
                ? formatCurrencyIDR(t.targetValue || 0)
                : `${t.targetValue} ${t.targetUnit}`
              : '-';
          const realisasiStr =
            t.category === 'result'
              ? t.targetUnit === 'Rupiah'
                ? formatCurrencyIDR(t.actualValue || 0)
                : `${t.actualValue || 0} ${t.targetUnit}`
              : '-';

          tableRowsHtml += `
            <tr style="border-bottom: 1px solid #cbd5e1; font-size: 11px;">
              <td style="padding: 6px 8px; text-align: center;">${idx + 1}</td>
              <td style="padding: 6px 8px; font-weight: bold;">[${t.type}] ${periode}</td>
              <td style="padding: 6px 8px;">${t.title}</td>
              <td style="padding: 6px 8px; text-align: center;">${t.category === 'result' ? 'Result' : 'Non Result'}</td>
              <td style="padding: 6px 8px; text-align: center;">${targetStr} &rarr; <strong>${realisasiStr}</strong></td>
              <td style="padding: 6px 8px; text-align: center;">${t.priority}</td>
              <td style="padding: 6px 8px; text-align: center;">${t.status}</td>
            </tr>
          `;
        });

        contentHtml = `
          <html>
            <head>
              <title>Daftar Tugas TAL</title>
              <style>
                @page { size: portrait; margin: 12mm; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; margin: 0; padding: 10px; }
                h1 { font-size: 16px; margin-bottom: 4px; color: #1e293b; }
                p.meta { font-size: 11px; color: #64748b; margin-top: 0; margin-bottom: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                th { background-color: #f1f5f9; color: #334155; font-size: 10px; text-transform: uppercase; padding: 8px 6px; border-bottom: 2px solid #94a3b8; }
                .footer { margin-top: 16px; font-size: 10px; color: #94a3b8; text-align: right; }
              </style>
            </head>
            <body>
              <h1>TAL: Daftar Rincian Tugas & Evaluasi</h1>
              <p class="meta">Karyawan: <strong>${currentUserName || currentUserEmail}</strong> | Tipe: <strong>${periodType.toUpperCase()}</strong> | Dicetak: ${printDate}</p>
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Periode</th>
                    <th>Judul Tugas</th>
                    <th>Kategori</th>
                    <th>Target vs Realisasi</th>
                    <th>Prioritas</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
              <div class="footer">Sistem Evaluasi TAL • Dokumen Resmi</div>
              <script>
                window.onload = function() {
                  window.print();
                };
              </script>
            </body>
          </html>
        `;
      }

      printWindow.document.open();
      printWindow.document.write(contentHtml);
      printWindow.document.close();
    } catch (err) {
      console.error('Error exporting to PDF:', err);
    }
  };

  const exportDropdown = (
    <div className="relative export-dropdown-container">
      <button
        type="button"
        onClick={() => setIsExportOpen(!isExportOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition active:scale-95"
      >
        <Download size={14} className="text-slate-600" />
        <span>Export</span>
        <ChevronDown size={13} className={`text-slate-400 transition-transform duration-200 ${isExportOpen ? 'rotate-180' : ''}`} />
      </button>

      {isExportOpen && (
        <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-slate-200/90 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100">
          <button
            type="button"
            onClick={handleExportXLSX}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition text-left font-medium"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span>Export .xlsx</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-800 transition text-left font-medium"
          >
            <FileText size={15} className="text-blue-600" />
            <span>Export .csv</span>
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-800 transition text-left font-medium"
          >
            <Printer size={15} className="text-red-600" />
            <span>Export .pdf</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 w-full pb-20">
      {/* Header & Navigation Area */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-xs flex flex-col gap-3">
        {/* Top Row: Title on the left, Tab selector aligned to right on pc/tablet, stretched on small screens */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h1 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <BarChart3 className="text-blue-600 shrink-0" size={20} />
            <span>TAL: Rekapitulasi TAL Karyawan</span>
          </h1>

          {/* Period Selector Tabs: Harian first (paling kiri) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl w-full md:w-auto self-stretch md:self-auto justify-between md:justify-start">
            <button
              type="button"
              onClick={() => setPeriodType('daily')}
              className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                periodType === 'daily' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Harian
            </button>
            <button
              type="button"
              onClick={() => setPeriodType('weekly')}
              className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                periodType === 'weekly' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mingguan
            </button>
            <button
              type="button"
              onClick={() => setPeriodType('monthly')}
              className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                periodType === 'monthly' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bulanan
            </button>
            <button
              type="button"
              onClick={() => setPeriodType('yearly')}
              className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                periodType === 'yearly' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tahunan
            </button>
          </div>
        </div>

        {/* Filter Controls: SELALU DI BAWAH PILIHAN TAB */}
        <div className="pt-1 flex items-center gap-2 flex-wrap w-full">
          {periodType === 'daily' ? (
            /* TAB HARIAN: Filter Tanggal Awal dan Akhir (1 Baris penuh di HP) */
            <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap bg-slate-50 border border-slate-200/90 p-1.5 rounded-2xl w-full sm:w-auto">
              <TalDatePicker label="Awal" value={dailyStartDate} onChange={setDailyStartDate} className="flex-1 sm:flex-initial" />
              <span className="hidden sm:inline text-slate-400 font-bold text-xs self-end mb-2">s/d</span>
              <TalDatePicker label="Akhir" value={dailyEndDate} onChange={setDailyEndDate} className="flex-1 sm:flex-initial" />
            </div>
          ) : periodType === 'weekly' || periodType === 'monthly' ? (
            /* TAB MINGGUAN & BULANAN: Filter Bulan & Tahun Awal dan Akhir (1 Baris penuh di HP) */
            <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap bg-slate-50 border border-slate-200/90 p-1.5 rounded-2xl w-full sm:w-auto">
              <MonthYearPicker label="Awal" value={startFilter} onChange={setStartFilter} className="flex-1 sm:flex-initial" />
              <span className="hidden sm:inline text-slate-400 font-bold text-xs self-end mb-2">s/d</span>
              <MonthYearPicker label="Akhir" value={endFilter} onChange={setEndFilter} className="flex-1 sm:flex-initial" />
            </div>
          ) : periodType === 'yearly' ? (
            /* TAB TAHUNAN: Filter Tahun Awal dan Akhir */
            <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap bg-slate-50 border border-slate-200/90 p-1.5 rounded-2xl w-full sm:w-auto">
              <YearPicker label="Awal" value={startYearFilter} onChange={setStartYearFilter} className="flex-1 sm:flex-initial" />
              <span className="hidden sm:inline text-slate-400 font-bold text-xs self-end mb-2">s/d</span>
              <YearPicker label="Akhir" value={endYearFilter} onChange={setEndYearFilter} className="flex-1 sm:flex-initial" />
            </div>
          ) : null}
        </div>
      </div>

      {/* KPI Cards Row (Compact Grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
            {periodType === 'weekly' ? 'Total Pekan' : 'Total Tugas'}
          </span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            {periodType === 'weekly' ? weeklyRecapRows.length : stats.total}
          </p>
          <span className="text-[10px] text-slate-400">
            {periodType === 'weekly' ? `${stats.total} tugas terdaftar` : 'Semua tugas terdaftar'}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-emerald-200/80 p-3 shadow-2xs bg-emerald-50/20">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight">
            {periodType === 'weekly' ? 'Rata-Rata TAL' : 'Selesai (Done)'}
          </span>
          <p className="text-xl font-extrabold text-emerald-700 mt-1">
            {periodType === 'weekly' ? `${stats.avgNilaiTal}%` : stats.done}
          </p>
          <span className="text-[10px] text-emerald-600 font-semibold">
            {periodType === 'weekly' ? 'Rata-rata Nilai TAL' : `${stats.completionRate}% Tingkat Selesai`}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-amber-200/80 p-3 shadow-2xs bg-amber-50/20">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">On Progress</span>
          <p className="text-xl font-extrabold text-amber-700 mt-1">{stats.onProgress}</p>
          <span className="text-[10px] text-amber-600 font-semibold">Sedang dikerjakan</span>
        </div>

        <div className="bg-white rounded-xl border border-orange-200/80 p-3 shadow-2xs bg-orange-50/20">
          <span className="text-[10px] font-bold text-orange-700 uppercase tracking-tight">Pending</span>
          <p className="text-xl font-extrabold text-orange-700 mt-1">{stats.pending}</p>
          <span className="text-[10px] text-orange-600 font-semibold">Tertunda / kendala</span>
        </div>

        <div className="bg-white rounded-xl border border-blue-200/80 p-3 shadow-2xs bg-blue-50/20">
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-tight">To Do</span>
          <p className="text-xl font-extrabold text-blue-700 mt-1">{stats.todo}</p>
          <span className="text-[10px] text-blue-600 font-semibold">Belum dimulai</span>
        </div>

        <div className="bg-white rounded-xl border border-indigo-200/80 p-3 shadow-2xs bg-indigo-50/20">
          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-tight">Target Result</span>
          <p className="text-xl font-extrabold text-indigo-700 mt-1">{stats.resultCount}</p>
          <span className="text-[10px] text-indigo-600 font-semibold">{stats.nonResultCount} Non-Result</span>
        </div>
      </div>

      {/* Financial & Quantitative Accomplishments */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Target Rupiah */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <DollarSign size={14} className="text-amber-600" />
              Target Omset (Rupiah)
            </span>
            <span className="text-xs font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {stats.achievementRateRp}%
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Target:</span>
              <span className="font-bold text-slate-800">{formatCurrencyIDR(stats.totalTargetRp)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Realisasi:</span>
              <span className="font-bold text-emerald-700">{formatCurrencyIDR(stats.totalActualRp)}</span>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(stats.achievementRateRp, 100)}%` }}
            />
          </div>
        </div>

        {/* Target NOA */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Target size={14} className="text-blue-600" />
              Target Nasabah (NOA)
            </span>
            <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              {stats.totalTargetNoa > 0 ? Math.round((stats.totalActualNoa / stats.totalTargetNoa) * 100) : 0}%
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Target:</span>
              <span className="font-bold text-slate-800">{stats.totalTargetNoa} NOA</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Realisasi:</span>
              <span className="font-bold text-blue-700">{stats.totalActualNoa} NOA</span>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{
                width: `${stats.totalTargetNoa > 0 ? Math.min(Math.round((stats.totalActualNoa / stats.totalTargetNoa) * 100), 100) : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Target Unit / Berkas */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Layers size={14} className="text-indigo-600" />
              Target Berkas (Unit)
            </span>
            <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
              {stats.totalTargetUnit > 0 ? Math.round((stats.totalActualUnit / stats.totalTargetUnit) * 100) : 0}%
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Target:</span>
              <span className="font-bold text-slate-800">{stats.totalTargetUnit} Unit</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Realisasi:</span>
              <span className="font-bold text-indigo-700">{stats.totalActualUnit} Unit</span>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500"
              style={{
                width: `${stats.totalTargetUnit > 0 ? Math.min(Math.round((stats.totalActualUnit / stats.totalTargetUnit) * 100), 100) : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Heatmap Streak / Konsistensi (tambahan WOORK; tidak ada di backup) */}
      {heatmapSummary && (
        <TalHeatmapStreak
          heatmapData={heatmapSummary.heatmapData ?? []}
          currentStreak={heatmapSummary.currentStreak ?? 0}
          bestStreak={heatmapSummary.bestStreak ?? 0}
          seasonYear={heatmapYear}
          onYearChange={setHeatmapYear}
        />
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs py-12 text-center text-xs text-slate-400">
          Memuat data rekapitulasi...
        </div>
      ) : (
        <>
          {/* ============================================================ */}
          {/* TAB MINGGUAN: TABEL REKAPITULASI MATRIKS NILAI TAL MINGGUAN */}
          {/* ============================================================ */}
          {periodType === 'weekly' ? (
            <div className="space-y-3">
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Calculator size={16} className="text-blue-600 shrink-0" />
                    <span>Matriks Nilai Task Mingguan &amp; Harian ({weeklyRecapRows.length} Pekan)</span>
                  </h3>

                  {exportDropdown}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] text-slate-700 uppercase tracking-tight">
                        {/* Kolom 1: Bulan (Sebelah Kiri Week) */}
                        <th
                          rowSpan={2}
                          className="py-2.5 px-3 font-bold border-r border-slate-200 bg-slate-100 text-center whitespace-nowrap"
                        >
                          Bulan
                        </th>

                        {/* Kolom 2: Week */}
                        <th
                          rowSpan={2}
                          className="py-2.5 px-3 font-bold border-r-2 border-slate-400 bg-slate-100 text-center whitespace-nowrap"
                        >
                          Week
                        </th>

                        {/* Group 1: Task Mingguan */}
                        <th
                          colSpan={4}
                          className="py-2 px-3 text-center border-r-2 border-slate-400 bg-blue-100/80 text-blue-950 font-bold whitespace-nowrap"
                        >
                          Evaluasi Task Mingguan (Bobot 40%)
                        </th>

                        {/* Group 2: Task Harian */}
                        <th
                          colSpan={3}
                          className="py-2 px-3 text-center border-r-2 border-slate-400 bg-purple-100/80 text-purple-950 font-bold whitespace-nowrap"
                        >
                          Evaluasi Task Harian (Bobot 60%)
                        </th>

                        {/* Group 3: Final TAL Mingguan */}
                        <th
                          rowSpan={2}
                          className="py-2.5 px-3.5 text-center bg-emerald-100/80 text-emerald-950 font-bold whitespace-nowrap"
                        >
                          Nilai TAL Mingguan
                        </th>
                      </tr>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-tight">
                        <th className="py-2 px-2.5 text-center border-r border-slate-200 whitespace-nowrap">Plan</th>
                        <th className="py-2 px-2.5 text-center border-r border-slate-200 whitespace-nowrap">Realisasi</th>
                        <th className="py-2 px-2.5 text-center border-r border-slate-200 whitespace-nowrap">Report</th>
                        <th className="py-2 px-3 text-center border-r-2 border-slate-400 font-bold bg-blue-50/70 text-blue-900 whitespace-nowrap">
                          Nilai Mingguan
                        </th>
                        <th className="py-2 px-2.5 text-center border-r border-slate-200 whitespace-nowrap">Avg Realisasi</th>
                        <th className="py-2 px-2.5 text-center border-r border-slate-200 whitespace-nowrap">Avg Report</th>
                        <th className="py-2 px-3 text-center border-r-2 border-slate-400 font-bold bg-purple-50/70 text-purple-900 whitespace-nowrap">
                          Nilai Harian
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {weeklyRecapRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-10 text-center text-slate-400 text-xs">
                            Tidak ada data pekan untuk rentang filter yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        weeklyRecapRows.map((row, idx) => {
                          // Cek apakah baris berikutnya berbeda bulan/tahun
                          const nextRow = weeklyRecapRows[idx + 1];
                          const isMonthBoundary =
                            nextRow && (nextRow.month !== row.month || nextRow.weekYear !== row.weekYear);

                          return (
                            <tr
                              key={row.weekKey}
                              className={`hover:bg-blue-50/30 transition-colors ${
                                isMonthBoundary ? 'border-b-2 border-slate-400' : 'border-b border-slate-100'
                              }`}
                            >
                              {/* 1. Bulan */}
                              <td className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap font-bold text-slate-700 bg-slate-50/30">
                                {INDONESIAN_MONTHS_SHORT[(row.month || 1) - 1]} {String(row.weekYear).slice(-2)}
                              </td>

                              {/* 2. Week dengan pembatas tebal border-r-2 border-slate-400 */}
                              <td className="py-2.5 px-3 border-r-2 border-slate-400 text-center whitespace-nowrap font-extrabold text-slate-900">
                                {row.label}
                              </td>

                              {/* 3. Nilai Planning Mingguan */}
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-center whitespace-nowrap font-bold text-slate-700">
                                {row.weeklyPlanScore}
                              </td>

                              {/* 4. Nilai Realisasi Mingguan */}
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-center whitespace-nowrap font-bold text-slate-800">
                                {row.weeklyRealisasiScore}%
                              </td>

                              {/* 5. Nilai Report Mingguan */}
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-center whitespace-nowrap font-bold text-slate-700">
                                {row.weeklyReportScore}
                              </td>

                              {/* 6. Nilai Task Mingguan dengan border tebal border-r-2 border-slate-400 */}
                              <td className="py-2.5 px-3 border-r-2 border-slate-400 text-center whitespace-nowrap bg-blue-50/40">
                                <span className="font-extrabold text-blue-900 text-xs px-2 py-0.5 bg-blue-100/70 rounded-md border border-blue-200">
                                  {row.nilaiTaskMingguan}
                                </span>
                              </td>

                              {/* 7. Avg Nilai Realisasi Harian */}
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-center whitespace-nowrap font-bold text-slate-800">
                                {row.avgNilaiRealisasiHarian}%
                              </td>

                              {/* 8. Avg Nilai Reporting Harian */}
                              <td className="py-2.5 px-2.5 border-r border-slate-200 text-center whitespace-nowrap font-bold text-slate-700">
                                {row.avgNilaiReportingHarian}
                              </td>

                              {/* 9. Nilai Task Harian dengan border tebal border-r-2 border-slate-400 */}
                              <td className="py-2.5 px-3 border-r-2 border-slate-400 text-center whitespace-nowrap bg-purple-50/40">
                                <span className="font-extrabold text-purple-900 text-xs px-2 py-0.5 bg-purple-100/70 rounded-md border border-purple-200">
                                  {row.nilaiTaskHarian}
                                </span>
                              </td>

                              {/* 10. Nilai TAL Mingguan (FINAL) */}
                              <td className="py-2.5 px-3.5 text-center whitespace-nowrap bg-emerald-50/50">
                                <span
                                  className={`inline-flex items-center gap-1 font-black text-xs px-2 py-0.5 rounded-lg border shadow-2xs ${getScoreBadgeClass(row.nilaiTalMingguan)}`}
                                >
                                  <Award size={12} className="shrink-0" />
                                  <span>{row.nilaiTalMingguan}</span>
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section Info Perhitungan */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Info size={16} className="text-blue-600 shrink-0" />
                  <span>Info Formula Perhitungan Matriks Nilai TAL:</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1">
                    <span className="font-bold text-blue-900">Nilai Task Mingguan</span>
                    <p className="text-slate-600 text-[11px]">
                      = (Planning × 40%) + (Realisasi × 40%) + (Reporting × 20%)
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1">
                    <span className="font-bold text-amber-900">Nilai Task Harian</span>
                    <p className="text-slate-600 text-[11px]">= (Avg Realisasi × 66,67%) + (Avg Report × 33,33%)</p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-emerald-200/80 bg-emerald-50/20 space-y-1">
                    <span className="font-bold text-emerald-900">Nilai TAL Mingguan</span>
                    <p className="text-emerald-800 text-[11px] font-medium">
                      = (Nilai Task Mingguan × 40%) + (Nilai Task Harian × 60%)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : periodType === 'monthly' ? (
            /* ============================================================ */
            /* TAB BULANAN: MATRIKS REKAP BULANAN (STRUKTURAL VS STAFF)     */
            /* ============================================================ */
            <TalMonthlyTable
              startFilter={startFilter}
              endFilter={endFilter}
              monthlyTasks={monthlyTasksForMonthly}
              weeklyTasks={weeklyTasksForWeekly}
              dailyTasks={dailyTasksForWeekly}
              allLocks={allLocks}
              isStructural={isCurrentUserStructural}
              currentUserId={currentUserId}
              currentUserEmail={currentUserEmail}
              currentUserName={currentUserName}
            />
          ) : periodType === 'yearly' ? (
            /* ============================================================ */
            /* TAB TAHUNAN: MATRIKS REKAP TAHUNAN (TAHUN & NILAI TAHUNAN)   */
            /* ============================================================ */
            <TalYearlyTable
              startYear={startYearFilter}
              endYear={endYearFilter}
              monthlyTasks={monthlyTasksForMonthly}
              weeklyTasks={weeklyTasksForWeekly}
              dailyTasks={dailyTasksForWeekly}
              allLocks={allLocks}
              isStructural={isCurrentUserStructural}
              currentUserId={currentUserId}
              currentUserEmail={currentUserEmail}
              currentUserName={currentUserName}
            />
          ) : (
            /* ============================================================ */
            /* TAB HARIAN: DAFTAR RINCIAN TUGAS STANDARD                    */
            /* ============================================================ */
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold text-slate-800">
                  Daftar Rincian Tugas &amp; Status Evaluasi ({tasks.length})
                </h3>

                {exportDropdown}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                      <th className="py-2.5 px-3">Tipe &amp; Tanggal/Pekan</th>
                      <th className="py-2.5 px-3">Judul Tugas</th>
                      <th className="py-2.5 px-3 text-center">Kategori</th>
                      <th className="py-2.5 px-3 text-center">Target vs Realisasi</th>
                      <th className="py-2.5 px-3 text-center">Priority</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                          Tidak ada data tugas untuk periode yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      tasks.map((task, idx) => (
                        <tr key={task.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-700">
                            <span className="capitalize font-bold text-blue-600">[{task.type}]</span>{' '}
                            {task.date ||
                              (task.weekNumber
                                ? `Week ${task.weekNumber} (${task.weekYear})`
                                : `${INDONESIAN_MONTHS[(task.month || 1) - 1]} ${task.year}`)}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {task.title}
                            {task.notes && (
                              <p className="text-[11px] text-slate-400 font-normal truncate max-w-sm">{task.notes}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {task.category === 'result' ? (
                              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                                Result
                              </span>
                            ) : (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                Non Result
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap font-semibold text-slate-700">
                            {task.category === 'result' ? (
                              <span>
                                {task.targetUnit === 'Rupiah'
                                  ? formatCurrencyIDR(task.targetValue || 0)
                                  : `${task.targetValue} ${task.targetUnit}`}
                                {' → '}
                                <span className="text-emerald-700 font-bold">
                                  {task.targetUnit === 'Rupiah'
                                    ? formatCurrencyIDR(task.actualValue || 0)
                                    : `${task.actualValue || 0} ${task.targetUnit}`}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <PriorityPill priority={task.priority} disabled />
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <StatusPill status={task.status} disabled />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
