// components/tal/TalReportModal.tsx — porting src/components/tal/TalReportModal.tsx backup.
// Adaptasi WOORK: tipe dari lib/tal/types, helper tanggal dari lib/tal/date.
'use client';

import React, { useState, useMemo } from 'react';
import {
  FileCheck,
  X,
  CheckSquare,
  Calculator,
  AlertTriangle,
  RotateCw,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { TalTaskType, TalTaskItem, TalTaskRolloverDecision } from '@/lib/tal/types';
import {
  calculateTalReportScore,
  parseDateKey,
  formatDateKey,
  formatIndonesianDate,
  getWeekDetails,
  INDONESIAN_MONTHS
} from '@/lib/tal/date';

interface TalReportModalProps {
  isOpen: boolean;
  type: TalTaskType;
  periodLabel: string;
  currentDateStr?: string;
  selectedWeekNumber?: number;
  selectedWeekYear?: number;
  selectedMonth?: number;
  selectedYear?: number;
  tasks: TalTaskItem[];
  onConfirm: (notes: string, rolloverDecisions: TalTaskRolloverDecision[]) => Promise<void>;
  onClose: () => void;
}

export const TalReportModal: React.FC<TalReportModalProps> = ({
  isOpen,
  type,
  periodLabel,
  currentDateStr,
  selectedWeekNumber,
  selectedWeekYear,
  selectedMonth,
  selectedYear,
  tasks,
  onConfirm,
  onClose
}) => {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Accordion toggle states
  const [isCapaianOpen, setIsCapaianOpen] = useState(true);
  const [isRolloverSectionOpen, setIsRolloverSectionOpen] = useState(true);

  // Identify all pending tasks
  const pendingTasks = useMemo(() => {
    return tasks.filter(t => t.status === 'pending');
  }, [tasks]);

  // Daily tomorrow info
  const tomorrowInfo = useMemo(() => {
    const baseDate = currentDateStr ? parseDateKey(currentDateStr) : new Date();
    const tmrw = new Date(baseDate);
    tmrw.setDate(baseDate.getDate() + 1);
    const dateStr = formatDateKey(tmrw);
    return {
      dateStr,
      label: formatIndonesianDate(dateStr)
    };
  }, [currentDateStr]);

  // Daily days in current week for Opsi B
  const weekDaysOptions = useMemo(() => {
    const baseDate = currentDateStr ? parseDateKey(currentDateStr) : new Date();
    const details = getWeekDetails(baseDate);
    return details.days.map(d => ({
      dateStr: d.dateStr,
      label: `${d.fullDayName}, ${formatIndonesianDate(d.dateStr)}`
    }));
  }, [currentDateStr]);

  // Weekly next week info & options
  const nextWeekInfo = useMemo(() => {
    const currW = selectedWeekNumber || 1;
    const currY = selectedWeekYear || new Date().getFullYear();
    const nextW = currW >= 52 ? 1 : currW + 1;
    const nextY = currW >= 52 ? currY + 1 : currY;
    return {
      weekNumber: nextW,
      weekYear: nextY,
      label: `Week ${nextW} (${nextY})`
    };
  }, [selectedWeekNumber, selectedWeekYear]);

  const upcomingWeeksOptions = useMemo(() => {
    const currW = selectedWeekNumber || 1;
    const currY = selectedWeekYear || new Date().getFullYear();
    const list: { weekNumber: number; weekYear: number; label: string }[] = [];
    for (let i = 1; i <= 8; i++) {
      let w = currW + i;
      let y = currY;
      if (w > 52) {
        w = w - 52;
        y = y + 1;
      }
      list.push({
        weekNumber: w,
        weekYear: y,
        label: `Week ${w} (${y})${i === 1 ? ' - Minggu Berikutnya' : ''}`
      });
    }
    return list;
  }, [selectedWeekNumber, selectedWeekYear]);

  // Monthly next month info & options
  const nextMonthInfo = useMemo(() => {
    const currM = selectedMonth || (new Date().getMonth() + 1);
    const currY = selectedYear || new Date().getFullYear();
    const nextM = currM === 12 ? 1 : currM + 1;
    const nextY = currM === 12 ? currY + 1 : currY;
    return {
      month: nextM,
      year: nextY,
      label: `${INDONESIAN_MONTHS[nextM - 1]} ${nextY}`
    };
  }, [selectedMonth, selectedYear]);

  const upcomingMonthsOptions = useMemo(() => {
    const currM = selectedMonth || (new Date().getMonth() + 1);
    const currY = selectedYear || new Date().getFullYear();
    const list: { month: number; year: number; label: string }[] = [];
    for (let i = 1; i <= 12; i++) {
      let m = currM + i;
      let y = currY;
      if (m > 12) {
        m = m - 12;
        y = y + 1;
      }
      list.push({
        month: m,
        year: y,
        label: `${INDONESIAN_MONTHS[m - 1]} ${y}${i === 1 ? ' - Bulan Berikutnya' : ''}`
      });
    }
    return list;
  }, [selectedMonth, selectedYear]);

  // State for task sub-accordions (by default all open for easy inspection)
  const [openTaskAccordions, setOpenTaskAccordions] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    pendingTasks.forEach((t) => {
      initial[t.id] = true;
    });
    return initial;
  });

  const toggleTaskAccordion = (taskId: string) => {
    setOpenTaskAccordions(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  const allTasksExpanded = useMemo(() => {
    return pendingTasks.length > 0 && pendingTasks.every(t => !!openTaskAccordions[t.id]);
  }, [pendingTasks, openTaskAccordions]);

  const toggleAllTasks = () => {
    const nextVal = !allTasksExpanded;
    const updated: Record<string, boolean> = {};
    pendingTasks.forEach(t => {
      updated[t.id] = nextVal;
    });
    setOpenTaskAccordions(updated);
  };

  // State for rollover decisions on each pending task
  const [decisions, setDecisions] = useState<Record<string, TalTaskRolloverDecision>>(() => {
    const initial: Record<string, TalTaskRolloverDecision> = {};
    pendingTasks.forEach(task => {
      initial[task.id] = {
        taskId: task.id,
        action: 'rollover_tomorrow',
        targetDate: type === 'daily' ? tomorrowInfo.dateStr : undefined,
        targetWeekNumber: type === 'weekly' ? nextWeekInfo.weekNumber : undefined,
        targetWeekYear: type === 'weekly' ? nextWeekInfo.weekYear : undefined,
        targetMonth: type === 'monthly' ? nextMonthInfo.month : undefined,
        targetYear: type === 'monthly' ? nextMonthInfo.year : undefined,
        cancelNotes: ''
      };
    });
    return initial;
  });

  if (!isOpen) return null;

  const scoreDetail = calculateTalReportScore(type, tasks);
  const {
    scorePercent,
    totalMain,
    totalAdditional,
    totalDone,
    totalPending,
    totalTasks,
    formulaText,
    formulaCalculation
  } = scoreDetail;

  const handleDecisionChange = (taskId: string, patch: Partial<TalTaskRolloverDecision>) => {
    setDecisions(prev => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || { taskId, action: 'rollover_tomorrow' }),
        ...patch
      }
    }));
    setErrorMessage('');
  };

  const handleReport = async () => {
    setErrorMessage('');

    // Validate pending task decisions
    if (pendingTasks.length > 0) {
      for (const t of pendingTasks) {
        const d = decisions[t.id];
        if (!d) {
          setErrorMessage(`Silakan tentukan alih tugas untuk "${t.title}".`);
          return;
        }
        if (d.action === 'rollover_date') {
          if (type === 'daily' && !d.targetDate) {
            setErrorMessage(`Silakan pilih tanggal alih tugas untuk "${t.title}".`);
            return;
          }
          if (type === 'weekly' && !d.targetWeekNumber) {
            setErrorMessage(`Silakan pilih minggu target alih tugas untuk "${t.title}".`);
            return;
          }
          if (type === 'monthly' && !d.targetMonth) {
            setErrorMessage(`Silakan pilih bulan target alih tugas untuk "${t.title}".`);
            return;
          }
        }
        if (d.action === 'cancelled' && (!d.cancelNotes || d.cancelNotes.trim().length < 3)) {
          setErrorMessage(`Silakan tuliskan catatan evaluasi pembatalan untuk "${t.title}".`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const rolloverList: TalTaskRolloverDecision[] = pendingTasks.map(t => {
        const d = decisions[t.id];
        if (type === 'weekly') {
          return {
            taskId: t.id,
            action: d?.action || 'rollover_tomorrow',
            targetWeekNumber: d?.action === 'rollover_date' ? (d.targetWeekNumber || nextWeekInfo.weekNumber) : nextWeekInfo.weekNumber,
            targetWeekYear: d?.action === 'rollover_date' ? (d.targetWeekYear || nextWeekInfo.weekYear) : nextWeekInfo.weekYear,
            cancelNotes: d?.cancelNotes
          };
        }
        if (type === 'monthly') {
          return {
            taskId: t.id,
            action: d?.action || 'rollover_tomorrow',
            targetMonth: d?.action === 'rollover_date' ? (d.targetMonth || nextMonthInfo.month) : nextMonthInfo.month,
            targetYear: d?.action === 'rollover_date' ? (d.targetYear || nextMonthInfo.year) : nextMonthInfo.year,
            cancelNotes: d?.cancelNotes
          };
        }
        return d || {
          taskId: t.id,
          action: 'rollover_tomorrow' as const,
          targetDate: tomorrowInfo.dateStr
        };
      });

      await onConfirm(notes, rolloverList);
      onClose();
    } catch (e: unknown) {
      console.error(e);
      setErrorMessage((e as Error)?.message || 'Gagal menyimpan laporan.');
    } finally {
      setLoading(false);
    }
  };

  // Helper for summary badge of selected action
  const getDecisionSummaryBadge = (decision?: TalTaskRolloverDecision) => {
    if (!decision) return null;
    if (decision.action === 'cancelled') {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
          Batalkan Tugas
        </span>
      );
    }
    if (type === 'weekly') {
      if (decision.action === 'rollover_date' && decision.targetWeekNumber) {
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            Ke Week {decision.targetWeekNumber} ({decision.targetWeekYear})
          </span>
        );
      }
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
          Ke Minggu Berikutnya (W{nextWeekInfo.weekNumber})
        </span>
      );
    }
    if (type === 'monthly') {
      if (decision.action === 'rollover_date' && decision.targetMonth) {
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            Ke {INDONESIAN_MONTHS[decision.targetMonth - 1]} {decision.targetYear}
          </span>
        );
      }
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
          Ke Bulan Berikutnya ({nextMonthInfo.label})
        </span>
      );
    }
    // Daily
    if (decision.action === 'rollover_date' && decision.targetDate) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
          Ke {formatIndonesianDate(decision.targetDate)}
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
        Ke Besok
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Compact */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-100 bg-emerald-50/80 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-600 text-white rounded-lg shadow-xs">
              <FileCheck size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">Konfirmasi Laporan (Report)</h3>
              <p className="text-[10.5px] text-emerald-800 font-semibold">{periodLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-emerald-100/60 transition cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-3.5 sm:p-4 space-y-3 overflow-y-auto flex-1 text-xs">

          {/* ACCORDION 1: Rincian Capaian Laporan */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-2xs transition-all">
            <button
              type="button"
              onClick={() => setIsCapaianOpen(!isCapaianOpen)}
              className="w-full flex items-center justify-between p-2.5 sm:px-3 text-left hover:bg-slate-100/70 transition cursor-pointer select-none"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <div className="p-1 bg-emerald-100 text-emerald-700 rounded-md">
                  <CheckSquare size={14} />
                </div>
                <span className="font-bold text-xs text-slate-800">
                  Rincian Capaian Laporan
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {totalDone}/{totalMain} Done ({scorePercent}%)
                </span>
                {totalPending > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    {totalPending} Pending
                  </span>
                )}
              </div>
              <div className="text-slate-400 pl-2">
                {isCapaianOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {isCapaianOpen && (
              <div className="p-2.5 sm:p-3 pt-0 border-t border-slate-200/60 space-y-2 mt-1">
                {/* Metric Grid - Compact */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs pt-1">
                  <div className="p-1.5 sm:p-2 bg-white rounded-lg border border-slate-200/80">
                    <span className="text-[9.5px] text-slate-500 font-medium block">Total Tugas</span>
                    <p className="font-bold text-slate-800">{totalTasks} tugas</p>
                  </div>
                  <div className="p-1.5 sm:p-2 bg-white rounded-lg border border-slate-200/80">
                    <span className="text-[9.5px] text-slate-500 font-medium block">Tugas Utama</span>
                    <p className="font-bold text-slate-800">{totalMain} tugas</p>
                  </div>
                  {type === 'daily' ? (
                    <div className="p-1.5 sm:p-2 bg-white rounded-lg border border-slate-200/80">
                      <span className="text-[9.5px] text-slate-500 font-medium block">Tugas Tambahan</span>
                      <p className="font-bold text-amber-600">{totalAdditional} tugas</p>
                    </div>
                  ) : (
                    <div className="p-1.5 sm:p-2 bg-white rounded-lg border border-slate-200/80">
                      <span className="text-[9.5px] text-slate-500 font-medium block">Tipe Periode</span>
                      <p className="font-bold text-slate-700 capitalize">{type === 'weekly' ? 'Mingguan' : 'Bulanan'}</p>
                    </div>
                  )}
                  <div className="p-1.5 sm:p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                    <span className="text-[9.5px] text-emerald-700 font-medium block">Tugas Selesai (Done)</span>
                    <p className="font-bold text-emerald-700">{totalDone} ({scorePercent}%)</p>
                  </div>
                  <div className="p-1.5 sm:p-2 bg-amber-50 rounded-lg border border-amber-200 col-span-1 sm:col-span-2">
                    <span className="text-[9.5px] text-amber-800 font-medium block">Tugas Pending (Kendala)</span>
                    <p className="font-bold text-amber-800 truncate">{totalPending} tugas (Wajib ditentukan alih tugasnya)</p>
                  </div>
                </div>

                {/* Formula Penilaian - Compact */}
                <div className="p-2 bg-emerald-50/70 border border-emerald-200/70 rounded-lg space-y-0.5">
                  <div className="flex items-center justify-between text-[10.5px] font-bold text-emerald-900">
                    <span className="flex items-center gap-1">
                      <Calculator size={12} className="text-emerald-700" />
                      Formula Penilaian:
                    </span>
                    <span className="text-emerald-700 font-black text-xs">{scorePercent}%</span>
                  </div>
                  <p className="text-[10px] font-mono text-emerald-800 break-all">{formulaText}</p>
                  <p className="text-[10px] font-semibold text-emerald-700">{formulaCalculation}</p>
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 2: MEKANISME ALIH TUGAS (TASK ROLLOVER & BLOCKER TRACKING) */}
          {pendingTasks.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-300 rounded-xl overflow-hidden shadow-2xs transition-all">
              {/* Header Accordion Mekanisme Alih Tugas */}
              <div className="p-2.5 sm:px-3 flex items-center justify-between bg-amber-100/50 border-b border-amber-200/80">
                <button
                  type="button"
                  onClick={() => setIsRolloverSectionOpen(!isRolloverSectionOpen)}
                  className="flex items-center gap-2 text-left flex-1 cursor-pointer select-none"
                >
                  <div className="p-1 bg-amber-500 text-white rounded-md shrink-0">
                    <RotateCw size={14} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-amber-950 leading-tight flex items-center gap-1.5 flex-wrap">
                      <span>Mekanisme Alih Tugas</span>
                      <span className="text-[10px] font-normal text-amber-800">
                        (Task Rollover & Blocker Tracking)
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900">
                        {pendingTasks.length} Pending
                      </span>
                    </h4>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {pendingTasks.length > 1 && (
                    <button
                      type="button"
                      onClick={toggleAllTasks}
                      className="text-[10px] font-semibold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                    >
                      {allTasksExpanded ? 'Tutup Semua' : 'Buka Semua'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsRolloverSectionOpen(!isRolloverSectionOpen)}
                    className="text-amber-700 hover:text-amber-950 cursor-pointer p-0.5"
                  >
                    {isRolloverSectionOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {isRolloverSectionOpen && (
                <div className="p-2.5 sm:p-3 space-y-2">
                  <p className="text-[10.5px] text-amber-800 font-medium">
                    Ditemukan <b>{pendingTasks.length} tugas pending</b>. Tentukan alih tugas untuk masing-masing item di bawah:
                  </p>

                  {/* List of Tasks as Sub-Accordions */}
                  <div className="space-y-2">
                    {pendingTasks.map((t, idx) => {
                      const isOpenTask = !!openTaskAccordions[t.id];
                      const decision = decisions[t.id] || {
                        taskId: t.id,
                        action: 'rollover_tomorrow',
                        targetDate: type === 'daily' ? tomorrowInfo.dateStr : undefined,
                        targetWeekNumber: type === 'weekly' ? nextWeekInfo.weekNumber : undefined,
                        targetWeekYear: type === 'weekly' ? nextWeekInfo.weekYear : undefined,
                        targetMonth: type === 'monthly' ? nextMonthInfo.month : undefined,
                        targetYear: type === 'monthly' ? nextMonthInfo.year : undefined,
                        cancelNotes: ''
                      };

                      return (
                        <div
                          key={t.id}
                          className="bg-white rounded-xl border border-amber-200/80 overflow-hidden shadow-2xs transition-all"
                        >
                          {/* Task Accordion Header - Click to toggle */}
                          <div
                            onClick={() => toggleTaskAccordion(t.id)}
                            className="p-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-amber-50/40 transition select-none"
                          >
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
                                Task #{idx + 1}
                              </span>
                              <span className="text-xs font-bold text-slate-800 truncate max-w-[200px] sm:max-w-xs">
                                {t.title}
                              </span>
                              {t.blockerCategory && (
                                <span className="text-[9.5px] font-medium px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                                  {t.blockerCategory}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {getDecisionSummaryBadge(decision)}
                              <div className="text-slate-400">
                                {isOpenTask ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                              </div>
                            </div>
                          </div>

                          {/* Task Accordion Body */}
                          {isOpenTask && (
                            <div className="p-2.5 pt-0 border-t border-slate-100 space-y-2 mt-1">
                              {/* Blocker Callout - Compact */}
                              <div className="p-1.5 bg-amber-50/70 rounded-lg border border-amber-200/70 text-[10.5px] text-amber-900 flex items-start gap-1.5 mt-1">
                                <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                                <div className="leading-snug">
                                  <span className="font-bold">Kendala ({t.blockerCategory || 'Blocker'}): </span>
                                  <span>{t.blockerDescription || 'Tidak ada catatan kendala rinci'}</span>
                                </div>
                              </div>

                              {/* Rollover 3 Options */}
                              <div className="space-y-1.5 pt-1">
                                <span className="text-[10.5px] font-bold text-slate-700 block">
                                  Pilih Tindak Lanjut:
                                </span>

                                {/* OPSI A: Rollover ke periode berikutnya */}
                                <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition text-xs ${
                                  decision.action === 'rollover_tomorrow'
                                    ? 'bg-blue-50/90 border-blue-400 text-blue-950 font-semibold'
                                    : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}>
                                  <input
                                    type="radio"
                                    name={`rollover_${t.id}`}
                                    checked={decision.action === 'rollover_tomorrow'}
                                    onChange={() => handleDecisionChange(t.id, {
                                      action: 'rollover_tomorrow',
                                      targetDate: type === 'daily' ? tomorrowInfo.dateStr : undefined,
                                      targetWeekNumber: type === 'weekly' ? nextWeekInfo.weekNumber : undefined,
                                      targetWeekYear: type === 'weekly' ? nextWeekInfo.weekYear : undefined,
                                      targetMonth: type === 'monthly' ? nextMonthInfo.month : undefined,
                                      targetYear: type === 'monthly' ? nextMonthInfo.year : undefined,
                                    })}
                                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="font-bold block text-slate-900 leading-tight">
                                      {type === 'weekly' && `Opsi A: Rollover ke Minggu Berikutnya (${nextWeekInfo.label})`}
                                      {type === 'monthly' && `Opsi A: Rollover ke Bulan Berikutnya (${nextMonthInfo.label})`}
                                      {type === 'daily' && `Opsi A: Rollover ke Besok (${tomorrowInfo.label})`}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-normal block leading-tight mt-0.5">
                                      {type === 'weekly' && `Dibuat otomatis sebagai Tugas Utama di minggu berikutnya dengan ID induk tercatat.`}
                                      {type === 'monthly' && `Dibuat otomatis sebagai Tugas Utama di bulan berikutnya dengan ID induk tercatat.`}
                                      {type === 'daily' && `Dibuat otomatis sebagai Tugas Tambahan besok dengan ID induk tercatat.`}
                                    </span>
                                  </div>
                                </label>

                                {/* OPSI B: Rollover ke periode tertentu */}
                                <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition text-xs ${
                                  decision.action === 'rollover_date'
                                    ? 'bg-indigo-50/90 border-indigo-400 text-indigo-950 font-semibold'
                                    : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}>
                                  <input
                                    type="radio"
                                    name={`rollover_${t.id}`}
                                    checked={decision.action === 'rollover_date'}
                                    onChange={() => {
                                      if (type === 'weekly') {
                                        handleDecisionChange(t.id, {
                                          action: 'rollover_date',
                                          targetWeekNumber: decision.targetWeekNumber || upcomingWeeksOptions[0]?.weekNumber,
                                          targetWeekYear: decision.targetWeekYear || upcomingWeeksOptions[0]?.weekYear
                                        });
                                      } else if (type === 'monthly') {
                                        handleDecisionChange(t.id, {
                                          action: 'rollover_date',
                                          targetMonth: decision.targetMonth || upcomingMonthsOptions[0]?.month,
                                          targetYear: decision.targetYear || upcomingMonthsOptions[0]?.year
                                        });
                                      } else {
                                        handleDecisionChange(t.id, {
                                          action: 'rollover_date',
                                          targetDate: decision.targetDate || weekDaysOptions[0]?.dateStr
                                        });
                                      }
                                    }}
                                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="font-bold block text-slate-900 leading-tight">
                                      {type === 'weekly' && 'Opsi B: Rollover ke Minggu Tertentu'}
                                      {type === 'monthly' && 'Opsi B: Rollover ke Bulan Tertentu'}
                                      {type === 'daily' && 'Opsi B: Rollover ke Tanggal Tertentu dalam Minggu Berjalan'}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-normal block mb-1 leading-tight mt-0.5">
                                      {type === 'weekly' && 'Pilih minggu target yang diinginkan:'}
                                      {type === 'monthly' && 'Pilih bulan target yang diinginkan:'}
                                      {type === 'daily' && 'Pilih hari target dalam minggu ini:'}
                                    </span>

                                    {decision.action === 'rollover_date' && (
                                      <div className="mt-1">
                                        {type === 'weekly' ? (
                                          <select
                                            value={`${decision.targetWeekNumber || upcomingWeeksOptions[0]?.weekNumber}-${decision.targetWeekYear || upcomingWeeksOptions[0]?.weekYear}`}
                                            onChange={(e) => {
                                              const [wStr, yStr] = e.target.value.split('-');
                                              handleDecisionChange(t.id, {
                                                targetWeekNumber: parseInt(wStr, 10),
                                                targetWeekYear: parseInt(yStr, 10)
                                              });
                                            }}
                                            className="w-full px-2 py-1 text-xs bg-white border border-indigo-300 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                                          >
                                            {upcomingWeeksOptions.map(opt => (
                                              <option key={`${opt.weekNumber}-${opt.weekYear}`} value={`${opt.weekNumber}-${opt.weekYear}`}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                        ) : type === 'monthly' ? (
                                          <select
                                            value={`${decision.targetMonth || upcomingMonthsOptions[0]?.month}-${decision.targetYear || upcomingMonthsOptions[0]?.year}`}
                                            onChange={(e) => {
                                              const [mStr, yStr] = e.target.value.split('-');
                                              handleDecisionChange(t.id, {
                                                targetMonth: parseInt(mStr, 10),
                                                targetYear: parseInt(yStr, 10)
                                              });
                                            }}
                                            className="w-full px-2 py-1 text-xs bg-white border border-indigo-300 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                                          >
                                            {upcomingMonthsOptions.map(opt => (
                                              <option key={`${opt.month}-${opt.year}`} value={`${opt.month}-${opt.year}`}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <select
                                            value={decision.targetDate || ''}
                                            onChange={(e) => handleDecisionChange(t.id, { targetDate: e.target.value })}
                                            className="w-full px-2 py-1 text-xs bg-white border border-indigo-300 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                                          >
                                            {weekDaysOptions.map(opt => (
                                              <option key={opt.dateStr} value={opt.dateStr}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </label>

                                {/* OPSI C: Tutup / Batalkan Tugas */}
                                <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition text-xs ${
                                  decision.action === 'cancelled'
                                    ? 'bg-rose-50/90 border-rose-400 text-rose-950 font-semibold'
                                    : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}>
                                  <input
                                    type="radio"
                                    name={`rollover_${t.id}`}
                                    checked={decision.action === 'cancelled'}
                                    onChange={() => handleDecisionChange(t.id, {
                                      action: 'cancelled'
                                    })}
                                    className="mt-0.5 text-rose-600 focus:ring-rose-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="font-bold block text-slate-900 leading-tight">
                                      Opsi C: Tutup / Batalkan Tugas
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-normal block mb-1 leading-tight mt-0.5">
                                      Tugas tidak dialihkan dan ditutup permanen dengan catatan evaluasi.
                                    </span>

                                    {decision.action === 'cancelled' && (
                                      <div className="mt-1">
                                        <textarea
                                          rows={2}
                                          value={decision.cancelNotes || ''}
                                          onChange={(e) => handleDecisionChange(t.id, { cancelNotes: e.target.value })}
                                          placeholder="Tuliskan catatan/alasan evaluasi penutupan tugas ini (wajib)..."
                                          className="w-full px-2 py-1 text-xs bg-white border border-rose-300 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Permanent Lock Warning - Compact */}
          <div className="p-2.5 bg-blue-50/80 border border-blue-200/80 rounded-xl text-blue-900 flex items-start gap-2">
            <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="text-[10.5px] leading-relaxed">
              <span className="font-bold">Penguncian Permanen: </span>
              <span>
                Setelah dilaporkan, periode ini berstatus <b>Reported</b>. Detail tugas akan dikunci permanen serta tidak dapat diedit kembali.
              </span>
            </div>
          </div>

          {/* General Report Notes - Compact */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Catatan Evaluasi / Laporan Akhir (Opsional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tuliskan catatan evaluasi pencapaian umum..."
              className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-400"
            />
          </div>

          {/* Error Message if Any */}
          {errorMessage && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-1.5">
              <AlertTriangle size={13} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer - Compact */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 bg-slate-50 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleReport}
            className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <FileCheck size={14} />
            <span>{loading ? 'Menyimpan...' : 'Ya, Laporkan (Report)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TalReportModal;
