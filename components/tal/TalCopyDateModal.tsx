// components/tal/TalCopyDateModal.tsx — porting src/components/tal/TalCopyDateModal.tsx backup.
// Adaptasi WOORK:
// - Scope key kanonik via scopeKeyFor (daily "YYYY-MM-DD", weekly "YYYY-WNN",
//   monthly "YYYY-MM") — bukan format backup daily_/weekly_/monthly_.
// - fetchTalScopeState -> fetchScopeState (lib/tal/client.ts); fallback
//   libur/cuti via fetchTalHolidays / fetchTalCuti (bukan fetchTalCutiList).
// - Tipe dari lib/tal/types + helper dari lib/tal/date.
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarPlus,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CalendarDays,
  ChevronDown,
  Info,
  Ban,
  CheckCircle2,
  CalendarOff,
  Loader2
} from 'lucide-react';
import type { TalTaskItem, TalTaskType, TalCopyTarget, TalHolidayItem, TalCutiRecord } from '@/lib/tal/types';
import { fetchScopeState, fetchTalHolidays, fetchTalCuti } from '@/lib/tal/client';
import {
  formatDateKey,
  formatIndonesianDate,
  INDONESIAN_MONTHS,
  INDONESIAN_MONTHS_SHORT,
  getWeekNumberAndYear,
  getYearlyMonthWeeksGrouping,
  getSundayFromWeekNumber,
  getWeekDetails,
  checkIsHoliday,
  addWorkingDays,
  scopeKeyFor
} from '@/lib/tal/date';

interface TalCopyDateModalProps {
  isOpen: boolean;
  type?: TalTaskType; // 'daily' | 'weekly' | 'monthly'
  tasks: TalTaskItem[];
  currentDateStr?: string;
  currentWeekNumber?: number;
  currentWeekYear?: number;
  currentMonth?: number;
  currentYear?: number;
  userId?: string;
  holidays?: TalHolidayItem[];
  cutiRecords?: TalCutiRecord[];
  onConfirm: (target: TalCopyTarget, selectedTaskIds: string[]) => Promise<void>;
  onClose: () => void;
}

