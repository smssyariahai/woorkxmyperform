// app/(dashboard)/tal/tasks/page.tsx — Tugas TAL (harian/mingguan/bulanan).
// Porting src/pages/TalTasks.tsx backup (2.164 baris) ke WOORK.
// Adaptasi WOORK:
// - Data hanya via lib/tal/client.ts (session-scoped; tanpa userId/userEmail/
//   userName di parameter maupun payload — API memaksa userId dari sesi).
// - Scope key kanonik via scopeKeyFor (bukan format backup daily_/weekly_/monthly_).
// - Lock/report diserahkan ke server: handleConfirmLockPlan -> lockPlan(),
//   handleConfirmReport -> submitReport() (server yang menangani rollover;
//   blok re-evaluasi skor + saveTalScopeState backup DIHAPUS).
// - PERILAKU CUTI PERTAHANKAN WOORK: menandai cuti HANYA memberi peringatan,
//   TIDAK menghapus task (berbeda dengan backup). handleConfirmCuti mengabaikan
//   action dan hanya memanggil setTalCuti/deleteTalCuti.
// - Dihilangkan (bukan milik Grup 2 / tanpa padanan WOORK): dropdown &
//   pengaturan notifikasi TAL, interval reminder 45 detik, banner mode lokal
//   Firebase + modal aturan Firestore.
// - Dipertahankan dari halaman WOORK lama: filter + pencarian (search/status/
//   priority), toast sukses/error, tombol "Lihat Laporan" saat sudah reported,
//   ApplyTemplatePicker inline + TalApplyTemplateModal WOORK; "kelola template"
//   -> router.push('/tal/templates') (TalRoutineTemplateModal tidak di-render).
// - TalHeader/TalPills milik Grup 1 (diimpor apa adanya).
'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Lock,
  Palmtree,
  FileCheck,
  Search,
  Sparkles,
  CalendarOff,
  Loader2,
  X,
  LayoutGrid,
  Table2
} from 'lucide-react';
import {
  batchDeleteTasks,
  batchUpdateTaskStatus,
  copyTalTasks,
  createTalTask,
  deleteTalTask,
  deleteTalCuti,
  fetchMyMonthLocks,
  fetchMyObligation,
  fetchScopeState,
  fetchTalCuti,
  fetchTalDeadlineSettings,
  fetchTalHolidays,
  fetchTalRoutineTemplates,
  fetchTalTasks,
  lockPlan,
  reorderTalTasks,
  setTalCuti,
  submitReport,
  updateTalTask
} from '@/lib/tal/client';
import type {
  TalCopyTarget,
  TalCutiRecord,
  TalDeadlineSettings,
  TalHolidayItem,
  TalMonthLockRecord,
  TalPriority,
  TalRoutineTemplate,
  TalScopeLockReport,
  TalStatus,
  TalTaskItem,
  TalTaskRolloverDecision,
  TalTaskType,
  TalViewMode
} from '@/lib/tal/types';
import type { TalObligationItem } from '@/lib/tal/client';
import {
  calculateTalReportScore,
  checkIsHoliday,
  checkIsTalMonthLocked,
  formatDateKey,
  getDaysOfWeek,
  getWeekNumberAndYear,
  getWeeksInMonth,
  INDONESIAN_MONTHS,
  INDONESIAN_MONTHS_SHORT,
  isReportingPeriodStarted,
  parseDateKey,
  scopeKeyFor
} from '@/lib/tal/date';
import { TalHeader } from '@/components/tal/TalHeader';
import { TalDateStrip } from '@/components/tal/TalDateStrip';
import { TalWeekStrip } from '@/components/tal/TalWeekStrip';
import { TalMonthStrip } from '@/components/tal/TalMonthStrip';
import { TalTableTaskView } from '@/components/tal/TalTableTaskView';
import { TalCardTaskView } from '@/components/tal/TalCardTaskView';
import { TalSwipeableContainer } from '@/components/tal/TalSwipeableContainer';
import { TalFloatingActionBar } from '@/components/tal/TalFloatingActionBar';
import { TalTaskModal } from '@/components/tal/TalTaskModal';
import { TalLockPlanModal } from '@/components/tal/TalLockPlanModal';
import { TalReportModal } from '@/components/tal/TalReportModal';
import { TalReportDetailModal } from '@/components/tal/TalReportDetailModal';
import { TalBlockerModal } from '@/components/tal/TalBlockerModal';
import { TalStageAccordionModal } from '@/components/tal/TalStageAccordionModal';
import { TalIncompleteTasksModal } from '@/components/tal/TalIncompleteTasksModal';
import { TalCutiModal } from '@/components/tal/TalCutiModal';
import { TalCopyDateModal } from '@/components/tal/TalCopyDateModal';
import { TalDeleteConfirmModal } from '@/components/tal/TalDeleteConfirmModal';
import { TalStageWorkflowBadge } from '@/components/tal/TalStageWorkflowBadge';
import TalApplyTemplateModal from '@/components/tal/TalApplyTemplateModal';

const STATUS_LABEL: Record<TalStatus, string> = {
  todo: 'Belum Dikerjakan',
  on_progress: 'Sedang Dikerjakan',
  pending: 'Tertunda',
  done: 'Selesai'
};
const PRIORITY_LABEL: Record<string, string> = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' };

export default function TalTasksPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Memuat tugas...</div>}>
      <TalTasksInner />
    </Suspense>
  );
}

function TalTasksInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. Navigation & State
  const initialType = searchParams.get('type') as TalTaskType | null;
  const [activeTab, setActiveTab] = useState<TalTaskType>(
    initialType === 'daily' || initialType === 'weekly' || initialType === 'monthly'
      ? initialType
      : 'daily'
  );
  const [currentDateStr, setCurrentDateStr] = useState<string>(
    searchParams.get('date') || formatDateKey(new Date())
  );
  const [viewMode, setViewMode] = useState<TalViewMode>(() => {
    if (typeof window === 'undefined') return 'card';
    return (localStorage.getItem('tal_view_mode') as TalViewMode) || 'card';
  });

  const handleChangeViewMode = (mode: TalViewMode) => {
    setViewMode(mode);
    localStorage.setItem('tal_view_mode', mode);
  };

  // Derive Week, Month, Year based on currentDateStr
  const parsedDate = useMemo(() => parseDateKey(currentDateStr), [currentDateStr]);
  const weekInfo = useMemo(() => getWeekNumberAndYear(parsedDate), [parsedDate]);

  // Weekly View state
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number>(() => {
    const w = searchParams.get('week');
    if (w) {
      const parsed = parseInt(w, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return weekInfo.weekNumber;
  });
  const [selectedWeekYear, setSelectedWeekYear] = useState<number>(() => {
    const y = searchParams.get('year');
    if (y) {
      const parsed = parseInt(y, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return weekInfo.weekYear;
  });
  const [selectedWeeklyMonth, setSelectedWeeklyMonth] = useState<number>(weekInfo.majorityMonth);

  // Monthly View state
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    const m = searchParams.get('month');
    if (m) {
      const parsed = parseInt(m, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return parsedDate.getMonth() + 1; // 1 - 12
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const y = searchParams.get('year');
    if (y) {
      const parsed = parseInt(y, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return parsedDate.getFullYear();
  });

  // Sync state if URL query params change dynamically
  useEffect(() => {
    const typeFromUrl = searchParams.get('type') as TalTaskType | null;
    if (typeFromUrl && (typeFromUrl === 'daily' || typeFromUrl === 'weekly' || typeFromUrl === 'monthly')) {
      setActiveTab(typeFromUrl);
    }
    const dateFromUrl = searchParams.get('date');
    if (dateFromUrl) {
      setCurrentDateStr(dateFromUrl);
    }
    const weekFromUrl = searchParams.get('week');
    if (weekFromUrl) {
      const parsedW = parseInt(weekFromUrl, 10);
      if (!isNaN(parsedW)) setSelectedWeekNumber(parsedW);
    }
    const monthFromUrl = searchParams.get('month');
    if (monthFromUrl) {
      const parsedM = parseInt(monthFromUrl, 10);
      if (!isNaN(parsedM)) setSelectedMonth(parsedM);
    }
    const yearFromUrl = searchParams.get('year');
    if (yearFromUrl) {
      const parsedY = parseInt(yearFromUrl, 10);
      if (!isNaN(parsedY)) {
        setSelectedWeekYear(parsedY);
        setSelectedYear(parsedY);
      }
    }
  }, [searchParams]);

  // Data state
  const [tasks, setTasks] = useState<TalTaskItem[]>([]);
  const [parentTasks, setParentTasks] = useState<TalTaskItem[]>([]);
  const [scopeState, setScopeState] = useState<TalScopeLockReport | null>(null);
  const [weeklyScopeStateForDaily, setWeeklyScopeStateForDaily] = useState<TalScopeLockReport | null>(null);
  const [cutiRecords, setCutiRecords] = useState<TalCutiRecord[]>([]);
  const [holidays, setHolidays] = useState<TalHolidayItem[]>([]);
  const [deadlineSettings, setDeadlineSettings] = useState<TalDeadlineSettings | null>(null);
  const [monthLocks, setMonthLocks] = useState<TalMonthLockRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [userObligation, setUserObligation] = useState<TalObligationItem | null>(null);

  // Filter + pencarian (dipertahankan dari halaman WOORK lama; backup tidak punya)
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  };

  // Selection for multi-task operations
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Modals state
  const [taskModalState, setTaskModalState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit' | 'view';
    task?: Partial<TalTaskItem>;
    isAdditional?: boolean;
    initialTab?: 'detail' | 'progress';
  }>({
    isOpen: false,
    mode: 'create'
  });

  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isReportDetailModalOpen, setIsReportDetailModalOpen] = useState(false);
  const [stageAccordionModalState, setStageAccordionModalState] = useState<{
    isOpen: boolean;
    initialStage: 'planning' | 'progress' | 'reporting';
  }>({
    isOpen: false,
    initialStage: 'reporting'
  });
  const [isIncompleteTasksModalOpen, setIsIncompleteTasksModalOpen] = useState(false);
  const [incompleteTasks, setIncompleteTasks] = useState<TalTaskItem[]>([]);
  const [isCutiModalOpen, setIsCutiModalOpen] = useState(false);
  const [copyModalState, setCopyModalState] = useState<{
    isOpen: boolean;
    tasksToCopy: TalTaskItem[];
  }>({
    isOpen: false,
    tasksToCopy: []
  });

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    taskIds: string[];
    taskTitles: string[];
  }>({
    isOpen: false,
    taskIds: [],
    taskTitles: []
  });

  const [blockerModalState, setBlockerModalState] = useState<{
    isOpen: boolean;
    task: TalTaskItem | null;
  }>({
    isOpen: false,
    task: null
  });

  const [isApplyTemplateModalOpen, setIsApplyTemplateModalOpen] = useState(false);
  const [applyTemplate, setApplyTemplate] = useState<TalRoutineTemplate | null>(null);

  // Calculate scopeKey for current active tab (kanonik WOORK via scopeKeyFor)
  const activeScopeKey = useMemo(() => {
    switch (activeTab) {
      case 'daily':
        return scopeKeyFor('daily', { dateStr: currentDateStr });
      case 'weekly':
        return scopeKeyFor('weekly', { weekNumber: selectedWeekNumber, weekYear: selectedWeekYear });
      case 'monthly':
        return scopeKeyFor('monthly', { month: selectedMonth, year: selectedYear });
    }
  }, [activeTab, currentDateStr, selectedWeekYear, selectedWeekNumber, selectedYear, selectedMonth]);

  // Derived current scope lock / report
  // Rule: Untuk Task harian itu tidak ada Tombol Kunci Plan, jadi untuk Task harian mengikuti Penguncian Plan dari Task Mingguan.
  const isPlanLocked = activeTab === 'daily'
    ? !!weeklyScopeStateForDaily?.isPlanLocked
    : !!scopeState?.isPlanLocked;

  const planLockedAt = activeTab === 'daily'
    ? (weeklyScopeStateForDaily?.planLockedAt || weeklyScopeStateForDaily?.lockedAt)
    : (scopeState?.planLockedAt || scopeState?.lockedAt);

  const isReported = !!scopeState?.isReported;
  const reportedAt = scopeState?.reportedAt;

  // 3 Kondisi / Tahap TAL:
  // 1. Perencanaan (Planning)
  // 2. Realisasi
  // 3. Reported
  const currentStage: 'planning' | 'realization' | 'reported' = isReported
    ? 'reported'
    : isPlanLocked
    ? 'realization'
    : 'planning';

  // 3-Stage Scores for Workflow Badge & Details:
  // 1. Plan Score (100 on-time / 50 late)
  const currentPlanScore = useMemo(() => {
    if (activeTab === 'daily') {
      return weeklyScopeStateForDaily?.planScore;
    }
    return scopeState?.planScore;
  }, [activeTab, weeklyScopeStateForDaily, scopeState]);

  // 2. Progress Score (Realisasi: (Main Done + Additional Done) / Total Main)
  const currentProgressScore = useMemo(() => {
    if (scopeState?.progressScore !== undefined) {
      return scopeState.progressScore;
    }
    if (scopeState?.scorePercent !== undefined) {
      return scopeState.scorePercent;
    }
    if (scopeState?.reportSummary?.scorePercent !== undefined) {
      return scopeState.reportSummary.scorePercent;
    }
    const scoreCalc = calculateTalReportScore(activeTab, tasks);
    return scoreCalc.scorePercent;
  }, [scopeState, activeTab, tasks]);

  // 3. Report Score (100 on-time / 50 late)
  const currentReportScoreVal = useMemo(() => {
    return scopeState?.reportScore;
  }, [scopeState]);

  // Determine if reporting window has started (Today > task/last-day at 16:00 WIB)
  const currentIsReportingPeriodStarted = useMemo(() => {
    return isReportingPeriodStarted(activeTab, {
      dateStr: currentDateStr,
      weekYear: selectedWeekYear,
      weekNumber: selectedWeekNumber,
      month: selectedMonth,
      year: selectedYear
    });
  }, [activeTab, currentDateStr, selectedWeekYear, selectedWeekNumber, selectedMonth, selectedYear]);

  // Current score for reported indicator legacy fallback
  const currentReportScore = useMemo(() => {
    if (!isReported) return 0;
    let score = 0;
    if (scopeState?.scorePercent !== undefined) {
      score = scopeState.scorePercent;
    } else if (scopeState?.reportSummary?.scorePercent !== undefined) {
      score = scopeState.reportSummary.scorePercent;
    } else {
      score = calculateTalReportScore(activeTab, tasks).scorePercent;
    }
    return Math.min(100, Math.max(0, score));
  }, [isReported, scopeState, activeTab, tasks]);

  // Days of current week (Sunday to Saturday)
  const currentWeekDays = useMemo(() => {
    return getDaysOfWeek(parsedDate);
  }, [parsedDate]);

  // Weeks of current month for weekly strip
  const currentMonthWeeks = useMemo(() => {
    return getWeeksInMonth(selectedWeekYear, selectedWeeklyMonth);
  }, [selectedWeekYear, selectedWeeklyMonth]);

  // Cuti set
  const cutiDatesSet = useMemo(() => {
    return new Set(cutiRecords.map(c => c.date));
  }, [cutiRecords]);

  const isCurrentDateCuti = activeTab === 'daily' && cutiDatesSet.has(currentDateStr);
  const currentDateCutiReason = cutiRecords.find(c => c.date === currentDateStr)?.reason;

  // Sunday & Holiday check for current date (Sunday & Public Holidays are non-working days)
  const isCurrentDateSunday = activeTab === 'daily' && parsedDate.getDay() === 0;

  const holidayCheck = useMemo(() => {
    return checkIsHoliday(currentDateStr, holidays);
  }, [currentDateStr, holidays]);

  const isCurrentDateHoliday = activeTab === 'daily' && (isCurrentDateSunday || holidayCheck.isHoliday);
  const currentHolidayTitle = isCurrentDateSunday
    ? 'Hari Minggu (Libur Mingguan)'
    : (holidayCheck.holidayTitle || 'Hari Libur');
  const isCurrentDateNonWorking = activeTab === 'daily' && (isCurrentDateSunday || holidayCheck.isHoliday);

  // Aturan Visibility UI Alur 3 Tahap TAL (TalStageWorkflowBadge):
  // 1. Ketika tanggal merah / hari libur / Hari Minggu: UI Alur 3 Tahap TAL di-HIDDEN (hanya berlaku di tab harian).
  // 2. Ketika tanggal tersebut cuti dan tidak ada task (tasks.length === 0): UI Alur 3 Tahap TAL di-HIDDEN.
  // 3. Ketika cuti SEBELUM lock TAL task mingguan (isPlanLocked === false): UI Alur 3 Tahap TAL di-HIDDEN.
  const shouldShowTalStageWorkflowBadge = useMemo(() => {
    if (activeTab === 'daily') {
      // Jika tanggal merah / hari libur: hidden
      if (isCurrentDateHoliday) {
        return false;
      }
      // Jika cuti: tampil HANYA jika sudah lock TAL task mingguan DAN terdapat task pada tanggal tersebut
      if (isCurrentDateCuti) {
        return isPlanLocked && tasks.length > 0;
      }
    }
    return true;
  }, [activeTab, isCurrentDateHoliday, isCurrentDateCuti, isPlanLocked, tasks.length]);

  // Map dateStr -> holidayTitle for all dates in current week strip
  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of currentWeekDays) {
      const check = checkIsHoliday(day.dateStr, holidays);
      if (check.isHoliday && check.holidayTitle) {
        map.set(day.dateStr, check.holidayTitle);
      }
    }
    return map;
  }, [currentWeekDays, holidays]);

  // Active Month & Year coordinates for Month Lock evaluation
  const currentActiveMonth = useMemo(() => {
    if (activeTab === 'daily') return parsedDate.getMonth() + 1;
    if (activeTab === 'weekly') return selectedWeeklyMonth;
    return selectedMonth;
  }, [activeTab, parsedDate, selectedWeeklyMonth, selectedMonth]);

  const currentActiveYear = useMemo(() => {
    if (activeTab === 'daily') return parsedDate.getFullYear();
    if (activeTab === 'weekly') return selectedWeekYear;
    return selectedYear;
  }, [activeTab, parsedDate, selectedWeekYear, selectedYear]);

  const currentMonthLockStatus = useMemo(() => {
    return checkIsTalMonthLocked(
      currentActiveYear,
      currentActiveMonth,
      holidays,
      deadlineSettings,
      monthLocks,
      new Date(),
      cutiDatesSet
    );
  }, [currentActiveYear, currentActiveMonth, holidays, deadlineSettings, monthLocks, cutiDatesSet]);

  const isCurrentMonthLocked = currentMonthLockStatus.isLocked;

  // Filter + pencarian (dipertahankan dari halaman WOORK lama)
  const filteredTasks = useMemo(() => {
    let list = [...tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.time ?? '').localeCompare(b.time ?? '') || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    if (statusFilter !== 'all') list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== 'all') list = list.filter((t) => t.priority === priorityFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(s) || (t.description ?? '').toLowerCase().includes(s));
    }
    return list;
  }, [tasks, statusFilter, priorityFilter, search]);

  // Initial fetch for holidays and user obligations
  useEffect(() => {
    fetchTalHolidays().then(hols => setHolidays(hols)).catch(() => {});
    fetchMyObligation().then(obl => {
      setUserObligation(obl);
      // Fallback activeTab if currently selected tab is hidden
      if (activeTab === 'daily' && obl.daily === false) {
        if (obl.weekly !== false) setActiveTab('weekly');
        else if (obl.monthly !== false) setActiveTab('monthly');
      } else if (activeTab === 'weekly' && obl.weekly === false) {
        if (obl.daily !== false) setActiveTab('daily');
        else if (obl.monthly !== false) setActiveTab('monthly');
      } else if (activeTab === 'monthly' && obl.monthly === false) {
        if (obl.daily !== false) setActiveTab('daily');
        else if (obl.weekly !== false) setActiveTab('weekly');
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data on scope change
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      // 1. Fetch current tasks (session-scoped server-side)
      let fetchedTasks: TalTaskItem[] = [];
      if (activeTab === 'daily') {
        fetchedTasks = await fetchTalTasks({ type: 'daily', date: currentDateStr });
      } else if (activeTab === 'weekly') {
        fetchedTasks = await fetchTalTasks({ type: 'weekly', weekNumber: selectedWeekNumber, weekYear: selectedWeekYear });
      } else {
        fetchedTasks = await fetchTalTasks({ type: 'monthly', month: selectedMonth, year: selectedYear });
      }
      setTasks(fetchedTasks);

      // 2. Fetch parent tasks for dropdown options
      if (activeTab === 'daily') {
        const weeklyParents = await fetchTalTasks({ type: 'weekly', weekNumber: weekInfo.weekNumber, weekYear: weekInfo.weekYear });
        setParentTasks(weeklyParents);
      } else if (activeTab === 'weekly') {
        const monthlyParents = await fetchTalTasks({ type: 'monthly', month: selectedWeeklyMonth, year: selectedWeekYear });
        setParentTasks(monthlyParents);
      } else {
        setParentTasks([]);
      }

      // 3. Fetch scope lock/report state
      const state = await fetchScopeState(activeTab, activeScopeKey);
      setScopeState(state);

      // If daily, fetch weekly scope state to follow weekly plan locking
      if (activeTab === 'daily') {
        const weeklyKeyForDaily = scopeKeyFor('weekly', { weekNumber: weekInfo.weekNumber, weekYear: weekInfo.weekYear });
        const fetchedWeeklyState = await fetchScopeState('weekly', weeklyKeyForDaily);
        setWeeklyScopeStateForDaily(fetchedWeeklyState);
      } else {
        setWeeklyScopeStateForDaily(null);
      }

      // 4. Fetch Cuti & Holidays & Month Locks records
      const [cutis, hols, dSettings, mLocks] = await Promise.all([
        fetchTalCuti(),
        fetchTalHolidays(),
        fetchTalDeadlineSettings(),
        fetchMyMonthLocks()
      ]);
      setCutiRecords(cutis.map(c => ({
        id: c.id,
        date: c.date,
        userId: '',
        reason: c.reason,
        isCuti: true
      })));
      setHolidays(hols);
      setDeadlineSettings(dSettings);
      setMonthLocks(mLocks.map(r => ({
        monthKey: r.monthKey,
        year: r.year,
        month: r.month,
        isLocked: r.isLocked,
        manualOverride: r.manualOverride,
        lockedAt: r.lockedAt,
        lockedBy: r.lockedBy,
        reason: r.reason,
        updatedAt: ''
      })));
      // WOORK: blok re-evaluasi skor + saveTalScopeState backup DIHAPUS —
      // skor dihitung & disimpan server-side (lockPlan/submitReport).
    } catch (e) {
      console.warn('Notice loading TAL data:', e);
      setLoadError(e instanceof Error ? e.message : 'Gagal memuat tugas TAL.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, activeScopeKey, currentDateStr, selectedWeekNumber, selectedWeekYear, selectedMonth, selectedYear, selectedWeeklyMonth, weekInfo]);

  useEffect(() => {
    loadData();
    setSelectedTaskIds(new Set());
  }, [loadData]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('tal_view_mode', viewMode);
  }, [viewMode]);

  // Date navigation handlers (Daily)
  const handleSelectDate = (dateStr: string) => {
    setCurrentDateStr(dateStr);
    const p = parseDateKey(dateStr);
    const w = getWeekNumberAndYear(p);
    setSelectedWeekNumber(w.weekNumber);
    setSelectedWeekYear(w.weekYear);
    setSelectedWeeklyMonth(w.majorityMonth);
    setSelectedMonth(p.getMonth() + 1);
    setSelectedYear(p.getFullYear());
  };

  const handlePrevDay = () => {
    const d = new Date(parsedDate);
    d.setDate(d.getDate() - 1);
    handleSelectDate(formatDateKey(d));
  };

  const handleNextDay = () => {
    const d = new Date(parsedDate);
    d.setDate(d.getDate() + 1);
    handleSelectDate(formatDateKey(d));
  };

  const handlePrevWeek = () => {
    const d = new Date(parsedDate);
    d.setDate(d.getDate() - 7);
    handleSelectDate(formatDateKey(d));
  };

  const handleNextWeek = () => {
    const d = new Date(parsedDate);
    d.setDate(d.getDate() + 7);
    handleSelectDate(formatDateKey(d));
  };

  const handleGoToday = () => {
    handleSelectDate(formatDateKey(new Date()));
  };

  // Weekly navigation handlers
  const handleSelectWeek = (year: number, weekNum: number, targetSundayStr: string) => {
    setSelectedWeekYear(year);
    setSelectedWeekNumber(weekNum);
    const p = parseDateKey(targetSundayStr);
    const w = getWeekNumberAndYear(p);
    setSelectedWeeklyMonth(w.majorityMonth);
    setCurrentDateStr(targetSundayStr);
  };

  const handlePrevWeekNavigation = () => {
    const currentSunday = parseDateKey(currentDateStr);
    const prevDate = new Date(currentSunday);
    prevDate.setDate(prevDate.getDate() - 7);
    const w = getWeekNumberAndYear(prevDate);
    handleSelectWeek(w.weekYear, w.weekNumber, formatDateKey(prevDate));
  };

  const handleNextWeekNavigation = () => {
    const currentSunday = parseDateKey(currentDateStr);
    const nextDate = new Date(currentSunday);
    nextDate.setDate(nextDate.getDate() + 7);
    const w = getWeekNumberAndYear(nextDate);
    handleSelectWeek(w.weekYear, w.weekNumber, formatDateKey(nextDate));
  };

  const handlePrevWeeklyMonth = () => {
    if (selectedWeeklyMonth === 1) {
      setSelectedWeeklyMonth(12);
      setSelectedWeekYear(prev => prev - 1);
    } else {
      setSelectedWeeklyMonth(prev => prev - 1);
    }
  };

  const handleNextWeeklyMonth = () => {
    if (selectedWeeklyMonth === 12) {
      setSelectedWeeklyMonth(1);
      setSelectedWeekYear(prev => prev + 1);
    } else {
      setSelectedWeeklyMonth(prev => prev + 1);
    }
  };

  const handleGoThisWeek = () => {
    const today = new Date();
    const w = getWeekNumberAndYear(today);
    setSelectedWeekYear(w.weekYear);
    setSelectedWeekNumber(w.weekNumber);
    setSelectedWeeklyMonth(w.majorityMonth);
    setCurrentDateStr(formatDateKey(today));
  };

  // Monthly navigation handlers
  const handleSelectMonthlyMonth = (monthNum: number) => {
    setSelectedMonth(monthNum);
  };

  const handlePrevMonthlyMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  };

  const handleNextMonthlyMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
  };

  const handleSelectMonthlyYear = (yr: number) => {
    setSelectedYear(yr);
  };

  const handlePrevYear = () => setSelectedYear(prev => prev - 1);
  const handleNextYear = () => setSelectedYear(prev => prev + 1);

  const handleGoThisMonth = () => {
    const today = new Date();
    setSelectedMonth(today.getMonth() + 1);
    setSelectedYear(today.getFullYear());
  };

  const handleSwipeLeft = () => {
    if (activeTab === 'daily') handleNextDay();
    else if (activeTab === 'weekly') handleNextWeekNavigation();
    else if (activeTab === 'monthly') handleNextMonthlyMonth();
  };

  const handleSwipeRight = () => {
    if (activeTab === 'daily') handlePrevDay();
    else if (activeTab === 'weekly') handlePrevWeekNavigation();
    else if (activeTab === 'monthly') handlePrevMonthlyMonth();
  };

  // Task CRUD handlers
  const handleSaveTask = async (taskData: Omit<TalTaskItem, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
    if (isCurrentMonthLocked) return;
    try {
      if (taskModalState.mode === 'edit' && taskModalState.task?.id) {
        await updateTalTask(taskModalState.task.id, taskData);
      } else {
        await createTalTask(taskData);
      }
      showToast('success', 'Tugas berhasil disimpan.');
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Gagal menyimpan tugas.');
      throw e;
    }
  };

  const handleUpdatePriority = async (id: string, priority: TalPriority) => {
    if (isCurrentMonthLocked || isReported) return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, priority } : t));
    await updateTalTask(id, { priority });
  };

  const handleUpdateStatus = async (id: string, status: TalStatus) => {
    if (isCurrentMonthLocked || isReported) return;
    // If status is changed to pending, intercept and open Blocker Modal
    if (status === 'pending') {
      const targetTask = tasks.find(t => t.id === id);
      if (targetTask) {
        setBlockerModalState({ isOpen: true, task: targetTask });
        return;
      }
    }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    await updateTalTask(id, { status });
  };

  const handleConfirmBlocker = async (taskId: string, blockerCategory: string, blockerDescription: string) => {
    if (isCurrentMonthLocked || isReported) return;
    const now = new Date().toISOString();
    setTasks(prev => prev.map(t => t.id === taskId ? {
      ...t,
      status: 'pending',
      blockerCategory,
      blockerDescription,
      blockerReportedAt: now
    } : t));
    await updateTalTask(taskId, {
      status: 'pending',
      blockerCategory,
      blockerDescription,
      blockerReportedAt: now
    });
    setBlockerModalState({ isOpen: false, task: null });
  };

  const handleDeleteTask = (id: string) => {
    const taskToDelete = tasks.find(t => t.id === id);
    if (!taskToDelete) return;
    if (isReported) return;
    if (isPlanLocked && !taskToDelete.isAdditional) return;

    setDeleteModalState({
      isOpen: true,
      taskIds: [id],
      taskTitles: [taskToDelete.title]
    });
  };

  const handleDuplicateTask = async (task: TalTaskItem) => {
    if (isReported) {
      alert(
        activeTab === 'daily'
          ? 'Tidak diperbolehkan menyalin/menduplikasi tugas ke tanggal yang sudah dilakukan pelaporan.'
          : activeTab === 'weekly'
          ? 'Tidak diperbolehkan menyalin/menduplikasi tugas ke minggu yang sudah dilakukan pelaporan.'
          : 'Tidak diperbolehkan menyalin/menduplikasi tugas ke bulan yang sudah dilakukan pelaporan.'
      );
      return;
    }
    if (activeTab === 'daily' && isCurrentDateHoliday) {
      alert(`Tidak diperbolehkan menyalin/menduplikasi tugas ke tanggal merah atau hari libur (${currentHolidayTitle || 'Libur'}).`);
      return;
    }
    if (activeTab === 'daily' && isCurrentDateCuti) {
      alert(`Tidak diperbolehkan menyalin/menduplikasi tugas ke tanggal cuti (${currentDateCutiReason || 'Cuti Pegawai'}).`);
      return;
    }
    if (isCurrentMonthLocked) {
      alert('Bulan ini sudah terkunci.');
      return;
    }

    const { id, createdAt, updatedAt, userId, userEmail, userName, ...cloneData } = task;
    await createTalTask({
      ...cloneData,
      title: `${cloneData.title} (Salinan)`,
      isAdditional: isPlanLocked ? true : (cloneData.isAdditional ?? false)
    });
    await loadData();
  };

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (allTasks: TalTaskItem[]) => {
    if (selectedTaskIds.size === allTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(allTasks.map(t => t.id)));
    }
  };

  // Reorder tasks handler (both Card and Table drag-and-drop)
  const handleReorderTasks = async (newOrderedTasks: TalTaskItem[]) => {
    // 1. Optimistic update with re-calculated sequential orders
    const updatedTasksWithOrder = newOrderedTasks.map((task, index) => ({
      ...task,
      order: index + 1
    }));
    setTasks(updatedTasksWithOrder);

    // 2. Persist with indexed orders
    const updates = updatedTasksWithOrder.map((task) => ({
      id: task.id,
      order: task.order!
    }));
    await reorderTalTasks(updates);
  };

  // Bulk actions
  const handleBulkChangeStatus = async (status: TalStatus) => {
    const ids = Array.from(selectedTaskIds);
    setTasks(prev => prev.map(t => ids.includes(t.id) ? { ...t, status } : t));
    await batchUpdateTaskStatus(ids, status);
    setSelectedTaskIds(new Set());
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedTaskIds);
    // In realization phase, only allow deleting additional tasks; in planning phase allow all
    const eligibleTasks = isPlanLocked && !isReported
      ? tasks.filter(t => ids.includes(t.id) && t.isAdditional)
      : tasks.filter(t => ids.includes(t.id));

    if (eligibleTasks.length === 0) return;

    setDeleteModalState({
      isOpen: true,
      taskIds: eligibleTasks.map(t => t.id),
      taskTitles: eligibleTasks.map(t => t.title)
    });
  };

  const handleConfirmDelete = async () => {
    const ids = deleteModalState.taskIds;
    if (ids.length === 0) return;

    setTasks(prev => prev.filter(t => !ids.includes(t.id)));
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });

    if (ids.length === 1) {
      await deleteTalTask(ids[0]);
    } else {
      await batchDeleteTasks(ids);
    }
    showToast('success', 'Tugas berhasil dihapus.');
  };

  const handleConfirmCopyDate = async (target: TalCopyTarget, taskIdsToCopy: string[]) => {
    const itemsToCopy = tasks.filter(t => taskIdsToCopy.includes(t.id));
    if (itemsToCopy.length === 0) return;
    const created = await copyTalTasks(taskIdsToCopy, {
      targetType: target.targetType,
      targetDate: target.targetDate,
      targetWeekNumber: target.targetWeekNumber,
      targetWeekYear: target.targetWeekYear,
      targetMonth: target.targetMonth,
      targetYear: target.targetYear
    });
    showToast('success', `${created.length} tugas berhasil disalin.`);
    await loadData();
  };

  // Label for period
  const periodTitle = useMemo(() => {
    switch (activeTab) {
      case 'daily':
        return `${parsedDate.getDate()} ${INDONESIAN_MONTHS[parsedDate.getMonth()]} ${parsedDate.getFullYear()}`;
      case 'weekly':
        return `Week ${selectedWeekNumber} (${selectedWeekYear})`;
      case 'monthly':
        return `${INDONESIAN_MONTHS[selectedMonth - 1]} ${selectedYear}`;
    }
  }, [activeTab, parsedDate, selectedWeekNumber, selectedWeekYear, selectedMonth, selectedYear]);

  // Lock Plan & Report handlers
  // WOORK: lock/report diserahkan ke server (lockPlan/submitReport) — server
  // yang menghitung deadline & skor; tidak ada saveTalScopeState client-side.
  const handleConfirmLockPlan = async (notes?: string) => {
    try {
      await lockPlan(activeTab, activeScopeKey, notes);
      showToast('success', 'Rencana berhasil dikunci.');
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Gagal mengunci rencana.');
      throw e;
    }
  };

  // Rule: Tombol Report Show (ketika di klik cek, apakah ada task yang statusnya "To Do" atau "On Progress",
  // jika ada muncul kan popup infonya, bahwa ada task yang belum diselesaikan dan tidak bisa lakukan report)
  const handleOpenReport = () => {
    const unfinished = tasks.filter(
      t => t.status === 'todo' || t.status === 'on_progress' || (t.status as unknown as string) === 'in_progress'
    );
    if (unfinished.length > 0) {
      setIncompleteTasks(unfinished);
      setIsIncompleteTasksModalOpen(true);
    } else {
      setIsReportModalOpen(true);
    }
  };

  const handleConfirmReport = async (notes?: string, rolloverDecisions?: TalTaskRolloverDecision[]) => {
    try {
      await submitReport(activeTab, activeScopeKey, { notes, rolloverDecisions });
      showToast('success', 'Laporan berhasil dikirim.');
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Gagal mengirim laporan.');
      throw e;
    }
  };

  // Cuti handler — PERTAHANKAN PERILAKU WOORK: hanya peringatan, TIDAK
  // menghapus task (berbeda dengan backup). `action` diabaikan.
  const handleConfirmCuti = async (
    isCuti: boolean,
    reason?: string,
    _action?: 'delete_tasks' | 'mark_pending_report' | 'normal'
  ) => {
    try {
      if (isCuti) {
        await setTalCuti(currentDateStr, reason);
        showToast('success', 'Tanggal ditandai cuti.');
      } else {
        await deleteTalCuti(currentDateStr);
        showToast('success', 'Tanda cuti dihapus.');
      }
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Gagal mengubah cuti.');
      throw e;
    }
  };

  // Week label for header button
  const headerWeekLabel = useMemo(() => {
    return `${INDONESIAN_MONTHS_SHORT[parsedDate.getMonth()]} ${parsedDate.getFullYear()} - Week ${weekInfo.weekNumber}`;
  }, [parsedDate, weekInfo]);

  return (
    <div className="space-y-3 sm:space-y-4 w-full pb-20">
      {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{loadError}</div>}
      {toast && (
        <div className={`rounded-xl border px-4 py-3 text-xs font-medium ${toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {toast.text}
        </div>
      )}

      {/* Month Lock Warning Banner */}
      {isCurrentMonthLocked && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-3 sm:p-3.5 text-xs text-rose-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-600 text-white rounded-lg shadow-2xs shrink-0">
              <Lock size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-rose-950 text-sm">
                  TAL Bulan {INDONESIAN_MONTHS[currentActiveMonth - 1]} {currentActiveYear} Locked
                </span>
                <span className="text-[10px] uppercase font-extrabold px-2.5 py-0.5 bg-rose-200 text-rose-800 rounded-full border border-rose-300">
                  {currentMonthLockStatus.isManualOverride ? 'Manual Lock Admin' : 'Sistem Terkunci'}
                </span>
              </div>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Bulan ini telah dikunci oleh sistem ({currentMonthLockStatus.isManualOverride ? 'Oleh Administrator' : `Batas H+${deadlineSettings?.systemLockMonthlyDays ?? 5} Hari Kerja Akhir Bulan: ${currentMonthLockStatus.deadlineDateStr} ${currentMonthLockStatus.deadlineTimeStr} WIB`}). Seluruh data TAL (Plan, Task, Progress, Report) bersifat read-only.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 1. Header with Tab Switcher, Calendar Navigation, View Toggle */}
      <TalHeader
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        selectedDateStr={currentDateStr}
        onSelectDate={handleSelectDate}
        weekLabel={headerWeekLabel}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onGoToday={handleGoToday}
        selectedWeekYear={selectedWeekYear}
        selectedWeekNumber={selectedWeekNumber}
        selectedMonth={selectedWeeklyMonth}
        onSelectWeek={handleSelectWeek}
        onPrevMonth={handlePrevWeeklyMonth}
        onNextMonth={handleNextWeeklyMonth}
        onGoThisWeek={handleGoThisWeek}
        selectedYear={selectedYear}
        onSelectYear={handleSelectMonthlyYear}
        onPrevYear={handlePrevYear}
        onNextYear={handleNextYear}
        onGoThisMonth={handleGoThisMonth}
        viewMode={viewMode}
        onChangeViewMode={handleChangeViewMode}
        visibleTabs={{
          daily: userObligation?.daily ?? true,
          weekly: userObligation?.weekly ?? true,
          monthly: userObligation?.monthly ?? true
        }}
      />

      {/* 2. Period Navigation Strip (7-day strip, Month's weeks strip, or 12-month strip) */}
      {activeTab === 'daily' && (
        <TalDateStrip
          days={currentWeekDays}
          selectedDateStr={currentDateStr}
          onSelectDate={handleSelectDate}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          cutiDates={cutiDatesSet}
          holidayMap={holidayMap}
        />
      )}

      {activeTab === 'weekly' && (
        <TalWeekStrip
          weeks={currentMonthWeeks}
          selectedWeekNumber={selectedWeekNumber}
          selectedWeekYear={selectedWeekYear}
          onSelectWeek={(w) => handleSelectWeek(w.weekYear, w.weekNumber, w.startDateStr)}
          onPrevMonth={handlePrevWeeklyMonth}
          onNextMonth={handleNextWeeklyMonth}
        />
      )}

      {activeTab === 'monthly' && (
        <TalMonthStrip
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onSelectMonth={handleSelectMonthlyMonth}
          onPrevYear={handlePrevYear}
          onNextYear={handleNextYear}
        />
      )}

      {/* 3. Action Sub-Bar: 3-Stage Workflow Badge, Report, Lock Plan, + Tugas, Cuti Button */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-2.5 sm:p-3 shadow-xs flex items-center justify-between gap-2 flex-wrap">
        {/* Left Status Indicators & 3-Step Workflow Badge */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-xs sm:text-sm font-bold text-slate-800">
            {periodTitle}
          </h2>

          {/* Visual 3-Stage Workflow Badge: Planning -> Realization -> Reported */}
          {shouldShowTalStageWorkflowBadge && (
            <TalStageWorkflowBadge
              currentStage={currentStage}
              planScore={currentPlanScore}
              progressScore={currentProgressScore}
              reportScore={currentReportScoreVal}
              isPlanLocked={isPlanLocked}
              isReported={isReported}
              isReportingPeriodStarted={currentIsReportingPeriodStarted}
              onClickPlanning={() => {
                setStageAccordionModalState({
                  isOpen: true,
                  initialStage: 'planning'
                });
              }}
              onClickProgress={() => {
                setStageAccordionModalState({
                  isOpen: true,
                  initialStage: 'progress'
                });
              }}
              onClickReporting={() => {
                setStageAccordionModalState({
                  isOpen: true,
                  initialStage: 'reporting'
                });
              }}
              onClickBadgeContainer={() => {
                setStageAccordionModalState({
                  isOpen: true,
                  initialStage: currentStage === 'planning' ? 'planning' : currentStage === 'realization' ? 'progress' : 'reporting'
                });
              }}
            />
          )}

          {/* Cuti Indicator (daily only, for planning, realization, and reported stages) */}
          {isCurrentDateCuti && activeTab === 'daily' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full shadow-2xs">
              <Palmtree size={11} className="text-amber-600" />
              <span>Cuti: {currentDateCutiReason || 'Hari Cuti'}</span>
            </span>
          )}

          {/* Holiday / Sunday Indicator (daily only) */}
          {isCurrentDateHoliday && activeTab === 'daily' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full">
              <CalendarOff size={11} className="text-rose-600" />
              <span>{currentHolidayTitle} (Bukan Hari Kerja)</span>
            </span>
          )}
        </div>

        {/* Right Action Buttons - Strictly matching the 3 TAL Stages */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {isCurrentMonthLocked ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-bold shadow-2xs">
              <Lock size={13} className="text-rose-700" />
              <span>TAL Bulan {INDONESIAN_MONTHS_SHORT[currentActiveMonth - 1]} Locked</span>
            </span>
          ) : (
            <>
              {/* 1. TAHAP PERENCANAAN (PLANNING) */}
              {currentStage === 'planning' && (
                <>
                  {/* Tombol Cuti Show (Khusus Harian, jika bukan hari libur/Minggu) */}
                  {activeTab === 'daily' && !isCurrentDateNonWorking && (
                    <button
                      type="button"
                      onClick={() => setIsCutiModalOpen(true)}
                      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        isCurrentDateCuti
                          ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <Palmtree size={13} className="text-amber-600" />
                      <span>{isCurrentDateCuti ? 'Atur Cuti' : 'Cuti'}</span>
                    </button>
                  )}

                  {/* Tombol Kunci Plan Show (Hanya Mingguan & Bulanan, task harian mengikuti mingguan) */}
                  {activeTab !== 'daily' && (
                    <button
                      type="button"
                      onClick={() => setIsLockModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                    >
                      <Lock size={13} className="text-amber-700" />
                      <span>Kunci Plan</span>
                    </button>
                  )}

                  {/* Tombol Template Rutinitas */}
                  {!isCurrentDateNonWorking && !isCurrentDateCuti && (
                    <button
                      type="button"
                      onClick={() => setIsApplyTemplateModalOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer shadow-2xs"
                      title="Terapkan Template Rutinitas Kerja (Katalog Template)"
                    >
                      <Sparkles size={13} className="text-amber-500" />
                      <span className="hidden sm:inline">Template Rutinitas</span>
                      <span className="sm:hidden">Template</span>
                    </button>
                  )}

                  {/* Tombol Tambah Tugas Show (Hanya jika bukan hari libur / hari Minggu DAN bukan hari cuti) */}
                  {!isCurrentDateNonWorking && !isCurrentDateCuti ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (isCurrentDateNonWorking || isCurrentDateCuti) return;
                        setTaskModalState({
                          isOpen: true,
                          mode: 'create',
                          isAdditional: false,
                          task: {
                            type: activeTab,
                            date: currentDateStr,
                            weekNumber: selectedWeekNumber,
                            weekYear: selectedWeekYear,
                            month: selectedMonth,
                            year: selectedYear,
                            priority: 'medium',
                            status: 'todo',
                            category: 'non_result'
                          }
                        });
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Tugas</span>
                    </button>
                  ) : isCurrentDateNonWorking ? (
                    <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200/80 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                      <CalendarOff size={13} />
                      <span>Libur Kerja</span>
                    </span>
                  ) : null}
                </>
              )}

              {/* 2. TAHAP REALISASI */}
              {currentStage === 'realization' && (
                <>
                  {/* Tombol Cuti Show (Khusus Harian, jika bukan hari libur kerja/Minggu) */}
                  {activeTab === 'daily' && !isCurrentDateNonWorking && (
                    <button
                      type="button"
                      onClick={() => setIsCutiModalOpen(true)}
                      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        isCurrentDateCuti
                          ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <Palmtree size={13} className="text-amber-600" />
                      <span>{isCurrentDateCuti ? 'Atur Cuti' : 'Cuti'}</span>
                    </button>
                  )}

                  {/* Tombol Report Show (Hanya jika bukan hari libur kerja dan bukan cuti) */}
                  {!isCurrentDateNonWorking && !isCurrentDateCuti && (
                    <button
                      type="button"
                      onClick={handleOpenReport}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      <FileCheck size={14} />
                      <span>Report</span>
                    </button>
                  )}

                  {/* Tombol Tambah Tugas ganti jadi "Tugas Tambahan" (Khusus Harian, jika hari kerja dan bukan cuti) */}
                  {activeTab === 'daily' && !isCurrentDateNonWorking && !isCurrentDateCuti && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isCurrentDateNonWorking || isCurrentDateCuti) return;
                        setTaskModalState({
                          isOpen: true,
                          mode: 'create',
                          isAdditional: true,
                          task: {
                            type: 'daily',
                            date: currentDateStr,
                            weekNumber: selectedWeekNumber,
                            weekYear: selectedWeekYear,
                            month: selectedMonth,
                            year: selectedYear,
                            priority: 'medium',
                            status: 'todo',
                            category: 'non_result'
                          }
                        });
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Tugas Tambahan</span>
                    </button>
                  )}
                </>
              )}

              {/* 3. TAHAP REPORTED */}
              {currentStage === 'reported' && (
                <>
                  {/* Tombol Lihat Laporan (dipertahankan dari halaman WOORK lama; di backup state-nya dead) */}
                  <button
                    type="button"
                    onClick={() => setIsReportDetailModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                  >
                    <FileCheck size={13} />
                    <span>Lihat Laporan</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Filter + pencarian (dipertahankan dari halaman WOORK lama) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
            placeholder="Cari tugas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Semua Status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="all">Semua Prioritas</option>
          {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
          <button type="button" onClick={() => handleChangeViewMode('card')} title="Tampilan kartu" className={`rounded-md p-2 ${viewMode === 'card' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            <LayoutGrid size={15} />
          </button>
          <button type="button" onClick={() => handleChangeViewMode('table')} title="Tampilan tabel" className={`rounded-md p-2 ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            <Table2 size={15} />
          </button>
        </div>
        <span className="text-xs text-slate-500">
          {loading ? 'Memuat...' : `${filteredTasks.length} tugas • ${tasks.filter((t) => t.status === 'done').length} selesai • Skor ${currentProgressScore}%`}
        </span>
      </div>

      {/* 4. Task Display (Table or Card view) with live responsive smartphone-like touch swipe gestures */}
      <TalSwipeableContainer
        activeKey={activeScopeKey}
        onSwipeLeft={handleSwipeLeft}
        onSwipeRight={handleSwipeRight}
      >
        {viewMode === 'table' ? (
          <TalTableTaskView
            tasks={filteredTasks}
            type={activeTab}
            isPlanLocked={isPlanLocked}
            isReported={isReported}
            isMonthLocked={isCurrentMonthLocked}
            isCuti={isCurrentDateCuti}
            cutiReason={currentDateCutiReason}
            isHoliday={isCurrentDateHoliday}
            holidayTitle={currentHolidayTitle}
            isPlanning={currentStage === 'planning'}
            onOpenCutiModal={() => {
              if (isCurrentMonthLocked) return;
              setIsCutiModalOpen(true);
            }}
            onApplyRoutineTemplate={() => {
              if (isCurrentMonthLocked) return;
              setIsApplyTemplateModalOpen(true);
            }}
            onAddTask={() => {
              if (isCurrentDateNonWorking || isCurrentDateCuti || isCurrentMonthLocked) return;
              setTaskModalState({
                isOpen: true,
                mode: 'create',
                isAdditional: false,
                task: {
                  type: activeTab,
                  date: currentDateStr,
                  weekNumber: selectedWeekNumber,
                  weekYear: selectedWeekYear,
                  month: selectedMonth,
                  year: selectedYear,
                  priority: 'medium',
                  status: 'todo',
                  category: 'non_result'
                }
              });
            }}
            selectedIds={selectedTaskIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onUpdatePriority={handleUpdatePriority}
            onUpdateStatus={handleUpdateStatus}
            onViewDetail={(task) => setTaskModalState({ isOpen: true, mode: 'view', task, isAdditional: task.isAdditional })}
            onEditTask={(task, initialTab) => setTaskModalState({ isOpen: true, mode: isCurrentMonthLocked ? 'view' : 'edit', task, isAdditional: task.isAdditional, initialTab })}
            onDeleteTask={handleDeleteTask}
            onDuplicateTask={handleDuplicateTask}
            onCopyTaskToDate={(task) => setCopyModalState({ isOpen: true, tasksToCopy: [task] })}
            onOpenBlockerModal={(task) => setBlockerModalState({ isOpen: true, task })}
            onReorderTasks={handleReorderTasks}
            onAddAdditionalTask={() => {
              if (isCurrentDateNonWorking || isCurrentDateCuti || isCurrentMonthLocked) return;
              setTaskModalState({
                isOpen: true,
                mode: 'create',
                isAdditional: true,
                task: {
                  type: 'daily',
                  date: currentDateStr,
                  weekNumber: weekInfo.weekNumber,
                  weekYear: weekInfo.weekYear,
                  month: parsedDate.getMonth() + 1,
                  year: parsedDate.getFullYear(),
                  priority: 'medium',
                  status: 'todo',
                  category: 'non_result'
                }
              });
            }}
          />
        ) : (
          <TalCardTaskView
            tasks={filteredTasks}
            type={activeTab}
            isPlanLocked={isPlanLocked}
            isReported={isReported}
            isMonthLocked={isCurrentMonthLocked}
            isCuti={isCurrentDateCuti}
            cutiReason={currentDateCutiReason}
            isHoliday={isCurrentDateHoliday}
            holidayTitle={currentHolidayTitle}
            isPlanning={currentStage === 'planning'}
            onOpenCutiModal={() => {
              if (isCurrentMonthLocked) return;
              setIsCutiModalOpen(true);
            }}
            onApplyRoutineTemplate={() => {
              if (isCurrentMonthLocked) return;
              setIsApplyTemplateModalOpen(true);
            }}
            onAddTask={() => {
              if (isCurrentDateNonWorking || isCurrentDateCuti || isCurrentMonthLocked) return;
              setTaskModalState({
                isOpen: true,
                mode: 'create',
                isAdditional: false,
                task: {
                  type: activeTab,
                  date: currentDateStr,
                  weekNumber: selectedWeekNumber,
                  weekYear: selectedWeekYear,
                  month: selectedMonth,
                  year: selectedYear,
                  priority: 'medium',
                  status: 'todo',
                  category: 'non_result'
                }
              });
            }}
            selectedIds={selectedTaskIds}
            onToggleSelect={handleToggleSelect}
            onUpdatePriority={handleUpdatePriority}
            onUpdateStatus={handleUpdateStatus}
            onViewDetail={(task) => setTaskModalState({ isOpen: true, mode: 'view', task, isAdditional: task.isAdditional })}
            onEditTask={(task, initialTab) => setTaskModalState({ isOpen: true, mode: isCurrentMonthLocked ? 'view' : 'edit', task, isAdditional: task.isAdditional, initialTab })}
            onDeleteTask={handleDeleteTask}
            onDuplicateTask={handleDuplicateTask}
            onCopyTaskToDate={(task) => setCopyModalState({ isOpen: true, tasksToCopy: [task] })}
            onOpenBlockerModal={(task) => setBlockerModalState({ isOpen: true, task })}
            onReorderTasks={handleReorderTasks}
            onAddAdditionalTask={() => {
              if (isCurrentDateNonWorking || isCurrentDateCuti || isCurrentMonthLocked) return;
              setTaskModalState({
                isOpen: true,
                mode: 'create',
                isAdditional: true,
                task: {
                  type: 'daily',
                  date: currentDateStr,
                  weekNumber: weekInfo.weekNumber,
                  weekYear: weekInfo.weekYear,
                  month: parsedDate.getMonth() + 1,
                  year: parsedDate.getFullYear(),
                  priority: 'medium',
                  status: 'todo',
                  category: 'non_result'
                }
              });
            }}
          />
        )}
      </TalSwipeableContainer>

      {/* 5. Floating Multi-Task Action Bar */}
      <TalFloatingActionBar
        selectedCount={selectedTaskIds.size}
        totalCount={tasks.length}
        onSelectAll={() => handleSelectAll(filteredTasks)}
        onClearSelection={() => setSelectedTaskIds(new Set())}
        onChangeBulkStatus={handleBulkChangeStatus}
        onBulkCopyToDate={() => {
          const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id));
          setCopyModalState({ isOpen: true, tasksToCopy: selectedTasks });
        }}
        onBulkDelete={handleBulkDelete}
        isDaily={activeTab === 'daily'}
        disabled={isReported}
        canDelete={!isReported && (!isPlanLocked || (
          selectedTaskIds.size > 0 && Array.from(selectedTaskIds).every(id => tasks.find(t => t.id === id)?.isAdditional)
        ))}
      />

      {/* 6. Modals */}
      {taskModalState.isOpen && (
        <TalTaskModal
          isOpen={taskModalState.isOpen}
          mode={taskModalState.mode}
          taskType={activeTab}
          initialTask={taskModalState.task}
          isAdditional={taskModalState.isAdditional ?? taskModalState.task?.isAdditional}
          isPlanLocked={isPlanLocked}
          isReported={isReported}
          initialTab={taskModalState.initialTab}
          parentOptions={parentTasks.map(p => ({ id: p.id, title: p.title, category: p.category }))}
          onSave={handleSaveTask}
          onClose={() => setTaskModalState({ isOpen: false, mode: 'create' })}
        />
      )}

      {/* Blocker Modal */}
      {blockerModalState.isOpen && blockerModalState.task && (
        <TalBlockerModal
          isOpen={blockerModalState.isOpen}
          task={blockerModalState.task}
          isReadOnly={isReported || isCurrentMonthLocked}
          onConfirm={(cat, desc) => handleConfirmBlocker(blockerModalState.task!.id, cat, desc)}
          onClose={() => setBlockerModalState({ isOpen: false, task: null })}
        />
      )}

      {/* Incomplete Tasks Alert Modal */}
      {isIncompleteTasksModalOpen && (
        <TalIncompleteTasksModal
          isOpen={isIncompleteTasksModalOpen}
          tasks={incompleteTasks}
          periodLabel={periodTitle}
          onClose={() => setIsIncompleteTasksModalOpen(false)}
        />
      )}

      {isLockModalOpen && (
        <TalLockPlanModal
          isOpen={isLockModalOpen}
          type={activeTab}
          periodLabel={periodTitle}
          totalTasks={tasks.length}
          onConfirm={handleConfirmLockPlan}
          onClose={() => setIsLockModalOpen(false)}
        />
      )}

      {isReportModalOpen && (
        <TalReportModal
          isOpen={isReportModalOpen}
          type={activeTab}
          periodLabel={periodTitle}
          currentDateStr={currentDateStr}
          selectedWeekNumber={selectedWeekNumber}
          selectedWeekYear={selectedWeekYear}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          tasks={tasks}
          onConfirm={handleConfirmReport}
          onClose={() => setIsReportModalOpen(false)}
        />
      )}

      {isReportDetailModalOpen && (
        <TalReportDetailModal
          isOpen={isReportDetailModalOpen}
          type={activeTab}
          periodLabel={periodTitle}
          scopeState={scopeState}
          tasks={tasks}
          onClose={() => setIsReportDetailModalOpen(false)}
        />
      )}

      {stageAccordionModalState.isOpen && (
        <TalStageAccordionModal
          isOpen={stageAccordionModalState.isOpen}
          onClose={() => setStageAccordionModalState(prev => ({ ...prev, isOpen: false }))}
          scope={activeTab}
          periodTitle={periodTitle}
          scopeState={scopeState}
          weeklyScopeStateForDaily={weeklyScopeStateForDaily}
          initialOpenStage={stageAccordionModalState.initialStage}
          tasksCount={{
            total: tasks.length,
            main: tasks.filter(t => !t.isAdditional).length,
            additional: tasks.filter(t => !!t.isAdditional).length,
            mainDone: tasks.filter(t => !t.isAdditional && t.status === 'done').length,
            mainPending: tasks.filter(t => !t.isAdditional && t.status !== 'done').length,
            additionalDone: tasks.filter(t => !!t.isAdditional && t.status === 'done').length,
            additionalPending: tasks.filter(t => !!t.isAdditional && t.status !== 'done').length,
            totalDone: tasks.filter(t => t.status === 'done').length,
            totalPending: tasks.filter(t => t.status !== 'done').length
          }}
        />
      )}

      {isCutiModalOpen && (
        <TalCutiModal
          isOpen={isCutiModalOpen}
          dateStr={currentDateStr}
          isAlreadyCuti={isCurrentDateCuti}
          existingReason={currentDateCutiReason}
          stage={currentStage}
          existingTasksCount={tasks.length}
          onConfirm={handleConfirmCuti}
          onClose={() => setIsCutiModalOpen(false)}
        />
      )}

      {copyModalState.isOpen && (
        <TalCopyDateModal
          isOpen={copyModalState.isOpen}
          type={activeTab}
          tasks={copyModalState.tasksToCopy}
          currentDateStr={currentDateStr}
          currentWeekNumber={selectedWeekNumber}
          currentWeekYear={selectedWeekYear}
          currentMonth={selectedMonth}
          currentYear={selectedYear}
          holidays={holidays}
          cutiRecords={cutiRecords}
          onConfirm={handleConfirmCopyDate}
          onClose={() => setCopyModalState({ isOpen: false, tasksToCopy: [] })}
        />
      )}

      {deleteModalState.isOpen && (
        <TalDeleteConfirmModal
          isOpen={deleteModalState.isOpen}
          itemCount={deleteModalState.taskIds.length}
          itemNames={deleteModalState.taskTitles}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteModalState({ isOpen: false, taskIds: [], taskTitles: [] })}
        />
      )}

      {/* 9.7 Modal Terapkan Template Rutinitas Kerja (WOORK) */}
      <TalApplyTemplateModal
        isOpen={isApplyTemplateModalOpen}
        template={applyTemplate}
        scopeType={activeTab}
        targetDateStr={currentDateStr}
        targetWeekNumber={activeTab === 'weekly' ? selectedWeekNumber : weekInfo.weekNumber}
        targetWeekYear={activeTab === 'weekly' ? selectedWeekYear : weekInfo.weekYear}
        targetMonth={activeTab === 'monthly' ? selectedMonth : parsedDate.getMonth() + 1}
        targetYear={activeTab === 'monthly' ? selectedYear : parsedDate.getFullYear()}
        onClose={() => {
          setIsApplyTemplateModalOpen(false);
          setApplyTemplate(null);
        }}
        onSuccess={(count, skipped) => {
          showToast('success', `${count} tugas dibuat dari template.${skipped.length ? ` ${skipped.length} dilewati.` : ''}`);
          loadData();
        }}
        onOpenManageTemplates={() => {
          setIsApplyTemplateModalOpen(false);
          router.push('/tal/templates');
        }}
      />

      {/* Modal: pilih template dulu (daftar ringkas, dipertahankan dari halaman WOORK lama) */}
      {isApplyTemplateModalOpen && !applyTemplate && (
        <ApplyTemplatePicker onPick={setApplyTemplate} onClose={() => setIsApplyTemplateModalOpen(false)} />
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ApplyTemplatePicker({ onPick, onClose }: { onPick: (t: TalRoutineTemplate) => void; onClose: () => void }) {
  const [templates, setTemplates] = useState<TalRoutineTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchTalRoutineTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return (
    <ModalShell title="Pilih Template Rutinitas" onClose={onClose}>
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Memuat template...</p>
      ) : templates.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Belum ada template. Buat template di <Link href="/tal/templates" className="font-semibold text-blue-600">halaman Template</Link>.
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t)}
              className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-blue-400 hover:bg-blue-50"
            >
              <p className="text-sm font-bold text-slate-900">{t.name} {t.isPreset && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">PRESET</span>}</p>
              {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.description}</p>}
              <p className="mt-1 text-[11px] text-slate-500">
                {(t.monthlyTasks?.length ?? 0)} bulanan • {(t.weeklyTasks?.length ?? 0)} mingguan • {(t.dailyTasks?.length ?? 0)} harian
              </p>
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
