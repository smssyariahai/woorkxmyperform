// TalAdminDatabaseTab — porting src/components/tal/TalAdminDatabaseTab.tsx
// (MyPerform backup) ke WOORK. Dipakai sebagai tab "Database TAL" di
// /tal/kalender-kerja (admin-only).
//
// Sub-tab: Kewajiban TAL User | Kunci Sistem TAL Bulan | Hapus Kunci Plan |
// Hapus Timestamp Report | Log Riwayat Aksi. Setiap aksi admin WAJIB
// disertai alasan (min. 3 karakter) dan dicatat di TalAuditLog oleh server.
//
// Adaptasi vs backup:
// - talService/Firebase -> API WOORK: /api/tal/team/settings (daftar user +
//   kewajiban per-user), /api/tal/obligations, /api/tal/locks/monthly,
//   /api/tal/locks/reports (?all=1 / batch-unlock / batch-reset / ?audit=1),
//   /api/tal/deadline-settings, /api/tal/holidays, /api/tal/cuti?all=1.
//   Respons dibungkus { success, data } (apiOk) — dibuka via `body.data ?? body`.
// - localStorage (tal_uid_registry / tal_cuti / tal_tasks) DIBUANG: nama user
//   diambil dari /api/tal/team/settings, identitas admin dari sesi server.
// - Sub-tab "Hapus Tugas User" TIDAK di-port: tidak ada endpoint admin untuk
//   query/hapus task user lain (GET /api/tal/tasks dan batch-delete memaksa
//   userId = sesi). Perlu endpoint baru dari koordinator bila fitur ini mau ada.
// - Kunci bulanan WOORK bersifat per-user (TalMonthlyLock key
//   organizationId+userId+year+month); POST tanpa userId mengunci baris milik
//   admin sendiri (perilaku sama seperti halaman kalender-kerja saat ini).
// - TalPills (PriorityPill/StatusPill) tidak dipakai: satu-satunya pemakai
//   di backup adalah tabel hapus-task, dan sub-tab itu tidak di-port
//   (lihat poin di atas). Bila sub-tab itu ditambahkan nanti, impor pill
//   dari @/components/tal/TalPills bila sudah dibuat grup lain.
// - Default kewajiban WOORK: semua wajib (keputusan §5.6), bukan monthly=false
//   untuk staff seperti backup.
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Users, Unlock, RotateCcw, History, Search, Filter, CheckCircle2,
  AlertCircle, AlertTriangle, Clock, Sliders, Check, X, ChevronDown,
  ShieldCheck, Save, RefreshCw, Lock, ChevronLeft, ChevronRight,
  UserX, Palmtree,
} from 'lucide-react';
import type {
  TalScopeLockReport,
  TalUserObligation,
  TalTaskType,
  TalDeadlineSettings,
  TalHolidayItem,
  TalMonthLockRecord,
  TalAuditLog,
} from '@/lib/tal/types';
import {
  fetchTalDeadlineSettings,
  fetchTalHolidays,
  fetchMyMonthLocks,
  type TalMonthLockItem,
} from '@/lib/tal/client';
import {
  INDONESIAN_MONTHS,
  checkIsTalMonthLocked,
  formatTalScopePeriod,
  getSundayFromWeekNumber,
  getWeekDetails,
} from '@/lib/tal/date';

// ---------------------------------------------------------------------------
// Helper fetch (endpoint admin tanpa wrapper di lib/tal/client.ts)
// ---------------------------------------------------------------------------
async function apiJson(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || body?.message || `Permintaan ${path} gagal (${res.status})`);
  return body.data ?? body;
}

// ---------------------------------------------------------------------------
// Tipe lokal
// ---------------------------------------------------------------------------
interface TeamSettingsUser {
  id: string;
  email: string;
  nama: string;
  divisi: string;
  posisi: string;
  role: string;
  isActive: boolean;
  manajerAtasanId: string;
}

interface ObligationDraft {
  userId: string;
  userEmail: string;
  userName: string;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
}

interface LockFilter {
  userId: string; // '' = semua user
  scopeTypes: TalTaskType[];
  periodMode: 'all' | 'date_range' | 'weeks' | 'months' | 'years';
  startDate: string;
  endDate: string;
  selectedWeek: number | '';
  selectedWeekYear: number;
  selectedMonth: number;
  selectedMonthYear: number;
  selectedYear: number;
  onlyLocked: boolean;
  onlyReported: boolean;
}

const DEFAULT_LOCK_FILTER = (scopeTypes: TalTaskType[], onlyLocked: boolean, onlyReported: boolean): LockFilter => ({
  userId: '',
  scopeTypes,
  periodMode: 'all',
  startDate: '',
  endDate: '',
  selectedWeek: '',
  selectedWeekYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  selectedMonthYear: new Date().getFullYear(),
  selectedYear: new Date().getFullYear(),
  onlyLocked,
  onlyReported,
});

type SubTab = 'obligations' | 'month_locks' | 'unlock_plans' | 'reset_reports' | 'audit_logs';

// Pemetaan baris mentah /api/tal/locks/reports ke bentuk TalScopeLockReport
// (sama seperti mapRawLock di lib/tal/client.ts — tidak diekspor dari sana).
function mapRawLock(r: any): TalScopeLockReport {
  const p = (r.payload ?? {}) as Record<string, any>;
  return {
    id: r.id as string,
    scope: r.scope as TalTaskType,
    scopeKey: r.scopeKey as string,
    userId: r.userId as string,
    userEmail: p.userEmail,
    userName: p.userName,
    type: r.scope as TalTaskType,
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.scopeKey) ? r.scopeKey : undefined,
    weekNumber: p.weekNumber,
    weekYear: p.weekYear,
    month: p.month,
    year: p.year,
    infoTglTask: p.infoTglTask,
    isPlanLocked: !!r.isPlanLocked,
    planLockedAt: r.planLockedAt ?? undefined,
    lockedBy: p.lockedBy,
    lockNotes: p.lockNotes,
    taskCount: p.taskCount,
    planScore: p.planScore,
    planDeadlineAt: p.planDeadlineAt,
    progressScore: p.progressScore,
    isReported: !!r.isReported,
    reportedAt: r.reportedAt ?? undefined,
    reportedBy: p.reportedBy,
    reportNotes: p.reportNotes,
    reportScore: p.reportScore,
    reportDeadlineAt: p.reportDeadlineAt,
    totalTaskCount: p.totalTaskCount,
    mainTaskCount: p.mainTaskCount,
    additionalTaskCount: p.additionalTaskCount,
    doneTaskCount: p.doneTaskCount,
    pendingTaskCount: p.pendingTaskCount,
    scorePercent: p.scorePercent,
    mainDoneCount: p.mainDoneCount,
    mainPendingCount: p.mainPendingCount,
    additionalDoneCount: p.additionalDoneCount,
    additionalPendingCount: p.additionalPendingCount,
    reportSummary: p.reportSummary,
    isCuti: p.isCuti,
    cutiReason: p.cutiReason,
  };
}

// Apakah sebuah lock report cocok dengan filter periode (client-side).
function lockMatchesPeriod(r: TalScopeLockReport, f: LockFilter): boolean {
  if (f.periodMode === 'all') return true;
  const sk = r.scopeKey || '';
  if (f.periodMode === 'date_range') {
    if (!f.startDate || !f.endDate) return true;
    if (r.scope === 'daily') return sk >= f.startDate && sk <= f.endDate;
    if (r.scope === 'weekly' && r.weekNumber && r.weekYear) {
      const sunday = getSundayFromWeekNumber(r.weekYear, r.weekNumber);
      const key = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
      return key >= f.startDate && key <= f.endDate;
    }
    if (r.scope === 'monthly' && r.month && r.year) {
      const mk = `${r.year}-${String(r.month).padStart(2, '0')}`;
      return mk >= f.startDate.slice(0, 7) && mk <= f.endDate.slice(0, 7);
    }
    return true;
  }
  if (f.periodMode === 'weeks') {
    if (f.selectedWeek === '') return true;
    if (r.scope === 'weekly') return r.weekNumber === f.selectedWeek && r.weekYear === f.selectedWeekYear;
    if (r.scope === 'daily' && r.date) {
      const [y, m, d] = r.date.split('-').map(Number);
      const wd = getWeekDetails(new Date(Date.UTC(y, m - 1, d)));
      return wd.weekNumber === f.selectedWeek && wd.weekYear === f.selectedWeekYear;
    }
    return false;
  }
  if (f.periodMode === 'months') {
    if (r.scope === 'monthly') return r.month === f.selectedMonth && r.year === f.selectedMonthYear;
    if (r.scope === 'daily' && r.date) {
      const [y, m] = r.date.split('-').map(Number);
      return y === f.selectedMonthYear && m === f.selectedMonth;
    }
    if (r.scope === 'weekly' && r.weekNumber && r.weekYear) {
      const wd = getWeekDetails(getSundayFromWeekNumber(r.weekYear, r.weekNumber));
      return wd.majorityMonth === f.selectedMonth && wd.weekYear === f.selectedMonthYear;
    }
    return false;
  }
  // years
  if (r.scope === 'daily' && r.date) return Number(r.date.slice(0, 4)) === f.selectedYear;
  if (r.scope === 'weekly') return r.weekYear === f.selectedYear;
  if (r.scope === 'monthly') return r.year === f.selectedYear;
  return sk.startsWith(String(f.selectedYear));
}