export const TalCopyDateModal: React.FC<TalCopyDateModalProps> = ({
  isOpen,
  type = 'daily',
  tasks,
  currentDateStr,
  currentWeekNumber,
  currentWeekYear,
  currentMonth,
  currentYear,
  userId,
  holidays: passedHolidays,
  cutiRecords: passedCutiRecords,
  onConfirm,
  onClose
}) => {
  // 1. Daily target initial state (compute next working day)
  const initialDailyTarget = useMemo(() => {
    try {
      const base = currentDateStr ? new Date(currentDateStr + 'T00:00:00') : new Date();
      const { deadlineDateStr } = addWorkingDays(base, 1, passedHolidays || []);
      return deadlineDateStr;
    } catch {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return formatDateKey(tomorrow);
    }
  }, [currentDateStr, passedHolidays]);

  const [targetDate, setTargetDate] = useState(initialDailyTarget);

  // 2. Weekly target initial state
  const thisYear = currentWeekYear || new Date().getFullYear();
  const nextWeekNum = ((currentWeekNumber || getWeekNumberAndYear(new Date()).weekNumber) % 52) + 1;
  const [targetWeekYear, setTargetWeekYear] = useState<number>(thisYear);
  const [targetWeekNumber, setTargetWeekNumber] = useState<number>(nextWeekNum);
  const [isWeekDropdownOpen, setIsWeekDropdownOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(thisYear);
  const [isYearPickerView, setIsYearPickerView] = useState(false);

  // 3. Monthly target initial state
  const nextMonthNum = ((currentMonth || (new Date().getMonth() + 1)) % 12) + 1;
  const [targetMonthYear, setTargetMonthYear] = useState<number>(currentYear || new Date().getFullYear());
  const [targetMonth, setTargetMonth] = useState<number>(nextMonthNum);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState<number>(currentYear || new Date().getFullYear());
  const [isMonthYearPickerView, setIsMonthYearPickerView] = useState(false);

  // 4. Task selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(tasks.map(t => t.id)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 5. Target validation states
  const [isCheckingTarget, setIsCheckingTarget] = useState(false);
  const [isTargetHoliday, setIsTargetHoliday] = useState(false);
  const [targetHolidayTitle, setTargetHolidayTitle] = useState('');
  const [isTargetCuti, setIsTargetCuti] = useState(false);
  const [targetCutiReason, setTargetCutiReason] = useState('');
  const [isTargetReported, setIsTargetReported] = useState(false);
  const [isTargetPlanLocked, setIsTargetPlanLocked] = useState(false);

  // Check target period status whenever target changes
  useEffect(() => {
    let isMounted = true;
    const checkTargetStatus = async () => {
      setIsCheckingTarget(true);

      try {
        let isHoliday = false;
        let holidayTitle = '';
        let isCuti = false;
        let cutiReason = '';
        let isReported = false;
        let isPlanLocked = false;

        // Fetch holidays and cuti records if not passed as props
        const hols = passedHolidays && passedHolidays.length > 0
          ? passedHolidays
          : await fetchTalHolidays().catch(() => []);
        const cutiList = passedCutiRecords && passedCutiRecords.length > 0
          ? passedCutiRecords
          : await fetchTalCuti().catch(() => []);

        if (type === 'daily' && targetDate) {
          // A. Sunday & Holiday Check
          const d = new Date(targetDate + 'T00:00:00');
          const isSunday = d.getDay() === 0;
          const holCheck = checkIsHoliday(targetDate, hols);

          if (isSunday) {
            isHoliday = true;
            holidayTitle = 'Hari Minggu (Libur Mingguan)';
          } else if (holCheck.isHoliday) {
            isHoliday = true;
            holidayTitle = holCheck.holidayTitle || 'Hari Libur Nasional / Tanggal Merah';
          }

          // B. Cuti Check
          const foundCuti = cutiList.find(c => c.date === targetDate && (c as TalCutiRecord).isCuti !== false);
          if (foundCuti) {
            isCuti = true;
            cutiReason = foundCuti.reason || 'Cuti Pegawai';
          }

          // C. Scope State Check (Daily, Weekly, Monthly) — WOORK scopeKeyFor
          const weekInfo = getWeekDetails(d);
          const weeklyKey = scopeKeyFor('weekly', { weekNumber: weekInfo.weekNumber, weekYear: weekInfo.weekYear });
          const dailyKey = scopeKeyFor('daily', { dateStr: targetDate });
          const monthlyKey = scopeKeyFor('monthly', { month: d.getMonth() + 1, year: d.getFullYear() });
          const [weeklyState, dailyState, monthlyState] = await Promise.all([
            fetchScopeState('weekly', weeklyKey).catch(() => null),
            fetchScopeState('daily', dailyKey).catch(() => null),
            fetchScopeState('monthly', monthlyKey).catch(() => null)
          ]);

          isReported = !!dailyState?.isReported || !!weeklyState?.isReported || !!monthlyState?.isReported;
          isPlanLocked = !isReported && (!!weeklyState?.isPlanLocked || !!dailyState?.isPlanLocked);
        } else if (type === 'weekly') {
          const weeklyKey = scopeKeyFor('weekly', { weekNumber: targetWeekNumber, weekYear: targetWeekYear });
          const selectedWeekSunday = getSundayFromWeekNumber(targetWeekYear, targetWeekNumber);
          const weekDetails = getWeekDetails(selectedWeekSunday);
          const monthlyKey = scopeKeyFor('monthly', { month: weekDetails.majorityMonth, year: targetWeekYear });
          const [weeklyState, monthlyState] = await Promise.all([
            fetchScopeState('weekly', weeklyKey).catch(() => null),
            fetchScopeState('monthly', monthlyKey).catch(() => null)
          ]);
          isReported = !!weeklyState?.isReported || !!monthlyState?.isReported;
          isPlanLocked = !isReported && !!weeklyState?.isPlanLocked;
        } else if (type === 'monthly') {
          const monthlyKey = scopeKeyFor('monthly', { month: targetMonth, year: targetMonthYear });
          const monthlyState = await fetchScopeState('monthly', monthlyKey).catch(() => null);
          isReported = !!monthlyState?.isReported;
          isPlanLocked = !isReported && !!monthlyState?.isPlanLocked;
        }

        if (isMounted) {
          setIsTargetHoliday(isHoliday);
          setTargetHolidayTitle(holidayTitle);
          setIsTargetCuti(isCuti);
          setTargetCutiReason(cutiReason);
          setIsTargetReported(isReported);
          setIsTargetPlanLocked(isPlanLocked);
        }
      } catch (err) {
        console.warn('Error checking target period status in copy modal:', err);
      } finally {
        if (isMounted) {
          setIsCheckingTarget(false);
        }
      }
    };

    checkTargetStatus();
    return () => {
      isMounted = false;
    };
  }, [type, targetDate, targetWeekNumber, targetWeekYear, targetMonth, targetMonthYear, userId, tasks, passedHolidays, passedCutiRecords]);

  if (!isOpen) return null;

  // Week calculations for week picker
  const monthGroupings = getYearlyMonthWeeksGrouping(pickerYear);
  const selectedWeekSunday = getSundayFromWeekNumber(targetWeekYear, targetWeekNumber);
  const selectedWeekDetails = getWeekDetails(selectedWeekSunday);

  // 12-Year grid for Week Picker
  const baseDecadeYear = Math.floor(pickerYear / 12) * 12;
  const startDecade = baseDecadeYear > 0 ? baseDecadeYear : 2021;
  const endDecade = startDecade + 11;
  const decadeYears = Array.from({ length: 12 }, (_, i) => startDecade + i);

  // 12-Year grid for Month Picker
  const baseMonthDecade = Math.floor(monthPickerYear / 12) * 12;
  const startMonthDecade = baseMonthDecade > 0 ? baseMonthDecade : 2021;
  const endMonthDecade = startMonthDecade + 11;
  const monthDecadeYears = Array.from({ length: 12 }, (_, i) => startMonthDecade + i);

  const handleToggleTask = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isInvalidTarget = isTargetHoliday || isTargetCuti || isTargetReported;

  const handleCopy = async () => {
    if (selectedIds.size === 0) {
      setError('Pilih minimal 1 tugas untuk disalin!');
      return;
    }

    if (isTargetHoliday) {
      setError(`Tidak diperbolehkan menyalin tugas ke tanggal merah atau hari libur (${targetHolidayTitle}).`);
      return;
    }

    if (isTargetCuti) {
      setError(`Tidak diperbolehkan menyalin tugas ke tanggal cuti (${targetCutiReason || 'Cuti Pegawai'}).`);
      return;
    }

    if (isTargetReported) {
      setError(
        type === 'daily'
          ? 'Tidak diperbolehkan menyalin tugas ke tanggal yang sudah dilakukan pelaporan.'
          : type === 'weekly'
          ? 'Tidak diperbolehkan menyalin tugas ke minggu yang sudah dilakukan pelaporan.'
          : 'Tidak diperbolehkan menyalin tugas ke bulan yang sudah dilakukan pelaporan.'
      );
      return;
    }

    let copyTarget: TalCopyTarget;

    if (type === 'daily') {
      if (!targetDate) {
        setError('Pilih tanggal target tujuan!');
        return;
      }
      copyTarget = {
        targetType: 'daily',
        targetDate
      };
    } else if (type === 'weekly') {
      if (!targetWeekNumber || !targetWeekYear) {
        setError('Pilih week dan tahun target tujuan!');
        return;
      }
      copyTarget = {
        targetType: 'weekly',
        targetWeekNumber,
        targetWeekYear
      };
    } else {
      if (!targetMonth || !targetMonthYear) {
        setError('Pilih bulan dan tahun target tujuan!');
        return;
      }
      copyTarget = {
        targetType: 'monthly',
        targetMonth,
        targetYear: targetMonthYear
      };
    }

    setLoading(true);
    setError('');
    try {
      await onConfirm(copyTarget, Array.from(selectedIds));
      onClose();
    } catch (e: unknown) {
      console.error(e);
      setError((e as Error)?.message || 'Gagal menyalin tugas.');
    } finally {
      setLoading(false);
    }
  };

  const modalTitle = type === 'daily'
    ? 'Salin Tugas ke Tanggal Lain'
    : type === 'weekly'
    ? 'Salin Tugas ke Week Lain'
    : 'Salin Tugas ke Bulan Lain';

  const labelTarget = type === 'daily'
    ? 'Tanggal Target Tujuan'
    : type === 'weekly'
    ? 'Week Target Tujuan'
    : 'Bulan Target Tujuan';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-visible animate-in fade-in zoom-in-95 duration-150 relative flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-indigo-50/70 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl border border-indigo-200">
              <CalendarPlus size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{modalTitle}</h3>
              <p className="text-[11px] text-indigo-700 font-semibold">{tasks.length} Tugas Terpilih</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition cursor-pointer"
            title="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
              <AlertCircle size={16} className="shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Daily Target Input */}
          {type === 'daily' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {labelTarget} <span className="text-rose-500">*</span>
                </label>
                {targetDate && (
                  <span className="text-[11px] font-semibold text-slate-500">
                    {formatIndonesianDate(targetDate)}
                  </span>
                )}
              </div>
              <input
                type="date"
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className={`w-full px-3 py-2 text-xs font-medium rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-800 transition ${
                  isInvalidTarget
                    ? 'border-rose-300 bg-rose-50/20'
                    : 'border-slate-200'
                }`}
              />
            </div>
          )}

          {/* 2. Weekly Target Input with Dropdown / Popup */}
          {type === 'weekly' && (
            <div className="relative">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {labelTarget} <span className="text-rose-500">*</span>
              </label>

              {/* Selector Button */}
              <button
                type="button"
                onClick={() => {
                  setPickerYear(targetWeekYear);
                  setIsYearPickerView(false);
                  setIsWeekDropdownOpen(!isWeekDropdownOpen);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold bg-slate-50 hover:bg-slate-100 border rounded-xl transition cursor-pointer ${
                  isInvalidTarget
                    ? 'border-rose-300 text-rose-700'
                    : 'border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <CalendarDays size={16} className="text-indigo-600 shrink-0" />
                  <span className="truncate">
                    Week {targetWeekNumber} ({INDONESIAN_MONTHS_SHORT[selectedWeekDetails.majorityMonth - 1]} {targetWeekYear})
                  </span>
                </div>
                <ChevronDown size={15} className="text-slate-400 shrink-0" />
              </button>

              {/* Week Picker Popup */}
              {isWeekDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-50 bg-black/40 md:bg-transparent backdrop-blur-xs md:backdrop-blur-none"
                    onClick={() => setIsWeekDropdownOpen(false)}
                  />

                  <div
                    className="fixed inset-x-3 top-1/2 -translate-y-1/2 md:absolute md:inset-auto md:top-full md:left-0 md:right-0 md:translate-y-1.5 z-[60] flex justify-center md:block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="bg-white rounded-2xl shadow-2xl md:shadow-xl border border-slate-200 w-full max-w-md md:max-w-none overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[80vh] md:max-h-[380px]">
                      {/* Year Navigation Header */}
                      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/90 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (isYearPickerView) {
                                setPickerYear(prev => prev - 12);
                              } else {
                                setPickerYear(prev => prev - 1);
                              }
                            }}
                            className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                            title="Tahun Sebelumnya"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsYearPickerView(!isYearPickerView)}
                            className="text-xs font-bold text-slate-800 hover:text-indigo-600 transition px-2 py-0.5 rounded-lg hover:bg-slate-200/70 cursor-pointer"
                            title="Ganti Tahun"
                          >
                            {isYearPickerView ? `${startDecade} - ${endDecade}` : pickerYear}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isYearPickerView) {
                                setPickerYear(prev => prev + 12);
                              } else {
                                setPickerYear(prev => prev + 1);
                              }
                            }}
                            className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                            title="Tahun Selanjutnya"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsWeekDropdownOpen(false)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
                          title="Tutup"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {/* Content: Year Picker vs Month-Week Matrix */}
                      <div className="p-3 overflow-y-auto flex-1">
                        {isYearPickerView ? (
                          <div className="grid grid-cols-3 gap-2 py-1">
                            {decadeYears.map((yr) => (
                              <button
                                key={yr}
                                type="button"
                                onClick={() => {
                                  setPickerYear(yr);
                                  setIsYearPickerView(false);
                                }}
                                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                  yr === pickerYear
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                                }`}
                              >
                                {yr}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-1 divide-y divide-slate-100">
                            <div className="flex items-center gap-2 pb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              <div className="w-10 text-center">Bulan</div>
                              <div className="flex-1">Week di Bulan Ini</div>
                            </div>

                            {monthGroupings.map((group) => (
                              <div
                                key={group.monthNumber}
                                className="flex items-center gap-1.5 py-1 px-1 rounded-lg"
                              >
                                <div className="w-10 shrink-0 text-center font-bold text-xs text-slate-700">
                                  {group.monthShort}
                                </div>
                                <div className="flex-1 flex flex-wrap gap-1">
                                  {group.weeks.map(w => {
                                    const isSelected = w.weekNumber === targetWeekNumber && targetWeekYear === pickerYear;
                                    return (
                                      <button
                                        key={w.weekNumber}
                                        type="button"
                                        onClick={() => {
                                          setTargetWeekYear(pickerYear);
                                          setTargetWeekNumber(w.weekNumber);
                                          setIsWeekDropdownOpen(false);
                                        }}
                                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                          isSelected
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700'
                                        }`}
                                      >
                                        W{w.weekNumber}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 3. Monthly Target Input with Dropdown / Popup */}
          {type === 'monthly' && (
            <div className="relative">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {labelTarget} <span className="text-rose-500">*</span>
              </label>

              {/* Selector Button */}
              <button
                type="button"
                onClick={() => {
                  setMonthPickerYear(targetMonthYear);
                  setIsMonthYearPickerView(false);
                  setIsMonthDropdownOpen(!isMonthDropdownOpen);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold bg-slate-50 hover:bg-slate-100 border rounded-xl transition cursor-pointer ${
                  isInvalidTarget
                    ? 'border-rose-300 text-rose-700'
                    : 'border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Calendar size={16} className="text-cyan-600 shrink-0" />
                  <span className="truncate">
                    {INDONESIAN_MONTHS[targetMonth - 1]} {targetMonthYear}
                  </span>
                </div>
                <ChevronDown size={15} className="text-slate-400 shrink-0" />
              </button>

              {/* Month Picker Popup */}
              {isMonthDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-50 bg-black/40 md:bg-transparent backdrop-blur-xs md:backdrop-blur-none"
                    onClick={() => setIsMonthDropdownOpen(false)}
                  />

                  <div
                    className="fixed inset-x-3 top-1/2 -translate-y-1/2 md:absolute md:inset-auto md:top-full md:left-0 md:right-0 md:translate-y-1.5 z-[60] flex justify-center md:block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="bg-white rounded-2xl shadow-2xl md:shadow-xl border border-slate-200 w-full max-w-sm md:max-w-none overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
                      {/* Year Navigation Header */}
                      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/90 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (isMonthYearPickerView) {
                                setMonthPickerYear(prev => prev - 12);
                              } else {
                                setMonthPickerYear(prev => prev - 1);
                              }
                            }}
                            className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                            title="Tahun Sebelumnya"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsMonthYearPickerView(!isMonthYearPickerView)}
                            className="text-xs font-bold text-slate-800 hover:text-cyan-600 transition px-2 py-0.5 rounded-lg hover:bg-slate-200/70 cursor-pointer"
                            title="Ganti Tahun"
                          >
                            {isMonthYearPickerView ? `${startMonthDecade} - ${endMonthDecade}` : monthPickerYear}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isMonthYearPickerView) {
                                setMonthPickerYear(prev => prev + 12);
                              } else {
                                setMonthPickerYear(prev => prev + 1);
                              }
                            }}
                            className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                            title="Tahun Selanjutnya"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsMonthDropdownOpen(false)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
                          title="Tutup"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {/* Content: Year Picker vs Month Grid */}
                      <div className="p-3">
                        {isMonthYearPickerView ? (
                          <div className="grid grid-cols-3 gap-2 py-1">
                            {monthDecadeYears.map((yr) => (
                              <button
                                key={yr}
                                type="button"
                                onClick={() => {
                                  setMonthPickerYear(yr);
                                  setIsMonthYearPickerView(false);
                                }}
                                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                  yr === monthPickerYear
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                                }`}
                              >
                                {yr}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 py-1">
                            {INDONESIAN_MONTHS.map((m, idx) => {
                              const mNum = idx + 1;
                              const isSelected = targetMonth === mNum && targetMonthYear === monthPickerYear;
                              return (
                                <button
                                  key={mNum}
                                  type="button"
                                  onClick={() => {
                                    setTargetMonthYear(monthPickerYear);
                                    setTargetMonth(mNum);
                                    setIsMonthDropdownOpen(false);
                                  }}
                                  className={`py-2 px-1 text-xs rounded-xl font-bold border transition text-center cursor-pointer ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-cyan-50 hover:text-cyan-700 hover:border-cyan-200'
                                  }`}
                                >
                                  {m.substring(0, 3)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Target Status Banners */}
          {isCheckingTarget ? (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-indigo-500" />
              <span>Memeriksa status kalender & laporan target...</span>
            </div>
          ) : isTargetHoliday ? (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5 animate-in fade-in">
              <CalendarOff size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold flex items-center gap-1.5 text-rose-700">
                  <span>Tanggal Target adalah Tanggal Merah</span>
                </p>
                <p className="text-[11px] text-rose-600 leading-relaxed">
                  {targetHolidayTitle}. <strong>Tidak diperbolehkan menyalin tugas ke tanggal merah atau hari libur!</strong>
                </p>
              </div>
            </div>
          ) : isTargetCuti ? (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-start gap-2.5 animate-in fade-in">
              <Ban size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-amber-800">Tanggal Target adalah Hari Cuti</p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  Terdapat agenda cuti pada tanggal ini ({targetCutiReason || 'Cuti'}). <strong>Tidak diperbolehkan menyalin tugas ke tanggal cuti!</strong>
                </p>
              </div>
            </div>
          ) : isTargetReported ? (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5 animate-in fade-in">
              <Ban size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-rose-700">Periode Target Sudah Dilaporkan (Tahap Selesai)</p>
                <p className="text-[11px] text-rose-600 leading-relaxed">
                  {type === 'daily'
                    ? `Laporan harian pada tanggal ini sudah dikunci & dilaporkan.`
                    : type === 'weekly'
                    ? `Laporan mingguan pada Week ${targetWeekNumber} (${targetWeekYear}) sudah diselesaikan.`
                    : `Laporan bulanan pada bulan ${INDONESIAN_MONTHS[targetMonth - 1]} ${targetMonthYear} sudah diselesaikan.`}
                  {' '}<strong>Tidak diperbolehkan menyalin tugas ke periode yang sudah dilakukan pelaporan!</strong>
                </p>
              </div>
            </div>
          ) : isTargetPlanLocked ? (
            <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs rounded-xl flex items-start gap-2.5 animate-in fade-in">
              <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-indigo-800">Periode Target sudah masuk Tahap Realisasi</p>
                <p className="text-[11px] text-indigo-700 leading-relaxed">
                  Tugas yang disalin akan otomatis dimasukkan sebagai <strong>Tugas Tambahan</strong> pada periode tujuan.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span className="text-[11px] font-medium">Periode target terbuka & siap menerima tugas salinan.</span>
            </div>
          )}

          {/* Task list selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Pilih Tugas yang Disalin ({selectedIds.size}/{tasks.length})
              </label>
              <button
                type="button"
                onClick={() => {
                  if (selectedIds.size === tasks.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(tasks.map(t => t.id)));
                }}
                className="text-[11px] text-indigo-600 font-semibold hover:underline cursor-pointer"
              >
                {selectedIds.size === tasks.length ? 'Batal Semua' : 'Pilih Semua'}
              </button>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50">
              {tasks.map(t => {
                const isChecked = selectedIds.has(t.id);
                return (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 text-xs cursor-pointer hover:bg-slate-100 transition"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleTask(t.id)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-800 truncate flex-1">{t.title}</span>
                    {t.time && <span className="text-[10px] text-slate-400 shrink-0">{t.time}</span>}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-100 rounded-b-2xl shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={loading || isInvalidTarget || selectedIds.size === 0 || isCheckingTarget}
            onClick={handleCopy}
            className={`px-5 py-2 text-xs font-bold text-white rounded-xl transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
              isInvalidTarget
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {loading
              ? 'Menyalin...'
              : isCheckingTarget
              ? 'Memeriksa Target...'
              : isTargetHoliday
              ? 'Tidak Dapat Disalin ke Tanggal Merah'
              : isTargetCuti
              ? 'Tidak Dapat Disalin ke Hari Cuti'
              : isTargetReported
              ? 'Periode Target Sudah Dilaporkan'
              : isTargetPlanLocked
              ? 'Salin sebagai Tugas Tambahan'
              : 'Salin Tugas Sekarang'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const TalCopyTaskModal = TalCopyDateModal;
export default TalCopyDateModal;