function lockMatchesFilter(r: TalScopeLockReport, f: LockFilter, userEmailOf: (userId: string) => string): boolean {
  if (f.userId) {
    const email = (r.userEmail || userEmailOf(r.userId) || '').toLowerCase();
    const target = userEmailOf(f.userId).toLowerCase();
    if (r.userId !== f.userId && email !== target) return false;
  }
  if (!f.scopeTypes.includes(r.scope)) return false;
  if (f.onlyLocked && !r.isPlanLocked) return false;
  if (f.onlyReported && !r.isReported) return false;
  return lockMatchesPeriod(r, f);
}

export function TalAdminDatabaseTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('obligations');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = useCallback((type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 4500);
  }, []);

  // ---- Daftar user (dipakai semua sub-tab) ----
  const [usersList, setUsersList] = useState<TeamSettingsUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const userById = useMemo(() => new Map(usersList.map((u) => [u.id, u])), [usersList]);
  const userEmailOf = useCallback((userId: string) => userById.get(userId)?.email || '', [userById]);
  const getUserDisplayInfo = useCallback(
    (userId?: string, userEmail?: string, userName?: string) => {
      const u = (userId && userById.get(userId)) || usersList.find((x) => x.email.toLowerCase() === (userEmail || '').toLowerCase());
      if (u) return { name: u.nama || u.email, email: u.email, photo: undefined as string | undefined };
      if (userName && userName.trim() && !userName.startsWith('User ')) return { name: userName, email: userEmail || '', photo: undefined };
      if (userEmail && userEmail.trim()) return { name: userEmail.split('@')[0], email: userEmail, photo: undefined };
      if (userId && userId.includes('@')) return { name: userId.split('@')[0], email: userId, photo: undefined };
      return { name: 'Pengguna', email: '', photo: undefined };
    },
    [userById, usersList],
  );

  // ---- Sub-tab 1: kewajiban ----
  const [obligations, setObligations] = useState<Record<string, ObligationDraft>>({});
  const [savedObligations, setSavedObligations] = useState<Record<string, ObligationDraft>>({});
  const [loadingObligations, setLoadingObligations] = useState(false);
  const [savingObligations, setSavingObligations] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [obligationFilter, setObligationFilter] = useState<'all' | 'customized' | 'all_active'>('all');
  const [obligationReason, setObligationReason] = useState('');

  const hasUnsavedObligations = useMemo(
    () =>
      Object.keys(obligations).some((k) => {
        const a = obligations[k];
        const b = savedObligations[k];
        return !b || a.daily !== b.daily || a.weekly !== b.weekly || a.monthly !== b.monthly;
      }),
    [obligations, savedObligations],
  );

  // ---- Sub-tab 2: kunci bulan ----
  const [monthLocks, setMonthLocks] = useState<TalMonthLockRecord[]>([]);
  const [deadlineSettings, setDeadlineSettings] = useState<TalDeadlineSettings | null>(null);
  const [holidays, setHolidays] = useState<TalHolidayItem[]>([]);
  const [cutiDates, setCutiDates] = useState<{ date: string; reason?: string }[]>([]);
  const [monthLockSelectedYear, setMonthLockSelectedYear] = useState<number>(new Date().getFullYear());
  const [loadingMonthLocks, setLoadingMonthLocks] = useState(false);
  const [isMonthLockModalOpen, setIsMonthLockModalOpen] = useState(false);
  const [monthLockTarget, setMonthLockTarget] = useState<{
    year: number; month: number; monthName: string;
    action: 'lock' | 'unlock' | 'reset_auto'; isCurrentlyLocked: boolean;
  } | null>(null);
  const [monthLockReason, setMonthLockReason] = useState('');
  const [isSubmittingMonthLock, setIsSubmittingMonthLock] = useState(false);

  // ---- Sub-tab 3 & 4: kunci plan / reset laporan ----
  const [unlockFilter, setUnlockFilter] = useState<LockFilter>(() => DEFAULT_LOCK_FILTER(['weekly', 'monthly'], true, false));
  const [reportResetFilter, setReportResetFilter] = useState<LockFilter>(() => DEFAULT_LOCK_FILTER(['daily', 'weekly', 'monthly'], false, true));
  const [isUnlockFilterOpen, setIsUnlockFilterOpen] = useState(true);
  const [isReportFilterOpen, setIsReportFilterOpen] = useState(true);
  const [allLockReports, setAllLockReports] = useState<TalScopeLockReport[]>([]);
  const [lockReportsLoaded, setLockReportsLoaded] = useState(false);
  const [loadingLocks, setLoadingLocks] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [queriedLocks, setQueriedLocks] = useState<TalScopeLockReport[]>([]);
  const [queriedReports, setQueriedReports] = useState<TalScopeLockReport[]>([]);
  const [selectedLockIds, setSelectedLockIds] = useState<Set<string>>(new Set());
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());
  const [hasSearchedLocks, setHasSearchedLocks] = useState(false);
  const [hasSearchedReports, setHasSearchedReports] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isResetReportModalOpen, setIsResetReportModalOpen] = useState(false);
  const [resetReportReason, setResetReportReason] = useState('');
  const [isResettingReports, setIsResettingReports] = useState(false);

  // ---- Sub-tab 5: audit log ----
  const [auditLogs, setAuditLogs] = useState<TalAuditLog[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditLogSearch, setAuditLogSearch] = useState('');

  // ----------------------------------------------------
  // Load awal: daftar user + kewajiban tersimpan
  // ----------------------------------------------------
  const loadInitialData = useCallback(async () => {
    setLoadingUsers(true);
    setLoadingObligations(true);
    try {
      const s = await apiJson('/api/tal/team/settings');
      const users = (s.users || []) as TeamSettingsUser[];
      setUsersList(users);
      const oblMap: Record<string, ObligationDraft> = {};
      for (const u of users) {
        oblMap[u.id] = {
          userId: u.id, userEmail: u.email, userName: u.nama,
          daily: true, weekly: true, monthly: true,
        };
      }
      for (const o of (s.obligations || []) as TalUserObligation[]) {
        if (o.userId && oblMap[o.userId]) {
          oblMap[o.userId] = { ...oblMap[o.userId], daily: !!o.daily, weekly: !!o.weekly, monthly: !!o.monthly };
        }
      }
      setObligations(oblMap);
      setSavedObligations(oblMap);
    } catch (e: any) {
      showFeedback('error', e?.message || 'Gagal memuat data pengguna dan kewajiban TAL');
    } finally {
      setLoadingUsers(false);
      setLoadingObligations(false);
    }
  }, [showFeedback]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const loadMonthLocksData = useCallback(async () => {
    setLoadingMonthLocks(true);
    try {
      const [locksData, dlSettings, holidaysData, cutiData] = await Promise.all([
        fetchMyMonthLocks(),
        fetchTalDeadlineSettings(),
        fetchTalHolidays(),
        apiJson('/api/tal/cuti?all=1'),
      ]);
      setMonthLocks(
        (locksData as TalMonthLockItem[]).map((l) => ({
          monthKey: l.monthKey,
          year: l.year,
          month: l.month,
          isLocked: l.isLocked,
          manualOverride: l.manualOverride,
          reason: l.reason,
          lockedBy: l.lockedBy,
          lockedAt: l.lockedAt,
          updatedAt: l.lockedAt || '',
        })),
      );
      setDeadlineSettings(dlSettings);
      setHolidays(holidaysData);
      setCutiDates(((cutiData.cuti || []) as any[]).map((c) => ({ date: c.date, reason: c.reason })));
    } catch (e: any) {
      showFeedback('error', e?.message || 'Gagal memuat status kunci sistem bulanan');
    } finally {
      setLoadingMonthLocks(false);
    }
  }, [showFeedback]);

  useEffect(() => {
    if (activeSubTab === 'month_locks') loadMonthLocksData();
  }, [activeSubTab, loadMonthLocksData]);

  const loadAuditLogs = useCallback(async () => {
    setLoadingAuditLogs(true);
    try {
      const d = await apiJson('/api/tal/locks/reports?audit=1');
      setAuditLogs((d.auditLogs || []) as TalAuditLog[]);
    } catch (e: any) {
      showFeedback('error', e?.message || 'Gagal memuat audit log TAL');
    } finally {
      setLoadingAuditLogs(false);
    }
  }, [showFeedback]);

  useEffect(() => {
    if (activeSubTab === 'audit_logs') loadAuditLogs();
  }, [activeSubTab, loadAuditLogs]);

  const ensureLockReports = useCallback(async () => {
    if (lockReportsLoaded) return allLockReports;
    const d = await apiJson('/api/tal/locks/reports?all=1');
    const rows = ((d.reports || []) as any[]).map(mapRawLock);
    setAllLockReports(rows);
    setLockReportsLoaded(true);
    return rows;
  }, [lockReportsLoaded, allLockReports]);

  // ----------------------------------------------------
  // Handler kewajiban
  // ----------------------------------------------------
  const handleToggleObligation = (userId: string, field: 'daily' | 'weekly' | 'monthly') => {
    setObligations((prev) => {
      const cur = prev[userId];
      if (!cur) return prev;
      return { ...prev, [userId]: { ...cur, [field]: !cur[field] } };
    });
  };

  const handleSetAllObligations = (field: 'daily' | 'weekly' | 'monthly' | 'all', value: boolean) => {
    setObligations((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        next[key] = field === 'all'
          ? { ...next[key], daily: value, weekly: value, monthly: value }
          : { ...next[key], [field]: value };
      });
      return next;
    });
  };

  const handleSaveObligations = async () => {
    if (!obligationReason.trim() || obligationReason.trim().length < 3) {
      showFeedback('error', 'Alasan perubahan wajib diisi (minimal 3 karakter) — dicatat di audit log.');
      return;
    }
    const changed = Object.values(obligations).filter((o) => {
      const b = savedObligations[o.userId];
      return !b || o.daily !== b.daily || o.weekly !== b.weekly || o.monthly !== b.monthly;
    });
    if (changed.length === 0) {
      showFeedback('success', 'Tidak ada perubahan kewajiban untuk disimpan.');
      return;
    }
    setSavingObligations(true);
    try {
      for (const o of changed) {
        await apiJson('/api/tal/team/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'obligation', userId: o.userId,
            daily: o.daily, weekly: o.weekly, monthly: o.monthly,
            reason: obligationReason.trim(),
          }),
        });
      }
      setSavedObligations({ ...obligations });
      showFeedback('success', `Berhasil menyimpan pengaturan kewajiban TAL untuk ${changed.length} pengguna`);
    } catch (e: any) {
      showFeedback('error', e?.message || 'Gagal menyimpan pengaturan kewajiban TAL');
    } finally {
      setSavingObligations(false);
    }
  };

  const filteredUsersList = useMemo(() => {
    let result = usersList;
    if (userSearchQuery.trim()) {
      const q = userSearchQuery.toLowerCase().trim();
      result = result.filter((u) =>
        (u.nama || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.divisi || '').toLowerCase().includes(q) ||
        (u.posisi || '').toLowerCase().includes(q),
      );
    }
    if (obligationFilter === 'customized') {
      result = result.filter((u) => {
        const obl = obligations[u.id];
        return obl && (!obl.daily || !obl.weekly || !obl.monthly);
      });
    } else if (obligationFilter === 'all_active') {
      result = result.filter((u) => {
        const obl = obligations[u.id];
        return !obl || (obl.daily && obl.weekly && obl.monthly);
      });
    }
    return result;
  }, [usersList, userSearchQuery, obligationFilter, obligations]);

  // ----------------------------------------------------
  // Handler kunci bulan
  // ----------------------------------------------------
  const handleOpenMonthLockModal = (monthNumber: number, action: 'lock' | 'unlock' | 'reset_auto', isCurrentlyLocked: boolean) => {
    setMonthLockTarget({
      year: monthLockSelectedYear,
      month: monthNumber,
      monthName: INDONESIAN_MONTHS[monthNumber - 1],
      action,
      isCurrentlyLocked,
    });
    setMonthLockReason('');
    setIsMonthLockModalOpen(true);
  };

  const handleConfirmMonthLockAction = async () => {
    if (!monthLockTarget) return;
    if (!monthLockReason.trim() || monthLockReason.trim().length < 3) {
      showFeedback('error', 'Alasan tindakan wajib diisi (minimal 3 karakter)');
      return;
    }
    const monthKey = `${monthLockTarget.year}-${String(monthLockTarget.month).padStart(2, '0')}`;
    setIsSubmittingMonthLock(true);
    try {
      if (monthLockTarget.action === 'lock') {
        await apiJson('/api/tal/locks/monthly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthKey, isLocked: true, reason: monthLockReason.trim() }),
        });
        showFeedback('success', `Berhasil mengunci sistem TAL Bulan ${monthLockTarget.monthName} ${monthLockTarget.year} secara manual.`);
      } else if (monthLockTarget.action === 'unlock') {
        await apiJson('/api/tal/locks/monthly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthKey, isLocked: false, reason: monthLockReason.trim() }),
        });
        showFeedback('success', `Berhasil membuka kunci sistem TAL Bulan ${monthLockTarget.monthName} ${monthLockTarget.year}. User kini dapat kembali mengakses.`);
      } else {
        await apiJson(
          `/api/tal/locks/monthly?monthKey=${encodeURIComponent(monthKey)}&reason=${encodeURIComponent(monthLockReason.trim())}`,
          { method: 'DELETE' },
        );
        showFeedback('success', `Berhasil mengembalikan status kunci TAL Bulan ${monthLockTarget.monthName} ${monthLockTarget.year} ke jadwal otomatis sistem.`);
      }
      await loadMonthLocksData();
      setIsMonthLockModalOpen(false);
      setMonthLockTarget(null);
    } catch (e: any) {
      showFeedback('error', e?.message || 'Gagal memproses aksi status kunci sistem bulanan');
    } finally {
      setIsSubmittingMonthLock(false);
    }
  };

  // ----------------------------------------------------
  // Handler kunci plan / reset laporan
  // ----------------------------------------------------
  const handleSearchLocks = async () => {
    setLoadingLocks(true);
    setHasSearchedLocks(true);
    setSelectedLockIds(new Set());
    try {
      const rows = await ensureLockReports();
      const results = rows.filter((r) => lockMatchesFilter(r, unlockFilter, userEmailOf));
      results.sort((a, b) => (b.planLockedAt || '').localeCompare(a.planLockedAt || ''));
      setQueriedLocks(results);
    } catch (e: any) {
      showFeedback('error', e?.message || 'Gagal mencari status kunci rencana');
    } finally {
      setLoadingLocks(false);
    }
  };

  const handleSearchReports = async () => {
    setLoadingReports(true);
    setHasSearchedReports(true);
    setSelectedReportIds(new Set());
    try {
      const rows = await ensureLockReports();
      const results = rows.filter((r) => lockMatchesFilter(r, reportResetFilter, userEmailOf));
      results.sort((a, b) => (b.reportedAt || '').localeCompare(a.reportedAt || ''));
      setQueriedReports(results);
    } catch (e: any) {
      showFeedback('error', e?.message || 'Gagal mencari data laporan');
    } finally {
      setLoadingReports(false);
    }
  };

  const toggleSelect = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) => {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const handleToggleSelectLock = toggleSelect(setSelectedLockIds);
  const handleToggleSelectReport = toggleSelect(setSelectedReportIds);

  const handleSelectAllLocks = () => {
    setSelectedLockIds((prev) =>
      prev.size === queriedLocks.length ? new Set() : new Set(queriedLocks.map((l) => l.id)),
    );
  };
  const handleSelectAllReports = () => {
    setSelectedReportIds((prev) =>
      prev.size === queriedReports.length ? new Set() : new Set(queriedReports.map((r) => r.id)),
    );
  };

  const handleConfirmUnlock = async () => {
    if (!unlockReason.trim() || unlockReason.trim().length < 3) {
      showFeedback('error', 'Alasan pembukaan kunci wajib diisi (minimal 3 karakter)');
      return;
    }
    const idsToUnlock = Array.from(selectedLockIds);
    setIsUnlocking(true);
    try {
      await apiJson('/api/tal/locks/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch-unlock',
          ids: idsToUnlock,
          reason: unlockReason.trim(),
        }),
      });
      setQueriedLocks((prev) =>
        prev.map((l) =>
          selectedLockIds.has(l.id)
            ? { ...l, isPlanLocked: false, planLockedAt: undefined, lockedBy: undefined }
            : l,
        ),
      );
      setAllLockReports((prev) =>
        prev.map((l) => (selectedLockIds.has(l.id) ? { ...l, isPlanLocked: false, planLockedAt: undefined } : l)),
      );
      setSelectedLockIds(new Set());
      setIsUnlockModalOpen(false);
      showFeedback('success', `Berhasil membuka kunci plan pada ${idsToUnlock.length} periode.`);
    } catch (e: any) {
      showFeedback('error', e?.message || 'Gagal membuka kunci plan');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleConfirmResetReport = async () => {
    if (!resetReportReason.trim() || resetReportReason.trim().length < 3) {
      showFeedback('error', 'Alasan reset laporan wajib diisi (minimal 3 karakter)');
      return;
    }
    const idsToReset = Array.from(selectedReportIds);
    setIsResettingReports(true);
    try {
      await apiJson('/api/tal/locks/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch-reset',
          ids: idsToReset,
          reason: resetReportReason.trim(),
        }),
      });
      setQueriedReports((prev) =>
        prev.map((r) =>
          selectedReportIds.has(r.id)
            ? { ...r, isReported: false, reportedAt: undefined, reportedBy: undefined, scorePercent: undefined, reportSummary: undefined }
            : r,
        ),
      );
      setAllLockReports((prev) =>
        prev.map((r) => (selectedReportIds.has(r.id) ? { ...r, isReported: false, reportedAt: undefined } : r)),
      );
      setSelectedReportIds(new Set());
      setIsResetReportModalOpen(false);
      showFeedback('success', `Berhasil mereset timestamp report pada ${idsToReset.length} periode.`);
    } catch (e: any) {
      showFeedback('error', e?.message || 'Gagal mereset status laporan');
    } finally {
      setIsResettingReports(false);
    }
  };

  const filteredAuditLogs = useMemo(() => {
    const q = auditLogSearch.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter((l) =>
      `${l.actionTitle || ''} ${l.actionType || ''} ${l.adminName || ''} ${l.adminEmail || ''} ${l.targetSummary || ''} ${l.reason || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [auditLogs, auditLogSearch]);

  const getCutiInfoForReport = (report: TalScopeLockReport) => {
    if (report.isCuti) return { isCuti: true, reason: report.cutiReason || 'Cuti' };
    const formula = (report.reportSummary?.formula || '').toLowerCase();
    const notes = (report.reportSummary?.notes || '').toLowerCase();
    if (formula.includes('cuti') || notes.includes('cuti')) {
      return { isCuti: true, reason: report.reportSummary?.notes || 'Cuti' };
    }
    return { isCuti: false, reason: '' };
  };

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode; activeClass: string }[] = [
    { id: 'obligations', label: 'Kewajiban TAL User', icon: <Users size={15} />, activeClass: 'bg-white text-blue-700 shadow-xs' },
    { id: 'month_locks', label: 'Hapus Kunci Sistem TAL Bulan', icon: <Lock size={15} />, activeClass: 'bg-white text-rose-700 shadow-xs' },
    { id: 'unlock_plans', label: 'Hapus Kunci Plan', icon: <Unlock size={15} />, activeClass: 'bg-white text-amber-700 shadow-xs' },
    { id: 'reset_reports', label: 'Hapus Timestamp Report', icon: <RotateCcw size={15} />, activeClass: 'bg-white text-emerald-700 shadow-xs' },
    { id: 'audit_logs', label: 'Log Riwayat Aksi', icon: <History size={15} />, activeClass: 'bg-white text-slate-900 shadow-xs' },
  ];

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 shadow-md ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-rose-600 shrink-0" />
            )}
            <span className="text-xs sm:text-sm font-semibold">{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200 flex flex-wrap sm:flex-nowrap items-center gap-1">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveSubTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              activeSubTab === t.id ? t.activeClass : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ======================================================== */}
      {/* 1. SUB-TAB: KEWAJIBAN TAL USER */}
      {/* ======================================================== */}
      {activeSubTab === 'obligations' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="text-blue-600" size={20} />
                <span>Pengaturan Kewajiban Membuat TAL Per User</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tentukan tipe periode TAL (Harian, Mingguan, Bulanan) yang wajib diisi oleh masing-masing pengguna.
                Jika suatu tipe dinonaktifkan, tab tersebut akan <strong>otomatis tersembunyi (hidden)</strong> pada halaman TAL user bersangkutan.
              </p>
            </div>
            <div className="flex items-center gap-2 self-end md:self-auto">
              <button
                type="button"
                onClick={handleSaveObligations}
                disabled={savingObligations}
                className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 ${
                  hasUnsavedObligations ? 'ring-2 ring-blue-400 ring-offset-2 animate-pulse' : ''
                }`}
              >
                {savingObligations ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                <span>Simpan Pengaturan</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Alasan perubahan (wajib — dicatat di audit log)
            </label>
            <input
              type="text"
              value={obligationReason}
              onChange={(e) => setObligationReason(e.target.value)}
              placeholder="Contoh: Penyesuaian kewajiban TAL per SK direksi ..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Cari nama, email, divisi..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              {userSearchQuery && (
                <button
                  type="button"
                  onClick={() => setUserSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={obligationFilter}
                onChange={(e) => setObligationFilter(e.target.value as any)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="all">Semua pengguna</option>
                <option value="customized">Hanya yang dikustomisasi</option>
                <option value="all_active">Hanya yang semua aktif</option>
              </select>
              <button type="button" onClick={() => handleSetAllObligations('all', true)} className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition">
                Centang Semua
              </button>
              <button type="button" onClick={() => handleSetAllObligations('daily', true)} className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition">
                Wajibkan Harian Semua
              </button>
              <button type="button" onClick={() => handleSetAllObligations('weekly', true)} className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold transition">
                Wajibkan Mingguan Semua
              </button>
              <button type="button" onClick={() => handleSetAllObligations('monthly', true)} className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition">
                Wajibkan Bulanan Semua
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4">Nama & Profil User</th>
                  <th className="py-3 px-4">Divisi & Role</th>
                  <th className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-blue-700 font-bold">TAL Harian</span>
                      <button type="button" onClick={() => handleSetAllObligations('daily', !Object.values(obligations).every((o) => o.daily))} title="Toggle Semua Harian" className="text-slate-400 hover:text-blue-600">
                        <Check size={13} />
                      </button>
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-amber-700 font-bold">TAL Mingguan</span>
                      <button type="button" onClick={() => handleSetAllObligations('weekly', !Object.values(obligations).every((o) => o.weekly))} title="Toggle Semua Mingguan" className="text-slate-400 hover:text-amber-600">
                        <Check size={13} />
                      </button>
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-emerald-700 font-bold">TAL Bulanan</span>
                      <button type="button" onClick={() => handleSetAllObligations('monthly', !Object.values(obligations).every((o) => o.monthly))} title="Toggle Semua Bulanan" className="text-slate-400 hover:text-emerald-600">
                        <Check size={13} />
                      </button>
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">Status Akses Tab</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingUsers || loadingObligations ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw size={16} className="animate-spin text-blue-600" />
                        <span>Memuat data kewajiban pengguna...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredUsersList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">Tidak ada pengguna yang cocok dengan kriteria pencarian.</td>
                  </tr>
                ) : (
                  filteredUsersList.map((userItem, idx) => {
                    const obl = obligations[userItem.id] || { userId: userItem.id, userEmail: userItem.email, userName: userItem.nama, daily: true, weekly: true, monthly: true };
                    const isAllActive = obl.daily && obl.weekly && obl.monthly;
                    const isAllInactive = !obl.daily && !obl.weekly && !obl.monthly;
                    return (
                      <tr key={userItem.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase">
                              {(userItem.nama || 'U').slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{userItem.nama}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{userItem.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-700 font-medium">{userItem.posisi || userItem.role || '-'}</div>
                          <div className="text-[11px] text-slate-400">{userItem.divisi || 'Semua Divisi'}</div>
                        </td>
                        {(
                          [
                            ['daily', 'Wajib', 'Hidden', 'text-blue-600', 'text-blue-700'],
                            ['weekly', 'Wajib', 'Hidden', 'text-amber-600', 'text-amber-700'],
                            ['monthly', 'Wajib', 'Hidden', 'text-emerald-600', 'text-emerald-700'],
                          ] as const
                        ).map(([field, onLabel, offLabel, checkClass, labelClass]) => (
                          <td key={field} className="py-3 px-4 text-center">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={obl[field]}
                                onChange={() => handleToggleObligation(userItem.id, field)}
                                className={`w-4 h-4 rounded border-slate-300 focus:ring-blue-500 cursor-pointer ${checkClass}`}
                              />
                              <span className={`text-[11px] font-semibold ${obl[field] ? labelClass : 'text-slate-400 line-through'}`}>
                                {obl[field] ? onLabel : offLabel}
                              </span>
                            </label>
                          </td>
                        ))}
                        <td className="py-3 px-4 text-center">
                          {isAllActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-bold text-[10px]">
                              <CheckCircle2 size={12} /> Semua Tab Aktif
                            </span>
                          ) : isAllInactive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full font-bold text-[10px]">
                              <UserX size={12} /> Semua Tab Nonaktif
                            </span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              {obl.daily && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">Harian</span>}
                              {obl.weekly && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-bold">Mingguan</span>}
                              {obl.monthly && <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">Bulanan</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. SUB-TAB: KUNCI SISTEM TAL BULAN */}
      {/* ======================================================== */}
      {activeSubTab === 'month_locks' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Lock className="text-rose-600" size={20} />
                <span>Kunci Sistem TAL Bulanan & Buka Kunci (TAL System Lock)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelola status kunci sistem TAL bulanan. Administrator dapat <strong>Membuka Kunci</strong> bulan yang sudah terkunci (agar user dapat kembali mengubah/membuat tugas/laporan) atau <strong>Mengunci Manual</strong> bulan sebelum jadwal otomatis tercapai.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start md:self-auto">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button type="button" onClick={() => setMonthLockSelectedYear((p) => p - 1)} className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition" title="Tahun Sebelumnya">
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 text-xs font-bold text-slate-800 select-none">Tahun {monthLockSelectedYear}</span>
                <button type="button" onClick={() => setMonthLockSelectedYear((p) => p + 1)} className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition" title="Tahun Berikutnya">
                  <ChevronRight size={16} />
                </button>
              </div>
              <button type="button" onClick={loadMonthLocksData} disabled={loadingMonthLocks} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">
                <RefreshCw size={14} className={loadingMonthLocks ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh Data</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Aturan Kunci Otomatis</span>
              <div className="flex items-center gap-2 mt-1">
                <Clock size={16} className="text-blue-600" />
                <span className="text-sm font-extrabold text-slate-800">
                  H+{deadlineSettings?.systemLockMonthlyDays ?? 5} Hari Kerja ({deadlineSettings?.systemLockMonthlyTime || '16:00'} WIB)
                </span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Dihitung dari akhir bulan kalender</span>
            </div>
            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-xl">
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Total Bulan Terkunci ({monthLockSelectedYear})</span>
              <div className="flex items-center gap-2 mt-1">
                <Lock size={16} className="text-rose-600" />
                <span className="text-base font-extrabold text-rose-900">
                  {INDONESIAN_MONTHS.filter((_, idx) => checkIsTalMonthLocked(monthLockSelectedYear, idx + 1, holidays, deadlineSettings, monthLocks, new Date(), cutiDates).isLocked).length} / 12 Bulan
                </span>
              </div>
              <span className="text-[10px] text-rose-600/80 mt-0.5 block">Seluruh data TAL pada bulan ini dikunci</span>
            </div>
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Total Bulan Terbuka ({monthLockSelectedYear})</span>
              <div className="flex items-center gap-2 mt-1">
                <Unlock size={16} className="text-emerald-600" />
                <span className="text-base font-extrabold text-emerald-900">
                  {INDONESIAN_MONTHS.filter((_, idx) => !checkIsTalMonthLocked(monthLockSelectedYear, idx + 1, holidays, deadlineSettings, monthLocks, new Date(), cutiDates).isLocked).length} / 12 Bulan
                </span>
              </div>
              <span className="text-[10px] text-emerald-600/80 mt-0.5 block">User bebas mengisi & mengelola TAL</span>
            </div>
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Override Manual Admin</span>
              <div className="flex items-center gap-2 mt-1">
                <Sliders size={16} className="text-amber-600" />
                <span className="text-base font-extrabold text-amber-900">
                  {INDONESIAN_MONTHS.filter((_, idx) => checkIsTalMonthLocked(monthLockSelectedYear, idx + 1, holidays, deadlineSettings, monthLocks, new Date(), cutiDates).isManualOverride).length} Bulan
                </span>
              </div>
              <span className="text-[10px] text-amber-600/80 mt-0.5 block">Status dikendalikan manual oleh Admin</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold text-[11px]">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4 min-w-[140px]">Bulan & Periode</th>
                  <th className="py-3 px-4 min-w-[180px]">Batas Kunci Otomatis</th>
                  <th className="py-3 px-4 min-w-[190px]">Status Kunci Sistem</th>
                  <th className="py-3 px-4 min-w-[220px]">Keterangan & Catatan Admin</th>
                  <th className="py-3 px-4 min-w-[200px] text-right">Aksi Administrator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {INDONESIAN_MONTHS.map((mName, idx) => {
                  const monthNum = idx + 1;
                  const monthKey = `${monthLockSelectedYear}-${String(monthNum).padStart(2, '0')}`;
                  const lockStatus = checkIsTalMonthLocked(monthLockSelectedYear, monthNum, holidays, deadlineSettings, monthLocks, new Date(), cutiDates);
                  const isCurrentMonth = new Date().getFullYear() === monthLockSelectedYear && new Date().getMonth() === idx;
                  return (
                    <tr key={monthKey} className={`hover:bg-slate-50/80 transition-colors ${isCurrentMonth ? 'bg-blue-50/30' : ''}`}>
                      <td className="py-3 px-4 text-center font-bold text-slate-500">{String(monthNum).padStart(2, '0')}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{mName} {monthLockSelectedYear}</span>
                          {isCurrentMonth && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold uppercase">Bulan Ini</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {monthKey}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                          <Clock size={13} className="text-slate-400 shrink-0" />
                          <span>{lockStatus.deadlineDateStr} ({lockStatus.deadlineTimeStr} WIB)</span>
                        </div>
                        <span className="text-[10px] text-slate-400">H+{deadlineSettings?.systemLockMonthlyDays ?? 5} Hari Kerja akhir bulan</span>
                      </td>
                      <td className="py-3 px-4">
                        {lockStatus.isLocked ? (
                          lockStatus.isManualOverride ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-bold">
                              <Lock size={13} className="text-rose-700" />
                              <span>Terkunci (Manual Admin)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold">
                              <Lock size={13} className="text-rose-600" />
                              <span>Terkunci (Otomatis Sistem)</span>
                            </span>
                          )
                        ) : lockStatus.isManualOverride ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold">
                            <Unlock size={13} className="text-amber-600" />
                            <span>Kunci Dibuka (Override Admin)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold">
                            <Unlock size={13} className="text-emerald-600" />
                            <span>Terbuka (Belum Terkunci)</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {lockStatus.isManualOverride ? (
                          <div className="space-y-0.5">
                            <div className="text-[11px] font-bold text-slate-800">Oleh: {lockStatus.lockedBy || 'Administrator'}</div>
                            {lockStatus.reason && <p className="text-[11px] text-slate-600 italic line-clamp-2">&ldquo;{lockStatus.reason}&rdquo;</p>}
                            {lockStatus.lockedAt && <div className="text-[10px] text-slate-400">{new Date(lockStatus.lockedAt).toLocaleString('id-ID')}</div>}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Mengikuti jadwal otomatis sistem (H+{deadlineSettings?.systemLockMonthlyDays ?? 5})</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {lockStatus.isLocked ? (
                            <button type="button" onClick={() => handleOpenMonthLockModal(monthNum, 'unlock', true)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition" title="Buka kunci bulan ini agar user dapat mengakses data TAL kembali">
                              <Unlock size={13} />
                              <span>Buka Kunci Bulan</span>
                            </button>
                          ) : (
                            <button type="button" onClick={() => handleOpenMonthLockModal(monthNum, 'lock', false)} className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs transition" title="Kunci bulan ini sekarang secara manual">
                              <Lock size={13} />
                              <span>Kunci Bulan Sekarang</span>
                            </button>
                          )}
                          {lockStatus.isManualOverride && (
                            <button type="button" onClick={() => handleOpenMonthLockModal(monthNum, 'reset_auto', lockStatus.isLocked)} className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-lg transition" title="Kembalikan status kunci ke jadwal otomatis sistem">
                              <RotateCcw size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. SUB-TAB: HAPUS KUNCI PLAN (UNLOCK PLANS) */}
      {/* ======================================================== */}
      {activeSubTab === 'unlock_plans' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-5">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Unlock className="text-amber-600" size={20} />
              <span>Hapus Timestamp Kunci Plan Task (Mingguan & Bulanan)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Membuka status rencana yang terkunci (*Plan Locked*) agar pengguna dapat mengedit kembali rincian tugas mingguan atau bulanan pada periode terkait.
            </p>
          </div>

          <LockFilterPanel
            filter={unlockFilter}
            setFilter={setUnlockFilter}
            usersList={usersList}
            scopeOptions={['weekly', 'monthly']}
            accent="amber"
            filterOpen={isUnlockFilterOpen}
            setFilterOpen={setIsUnlockFilterOpen}
            filterTitle="Kriteria Filter Kunci Plan"
            statusMode="locked"
            onSearch={handleSearchLocks}
            loading={loadingLocks}
            searchLabel="Cari Status Kunci Plan"
          />

          {hasSearchedLocks && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-600 font-semibold">
                  Ditemukan: <span className="font-bold text-slate-900">{queriedLocks.length}</span> record | Terpilih:{' '}
                  <span className="font-bold text-amber-700">{selectedLockIds.size}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleSelectAllLocks} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition">
                    {selectedLockIds.size === queriedLocks.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (selectedLockIds.size === 0) { showFeedback('error', 'Pilih minimal satu periode rencana terkunci yang ingin dibuka'); return; } setUnlockReason(''); setIsUnlockModalOpen(true); }}
                    disabled={selectedLockIds.size === 0}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-xs"
                  >
                    <Unlock size={14} />
                    <span>Buka Kunci {selectedLockIds.size} Periode</span>
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input type="checkbox" checked={queriedLocks.length > 0 && selectedLockIds.size === queriedLocks.length} onChange={handleSelectAllLocks} className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer" />
                      </th>
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">Scope</th>
                      <th className="py-2.5 px-3">Periode</th>
                      <th className="py-2.5 px-3">Status Plan Lock</th>
                      <th className="py-2.5 px-3">Waktu Dikunci</th>
                      <th className="py-2.5 px-3">Catatan Kunci</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {queriedLocks.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-8 text-slate-400">Tidak ada data rencana terkunci yang ditemukan.</td></tr>
                    ) : (
                      queriedLocks.map((lock) => {
                        const isSelected = selectedLockIds.has(lock.id);
                        const userInfo = getUserDisplayInfo(lock.userId, lock.userEmail, lock.userName);
                        const formattedPeriod = formatTalScopePeriod(lock.scope, lock.scopeKey, lock.infoTglTask, { weekNumber: lock.weekNumber, weekYear: lock.weekYear, month: lock.month, year: lock.year });
                        return (
                          <tr key={lock.id} className={`hover:bg-slate-50 transition ${isSelected ? 'bg-amber-50/50' : ''}`}>
                            <td className="py-2.5 px-3 text-center">
                              <input type="checkbox" checked={isSelected} onChange={() => handleToggleSelectLock(lock.id)} className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer" />
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                                  {userInfo.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-900">{userInfo.name}</div>
                                  {userInfo.email && <div className="text-[11px] text-slate-400 font-mono">{userInfo.email}</div>}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${lock.scope === 'weekly' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {lock.scope === 'weekly' ? 'Mingguan' : lock.scope === 'monthly' ? 'Bulanan' : 'Harian'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">{formattedPeriod}</td>
                            <td className="py-2.5 px-3">
                              {lock.isPlanLocked ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full font-bold text-[10px]">
                                  <AlertTriangle size={11} /> Terkunci
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold text-[10px]">
                                  <Unlock size={11} /> Terbuka
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">{lock.planLockedAt ? new Date(lock.planLockedAt).toLocaleString('id-ID') : '-'}</td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px] italic">{lock.lockNotes || '-'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. SUB-TAB: HAPUS TIMESTAMP REPORT (RESET REPORTS) */}
      {/* ======================================================== */}
      {activeSubTab === 'reset_reports' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-5">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <RotateCcw className="text-emerald-600" size={20} />
              <span>Hapus Timestamp Report Task (Harian, Mingguan, Bulanan)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Mereset status pelaporan tugas (*Reported Stage*) menjadi tahap realisasi kembali, sehingga pengguna dapat memperbaiki progres tugas dan melakukan report ulang.
            </p>
          </div>

          <LockFilterPanel
            filter={reportResetFilter}
            setFilter={setReportResetFilter}
            usersList={usersList}
            scopeOptions={['daily', 'weekly', 'monthly']}
            accent="emerald"
            filterOpen={isReportFilterOpen}
            setFilterOpen={setIsReportFilterOpen}
            filterTitle="Kriteria Filter Laporan Task"
            statusMode="reported"
            onSearch={handleSearchReports}
            loading={loadingReports}
            searchLabel="Cari Status Laporan"
          />

          {hasSearchedReports && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-600 font-semibold">
                  Ditemukan: <span className="font-bold text-slate-900">{queriedReports.length}</span> laporan | Terpilih:{' '}
                  <span className="font-bold text-emerald-700">{selectedReportIds.size}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleSelectAllReports} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition">
                    {selectedReportIds.size === queriedReports.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (selectedReportIds.size === 0) { showFeedback('error', 'Pilih minimal satu laporan yang ingin direset'); return; } setResetReportReason(''); setIsResetReportModalOpen(true); }}
                    disabled={selectedReportIds.size === 0}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-xs"
                  >
                    <RotateCcw size={14} />
                    <span>Reset {selectedReportIds.size} Laporan Terpilih</span>
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input type="checkbox" checked={queriedReports.length > 0 && selectedReportIds.size === queriedReports.length} onChange={handleSelectAllReports} className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer" />
                      </th>
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">Scope</th>
                      <th className="py-2.5 px-3">Periode</th>
                      <th className="py-2.5 px-3">Status Laporan</th>
                      <th className="py-2.5 px-3">Skor / Pencapaian</th>
                      <th className="py-2.5 px-3">Waktu Pelaporan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {queriedReports.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-8 text-slate-400">Tidak ada data laporan yang ditemukan.</td></tr>
                    ) : (
                      queriedReports.map((report) => {
                        const isSelected = selectedReportIds.has(report.id);
                        const userInfo = getUserDisplayInfo(report.userId, report.userEmail, report.userName);
                        const formattedPeriod = formatTalScopePeriod(report.scope, report.scopeKey, report.infoTglTask, { weekNumber: report.weekNumber, weekYear: report.weekYear, month: report.month, year: report.year });
                        const cutiInfo = getCutiInfoForReport(report);
                        let scoreNum: number | null = null;
                        if (typeof report.scorePercent === 'number' && !Number.isNaN(report.scorePercent)) scoreNum = report.scorePercent;
                        else if (typeof report.reportSummary?.scorePercent === 'number' && !Number.isNaN(report.reportSummary.scorePercent)) scoreNum = report.reportSummary.scorePercent;
                        else if (cutiInfo.isCuti) scoreNum = 0;
                        return (
                          <tr key={report.id} className={`hover:bg-slate-50 transition ${isSelected ? 'bg-emerald-50/50' : ''}`}>
                            <td className="py-2.5 px-3 text-center">
                              <input type="checkbox" checked={isSelected} onChange={() => handleToggleSelectReport(report.id)} className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer" />
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                                  {userInfo.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-900">{userInfo.name}</div>
                                  {userInfo.email && <div className="text-[11px] text-slate-400 font-mono">{userInfo.email}</div>}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${report.scope === 'daily' ? 'bg-blue-50 text-blue-700' : report.scope === 'weekly' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {report.scope === 'daily' ? 'Harian' : report.scope === 'weekly' ? 'Mingguan' : 'Bulanan'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-800">{formattedPeriod}</div>
                              {cutiInfo.isCuti && (() => {
                                let cleanReason = (cutiInfo.reason || '').trim();
                                if (cleanReason.toLowerCase().startsWith('cuti pada tahap realisasi:')) cleanReason = cleanReason.replace(/^cuti pada tahap realisasi:\s*/i, '');
                                else if (cleanReason.toLowerCase().startsWith('cuti:')) cleanReason = cleanReason.replace(/^cuti:\s*/i, '');
                                return (
                                  <div className="mt-1 flex items-center">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/90 rounded-full font-bold text-[10px]">
                                      <Palmtree size={11} className="text-amber-600 shrink-0" />
                                      <span>Cuti{cleanReason && cleanReason !== 'Cuti' && cleanReason !== 'Izin/Cuti saat hari berjalan' ? `: ${cleanReason}` : ''}</span>
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-2.5 px-3">
                              {report.isReported ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold text-[10px]">
                                  <CheckCircle2 size={11} /> Sudah Dilaporkan
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-bold text-[10px]">Belum Lapor</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{scoreNum !== null ? `${scoreNum}%` : '-'}</td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">{report.reportedAt ? new Date(report.reportedAt).toLocaleString('id-ID') : '-'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. SUB-TAB: AUDIT LOGS */}
      {/* ======================================================== */}
      {activeSubTab === 'audit_logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="text-slate-700" size={20} />
                <span>Log Riwayat Aksi Administrator</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit trail lengkap yang mencatat setiap aksi penghapusan, pembukaan kunci, dan reset status TAL oleh admin beserta alasan yang disertakan.
              </p>
            </div>
            <button type="button" onClick={loadAuditLogs} disabled={loadingAuditLogs} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition self-start sm:self-auto">
              <RefreshCw size={13} className={loadingAuditLogs ? 'animate-spin' : ''} />
              <span>Refresh Log</span>
            </button>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Cari admin, aksi, alasan..."
              value={auditLogSearch}
              onChange={(e) => setAuditLogSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 w-12 text-center">No</th>
                  <th className="py-2.5 px-4">Waktu</th>
                  <th className="py-2.5 px-4">Admin</th>
                  <th className="py-2.5 px-4">Tipe Aksi</th>
                  <th className="py-2.5 px-4">Ringkasan Target</th>
                  <th className="py-2.5 px-4">Alasan Eksekusi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingAuditLogs ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw size={16} className="animate-spin text-blue-600" />
                        <span>Memuat log riwayat aksi...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredAuditLogs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-400">Belum ada riwayat aksi administratif tercatat.</td></tr>
                ) : (
                  filteredAuditLogs.map((log, idx) => (
                    <tr key={log.id || idx} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-4 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">{log.createdAt ? new Date(log.createdAt).toLocaleString('id-ID') : '-'}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-900">{log.adminName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{log.adminEmail}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.actionType === 'delete_tasks' ? 'bg-rose-50 text-rose-700' :
                          log.actionType === 'unlock_plans' ? 'bg-amber-50 text-amber-700' :
                          log.actionType === 'reset_reports' ? 'bg-emerald-50 text-emerald-700' :
                          'bg-blue-50 text-blue-700'
                        }`}>
                          {log.actionTitle || log.actionType}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{log.targetSummary}</td>
                      <td className="py-2.5 px-4 text-slate-600 italic">&ldquo;{log.reason}&rdquo;</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: KONFIRMASI BUKA KUNCI PLAN */}
      {/* ======================================================== */}
      {isUnlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setIsUnlockModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 sm:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0"><Unlock size={24} /></div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Konfirmasi Buka Kunci Plan</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Anda akan membuka kunci status rencana pada <span className="font-bold text-amber-700">{selectedLockIds.size} periode</span>.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Alasan Pembukaan Kunci <span className="text-rose-600">* (Wajib Diisi)</span>:</label>
              <textarea rows={3} placeholder="Contoh: Permintaan revisi target mingguan oleh karyawan / supervisor..." value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition" />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setIsUnlockModalOpen(false)} disabled={isUnlocking} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">Batal</button>
              <button type="button" onClick={handleConfirmUnlock} disabled={isUnlocking || !unlockReason.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs">
                {isUnlocking ? <RefreshCw size={14} className="animate-spin" /> : <Unlock size={14} />}
                <span>Ya, Buka Kunci Plan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: KONFIRMASI RESET REPORT */}
      {/* ======================================================== */}
      {isResetReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setIsResetReportModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 sm:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0"><RotateCcw size={24} /></div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Konfirmasi Reset Timestamp Report</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Anda akan mereset status pelaporan pada <span className="font-bold text-emerald-700">{selectedReportIds.size} periode</span> kembali ke tahap realisasi.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Alasan Reset Laporan <span className="text-rose-600">* (Wajib Diisi)</span>:</label>
              <textarea rows={3} placeholder="Contoh: Kesalahan pengisian realisasi nilai target / ingin melapor ulang..." value={resetReportReason} onChange={(e) => setResetReportReason(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition" />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setIsResetReportModalOpen(false)} disabled={isResettingReports} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">Batal</button>
              <button type="button" onClick={handleConfirmResetReport} disabled={isResettingReports || !resetReportReason.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs">
                {isResettingReports ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                <span>Ya, Reset Laporan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: KONFIRMASI KUNCI / BUKA KUNCI SISTEM TAL BULAN */}
      {/* ======================================================== */}
      {isMonthLockModalOpen && monthLockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setIsMonthLockModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 sm:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${monthLockTarget.action === 'unlock' ? 'bg-emerald-50 text-emerald-600' : monthLockTarget.action === 'lock' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                {monthLockTarget.action === 'unlock' ? <Unlock size={24} /> : monthLockTarget.action === 'lock' ? <Lock size={24} /> : <RotateCcw size={24} />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {monthLockTarget.action === 'unlock' ? 'Konfirmasi Buka Kunci Sistem TAL' : monthLockTarget.action === 'lock' ? 'Konfirmasi Kunci Manual Sistem TAL' : 'Kembalikan ke Jadwal Otomatis Sistem'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Periode: <strong className="text-slate-800">{monthLockTarget.monthName} {monthLockTarget.year}</strong>
                </p>
              </div>
            </div>
            {monthLockTarget.action === 'unlock' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                <div className="font-bold flex items-center gap-1"><Unlock size={13} className="text-emerald-700" /><span>Dampak Pembukaan Kunci:</span></div>
                <p className="text-emerald-800">Seluruh pengguna akan dapat kembali membuat, mengubah, mencatat progres tugas, dan melaporkan tugas pada bulan <strong>{monthLockTarget.monthName} {monthLockTarget.year}</strong>.</p>
              </div>
            )}
            {monthLockTarget.action === 'lock' && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
                <div className="font-bold flex items-center gap-1"><Lock size={13} className="text-rose-700" /><span>Dampak Penguncian Sistem:</span></div>
                <p className="text-rose-800">Seluruh aktivitas TAL pada bulan <strong>{monthLockTarget.monthName} {monthLockTarget.year}</strong> akan dikunci permanen (read-only) untuk seluruh pengguna.</p>
              </div>
            )}
            {monthLockTarget.action === 'reset_auto' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1"><RotateCcw size={13} className="text-blue-700" /><span>Pengembalian Otomatis:</span></div>
                <p className="text-blue-800">Status kunci bulan <strong>{monthLockTarget.monthName} {monthLockTarget.year}</strong> akan kembali mengikuti batas waktu otomatis sistem (H+{deadlineSettings?.systemLockMonthlyDays ?? 5} Hari Kerja Jam {deadlineSettings?.systemLockMonthlyTime || '16:00'} WIB).</p>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Alasan / Catatan Administrator <span className="text-rose-600">* (Wajib Diisi)</span>:
              </label>
              <textarea
                rows={3}
                placeholder={
                  monthLockTarget.action === 'unlock'
                    ? 'Contoh: Permintaan perpanjangan pelaporan bulanan oleh direksi...'
                    : monthLockTarget.action === 'lock'
                      ? 'Contoh: Penutupan periode bulanan lebih awal...'
                      : 'Contoh: Pengembalian jadwal otomatis normal...'
                }
                value={monthLockReason}
                onChange={(e) => setMonthLockReason(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setIsMonthLockModalOpen(false)} disabled={isSubmittingMonthLock} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">Batal</button>
              <button
                type="button"
                onClick={handleConfirmMonthLockAction}
                disabled={isSubmittingMonthLock || !monthLockReason.trim()}
                className={`flex items-center gap-1.5 px-4 py-2 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 ${
                  monthLockTarget.action === 'unlock' ? 'bg-emerald-600 hover:bg-emerald-700' : monthLockTarget.action === 'lock' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSubmittingMonthLock ? <RefreshCw size={14} className="animate-spin" /> : monthLockTarget.action === 'unlock' ? <Unlock size={14} /> : monthLockTarget.action === 'lock' ? <Lock size={14} /> : <RotateCcw size={14} />}
                <span>
                  {monthLockTarget.action === 'unlock' ? 'Ya, Buka Kunci Bulan' : monthLockTarget.action === 'lock' ? 'Ya, Kunci Bulan Sekarang' : 'Ya, Kembalikan ke Otomatis'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel filter bersama untuk sub-tab kunci plan / reset laporan
// ---------------------------------------------------------------------------
function LockFilterPanel({
  filter, setFilter, usersList, scopeOptions, accent, filterOpen, setFilterOpen,
  filterTitle, statusMode, onSearch, loading, searchLabel,
}: {
  filter: LockFilter;
  setFilter: React.Dispatch<React.SetStateAction<LockFilter>>;
  usersList: TeamSettingsUser[];
  scopeOptions: TalTaskType[];
  accent: 'amber' | 'emerald';
  filterOpen: boolean;
  setFilterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  filterTitle: string;
  statusMode: 'locked' | 'reported';
  onSearch: () => void;
  loading: boolean;
  searchLabel: string;
}) {
  const accentBtn = accent === 'amber' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700';
  const accentIcon = accent === 'amber' ? 'text-amber-600' : 'text-emerald-600';
  const accentChip = accent === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100';
  const scopeLabel = (t: TalTaskType) => (t === 'daily' ? 'Harian' : t === 'weekly' ? 'Mingguan' : 'Bulanan');
  const scopeActive = accent === 'amber' ? 'bg-amber-600 text-white shadow-xs' : 'bg-emerald-600 text-white shadow-xs';
  const summary = `${filter.userId === '' ? 'Semua User' : '1 User'} • ${filter.scopeTypes.join(', ')} • Mode: ${filter.periodMode}`;

  return (
    <div className="bg-slate-50/80 rounded-xl border border-slate-200 overflow-hidden text-xs transition-all shadow-2xs">
      <button
        type="button"
        onClick={() => setFilterOpen((prev) => !prev)}
        className="w-full flex items-center justify-between p-3.5 sm:px-4 bg-slate-100/70 hover:bg-slate-100 text-left transition select-none border-b border-slate-200/60"
      >
        <div className="font-bold text-slate-700 flex items-center gap-2">
          <Filter size={14} className={accentIcon} />
          <span>{filterTitle}</span>
          {!filterOpen && (
            <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ml-2 ${accentChip}`}>{summary}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-slate-500 font-semibold text-[11px]">
          <span>{filterOpen ? 'Sembunyikan' : 'Buka Filter'}</span>
          <ChevronDown size={16} className={`transition-transform duration-200 ${filterOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {filterOpen && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pilih Pengguna / User:</label>
              <select
                value={filter.userId === '' ? '__ALL__' : filter.userId}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilter((prev) => ({ ...prev, userId: val === '__ALL__' ? '' : val }));
                }}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="__ALL__">-- Semua Pengguna (All Users) --</option>
                {usersList.map((u) => (
                  <option key={u.id} value={u.id}>{u.nama} ({u.email})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipe Scope:</label>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {scopeOptions.map((t) => {
                  const isSelected = filter.scopeTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setFilter((prev) => {
                          const nextTypes = isSelected ? prev.scopeTypes.filter((x) => x !== t) : [...prev.scopeTypes, t];
                          return { ...prev, scopeTypes: nextTypes.length === 0 ? [t] : nextTypes };
                        });
                      }}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition ${isSelected ? scopeActive : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                    >
                      {scopeLabel(t)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Status:</label>
              {statusMode === 'locked' ? (
                <select
                  value={filter.onlyLocked ? 'locked_only' : 'all'}
                  onChange={(e) => setFilter((prev) => ({ ...prev, onlyLocked: e.target.value === 'locked_only' }))}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="locked_only">Hanya yang Sedang Terkunci</option>
                  <option value="all">Semua Record Scope</option>
                </select>
              ) : (
                <select
                  value={filter.onlyReported ? 'reported_only' : 'all'}
                  onChange={(e) => setFilter((prev) => ({ ...prev, onlyReported: e.target.value === 'reported_only' }))}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="reported_only">Hanya yang Telah Dilaporkan</option>
                  <option value="all">Semua Record Scope</option>
                </select>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Mode Periode / Waktu:</label>
              <select
                value={filter.periodMode}
                onChange={(e) => setFilter((prev) => ({ ...prev, periodMode: e.target.value as LockFilter['periodMode'] }))}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="all">Semua Waktu (All Records)</option>
                <option value="date_range">Rentang Tanggal (Start - End)</option>
                <option value="weeks">Minggu Tertentu (Week Number)</option>
                <option value="months">Bulan Tertentu (Month)</option>
                <option value="years">Tahun Tertentu (Year)</option>
              </select>
            </div>

            {filter.periodMode === 'date_range' && (
              <div className="col-span-1 sm:col-span-2 md:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Mulai:</label>
                  <input type="date" value={filter.startDate} onChange={(e) => setFilter((prev) => ({ ...prev, startDate: e.target.value }))} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Selesai:</label>
                  <input type="date" value={filter.endDate} onChange={(e) => setFilter((prev) => ({ ...prev, endDate: e.target.value }))} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              </div>
            )}

            {filter.periodMode === 'weeks' && (
              <div className="col-span-1 sm:col-span-2 md:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pilih Week (1-53):</label>
                  <input
                    type="number" min={1} max={53} placeholder="Contoh: 37"
                    value={filter.selectedWeek === '' ? '' : filter.selectedWeek}
                    onChange={(e) => {
                      const num = parseInt(e.target.value, 10);
                      setFilter((prev) => ({ ...prev, selectedWeek: Number.isNaN(num) ? '' : num }));
                    }}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tahun:</label>
                  <input
                    type="number" min={2020} max={2040}
                    value={filter.selectedWeekYear}
                    onChange={(e) => {
                      const yr = parseInt(e.target.value, 10);
                      setFilter((prev) => ({ ...prev, selectedWeekYear: Number.isNaN(yr) ? new Date().getFullYear() : yr }));
                    }}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {filter.periodMode === 'months' && (
              <div className="col-span-1 sm:col-span-2 md:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pilih Bulan:</label>
                  <select
                    value={filter.selectedMonth}
                    onChange={(e) => setFilter((prev) => ({ ...prev, selectedMonth: parseInt(e.target.value, 10) }))}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {INDONESIAN_MONTHS.map((mName, idx) => (
                      <option key={idx} value={idx + 1}>{mName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tahun:</label>
                  <input
                    type="number" min={2020} max={2040}
                    value={filter.selectedMonthYear}
                    onChange={(e) => {
                      const yr = parseInt(e.target.value, 10);
                      setFilter((prev) => ({ ...prev, selectedMonthYear: Number.isNaN(yr) ? new Date().getFullYear() : yr }));
                    }}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {filter.periodMode === 'years' && (
              <div className="col-span-1 sm:col-span-2 md:col-span-4 pt-1">
                <label className="block font-semibold text-slate-700 mb-1">Pilih Tahun:</label>
                <input
                  type="number" min={2020} max={2040}
                  value={filter.selectedYear}
                  onChange={(e) => {
                    const y = parseInt(e.target.value, 10);
                    setFilter((prev) => ({ ...prev, selectedYear: Number.isNaN(y) ? new Date().getFullYear() : y }));
                  }}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onSearch}
              disabled={loading}
              className={`flex items-center gap-2 px-4 py-2 text-white rounded-xl text-xs font-bold transition shadow-xs ${accentBtn}`}
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              <span>{searchLabel}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TalAdminDatabaseTab;
