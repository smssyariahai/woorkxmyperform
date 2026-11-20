// components/tal/TalStageAccordionModal.tsx — porting src/components/tal/TalStageAccordionModal.tsx backup.
// Adaptasi WOORK: tipe dari lib/tal/types, formatLockDateTime dari lib/tal/date.
'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  Lock,
  History,
  CheckSquare,
  FileText,
  Calculator,
  CheckCircle2,
  TrendingUp
} from 'lucide-react';
import type { TalScopeLockReport, TalTaskType } from '@/lib/tal/types';
import { formatLockDateTime } from '@/lib/tal/date';

interface TalStageAccordionModalProps {
  isOpen: boolean;
  onClose: () => void;
  scope: TalTaskType;
  periodTitle: string;
  scopeState: TalScopeLockReport | null;
  weeklyScopeStateForDaily?: TalScopeLockReport | null;
  tasksCount?: {
    total: number;
    main: number;
    additional: number;
    mainDone: number;
    mainPending: number;
    additionalDone: number;
    additionalPending: number;
    totalDone: number;
    totalPending: number;
  };
  initialOpenStage?: 'planning' | 'progress' | 'reporting';
}

export const TalStageAccordionModal: React.FC<TalStageAccordionModalProps> = ({
  isOpen,
  onClose,
  scope,
  periodTitle,
  scopeState,
  weeklyScopeStateForDaily,
  tasksCount,
  initialOpenStage = 'reporting'
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    planning: initialOpenStage === 'planning',
    progress: initialOpenStage === 'progress',
    reporting: initialOpenStage === 'reporting'
  });

  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape & Outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Click outside listener
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleMouseDown);
    }
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleSection = (section: 'planning' | 'progress' | 'reporting') => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Metrics extraction
  const isPlanLocked = !!scopeState?.isPlanLocked;
  const isReported = !!scopeState?.isReported;

  // Plan stage score
  const planScore = scope === 'daily'
    ? (weeklyScopeStateForDaily?.planScore ?? (weeklyScopeStateForDaily?.isPlanLocked ? 100 : undefined))
    : (scopeState?.planScore ?? (isPlanLocked ? 100 : undefined));

  const planLockedAt = scope === 'daily'
    ? weeklyScopeStateForDaily?.lockedAt
    : scopeState?.lockedAt;

  const planDeadlineAt = scope === 'daily'
    ? weeklyScopeStateForDaily?.planDeadlineAt
    : scopeState?.planDeadlineAt;

  // Realisasi / Progress stage metrics
  const mainTotal = tasksCount?.main ?? scopeState?.reportSummary?.mainTasks ?? scopeState?.mainTaskCount ?? 0;
  const mainDone = tasksCount?.mainDone ?? scopeState?.reportSummary?.mainDone ?? scopeState?.mainDoneCount ?? 0;
  const addDone = tasksCount?.additionalDone ?? scopeState?.reportSummary?.additionalDone ?? scopeState?.additionalDoneCount ?? 0;
  const totalDone = tasksCount?.totalDone ?? scopeState?.reportSummary?.doneTasks ?? scopeState?.doneTaskCount ?? (mainDone + addDone);
  const totalTasks = tasksCount?.total ?? scopeState?.reportSummary?.totalTasks ?? scopeState?.totalTaskCount ?? (mainTotal + (tasksCount?.additional ?? 0));

  const rawProgress = mainTotal > 0 ? ((mainDone + addDone) / mainTotal) * 100 : (totalTasks > 0 ? (totalDone / totalTasks) * 100 : 0);
  const progressScore = scopeState?.progressScore ?? scopeState?.scorePercent ?? Math.min(100, Math.round(rawProgress));

  // Reporting stage metrics
  const reportScore = scopeState?.reportScore ?? (isReported ? 100 : undefined);
  const reportedAt = scopeState?.reportedAt;
  const reportDeadlineAt = scopeState?.reportDeadlineAt;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div
        ref={modalRef}
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[90vh] text-slate-800"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
              <TrendingUp size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 leading-tight">
                Detail Evaluasi Alur TAL (3 Tahap)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {periodTitle} • {scope === 'daily' ? 'Harian' : scope === 'weekly' ? 'Mingguan' : 'Bulanan'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* Mini 3-Stage Score summary badges */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-100/70 border-b border-slate-200">
          {/* Step 1: Planning Badge */}
          <button
            type="button"
            onClick={() => toggleSection('planning')}
            className={`p-2 rounded-xl border text-center transition cursor-pointer ${
              openSections.planning
                ? 'bg-blue-50/90 border-blue-300 ring-2 ring-blue-500/20 shadow-xs'
                : 'bg-white border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Lock size={12} className="text-slate-700" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">1. Planning</span>
            </div>
            <div className={`text-base font-black leading-tight ${
              planScore !== undefined ? (planScore >= 100 ? 'text-emerald-600' : 'text-amber-600') : 'text-slate-400'
            }`}>
              {planScore !== undefined ? planScore : '-'}
            </div>
            <span className="text-[9px] text-slate-500 block leading-tight">
              {planScore !== undefined ? (planScore >= 100 ? 'Tepat Waktu' : 'Terlambat') : 'Belum Terkunci'}
            </span>
          </button>

          {/* Step 2: Progress Badge */}
          <button
            type="button"
            onClick={() => toggleSection('progress')}
            className={`p-2 rounded-xl border text-center transition cursor-pointer ${
              openSections.progress
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-500/20 shadow-xs'
                : 'bg-white border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <History size={12} className="text-amber-600" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">2. Realisasi</span>
            </div>
            <div className="text-base font-black text-amber-600 leading-tight">
              {progressScore}%
            </div>
            <span className="text-[9px] text-slate-500 block leading-tight">
              Pencapaian Task
            </span>
          </button>

          {/* Step 3: Reporting Badge */}
          <button
            type="button"
            onClick={() => toggleSection('reporting')}
            className={`p-2 rounded-xl border text-center transition cursor-pointer ${
              openSections.reporting
                ? 'bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                : 'bg-white border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <CheckSquare size={12} className="text-emerald-600" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">3. Reporting</span>
            </div>
            <div className={`text-base font-black leading-tight ${
              reportScore !== undefined ? (reportScore >= 100 ? 'text-emerald-600' : 'text-amber-600') : 'text-slate-400'
            }`}>
              {reportScore !== undefined ? reportScore : '-'}
            </div>
            <span className="text-[9px] text-slate-500 block leading-tight">
              {reportScore !== undefined ? (reportScore >= 100 ? 'Tepat Waktu' : 'Terlambat') : 'Belum Dilaporkan'}
            </span>
          </button>
        </div>

        {/* Scrollable Accordion Content */}
        <div className="p-3.5 sm:p-4 space-y-3 overflow-y-auto max-h-[60vh]">
          {/* ACCORDION 1: PERENCANAAN (PLANNING) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => toggleSection('planning')}
              className="w-full flex items-center justify-between p-3 bg-slate-50/90 hover:bg-slate-100/80 transition text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <FileText size={13} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Tahap 1: Perencanaan (Planning)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Batas waktu penguncian plan kerja
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {planScore !== undefined && (
                  <span className={`px-2 py-0.5 text-xs font-black rounded-md ${
                    planScore >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    Nilai: {planScore}
                  </span>
                )}
                {openSections.planning ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </div>
            </button>

            {openSections.planning && (
              <div className="p-3.5 bg-white border-t border-slate-200 text-xs space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Status Penguncian</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Lock size={13} className={isPlanLocked ? 'text-emerald-600' : 'text-slate-400'} />
                      {isPlanLocked ? 'Terkunci (Locked)' : 'Belum Dikunci (Drafting)'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Waktu Kunci</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Clock size={13} className="text-slate-500" />
                      {planLockedAt ? formatLockDateTime(planLockedAt) : '-'}
                    </span>
                  </div>
                </div>

                {planDeadlineAt && (
                  <div className="p-2 bg-blue-50/60 rounded-lg border border-blue-100 flex items-center gap-2 text-[11px] text-blue-900">
                    <Calendar size={13} className="text-blue-600 shrink-0" />
                    <span>Batas Waktu: <strong>{formatLockDateTime(planDeadlineAt)}</strong></span>
                  </div>
                )}

                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] space-y-1">
                  <span className="font-bold text-slate-700 block">Aturan Nilai Perencanaan:</span>
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    <li>Kunci sebelum / tepat batas waktu: <strong>Nilai 100</strong></li>
                    <li>Kunci setelah batas waktu (terlambat): <strong>Nilai 50</strong></li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 2: REALISASI / PROGRESS */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => toggleSection('progress')}
              className="w-full flex items-center justify-between p-3 bg-slate-50/90 hover:bg-slate-100/80 transition text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <History size={13} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Tahap 2: Realisasi / Progress
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Pencapaian tugas utama & tugas tambahan
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-black rounded-md bg-amber-100 text-amber-700">
                  {progressScore}%
                </span>
                {openSections.progress ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </div>
            </button>

            {openSections.progress && (
              <div className="p-3.5 bg-white border-t border-slate-200 text-xs space-y-3">
                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-600 font-semibold">Persentase Realisasi</span>
                    <span className="text-amber-700 font-black">{progressScore}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, progressScore))}%` }}
                    />
                  </div>
                </div>

                {/* Breakdown table */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Tugas Utama</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {mainDone} / {mainTotal} Selesai
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Tugas Tambahan</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {addDone} Selesai
                    </span>
                  </div>
                </div>

                {/* Formula note */}
                <div className="p-2.5 bg-amber-50/60 rounded-lg border border-amber-200 text-[11px] space-y-1">
                  <div className="flex items-center gap-1 font-bold text-amber-900">
                    <Calculator size={13} className="text-amber-700" />
                    <span>Rumus Realisasi / Progress:</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded font-mono text-[11px] text-amber-950 border border-amber-100">
                    = (Task Utama Done [{mainDone}] + Task Tambahan Done [{addDone}]) / Total Task Utama [{mainTotal || 1}]
                  </div>
                  <p className="text-[10px] text-slate-600">
                    Maksimal nilai realisasi adalah 100%.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 3: PELAPORAN (REPORTING) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => toggleSection('reporting')}
              className="w-full flex items-center justify-between p-3 bg-slate-50/90 hover:bg-slate-100/80 transition text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckSquare size={13} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Tahap 3: Pelaporan (Reporting)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Batas waktu submit laporan hasil tugas
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {reportScore !== undefined && (
                  <span className={`px-2 py-0.5 text-xs font-black rounded-md ${
                    reportScore >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    Nilai: {reportScore}
                  </span>
                )}
                {openSections.reporting ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </div>
            </button>

            {openSections.reporting && (
              <div className="p-3.5 bg-white border-t border-slate-200 text-xs space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Status Laporan</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 size={13} className={isReported ? 'text-emerald-600' : 'text-slate-400'} />
                      {isReported ? 'Telah Dilaporkan' : 'Belum Dilaporkan'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Waktu Lapor</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Clock size={13} className="text-slate-500" />
                      {reportedAt ? formatLockDateTime(reportedAt) : '-'}
                    </span>
                  </div>
                </div>

                {reportDeadlineAt && (
                  <div className="p-2 bg-emerald-50/60 rounded-lg border border-emerald-100 flex items-center gap-2 text-[11px] text-emerald-900">
                    <Calendar size={13} className="text-emerald-600 shrink-0" />
                    <span>Batas Waktu: <strong>{formatLockDateTime(reportDeadlineAt)}</strong></span>
                  </div>
                )}

                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] space-y-1">
                  <span className="font-bold text-slate-700 block">Aturan Nilai Pelaporan:</span>
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    <li>Submit laporan sebelum / tepat batas waktu: <strong>Nilai 100</strong></li>
                    <li>Submit laporan setelah batas waktu: <strong>Nilai 50</strong></li>
                    <li>
                      Khusus Harian: Jika <em>Nilai Perencanaan (Plan) Minggu berjalan = 50</em>, maka seluruh nilai report harian di minggu tersebut otomatis <strong>50</strong>.
                    </li>
                  </ul>
                </div>

                {scopeState?.reportNotes && (
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Catatan Laporan:</span>
                    <p className="text-[11px] text-slate-700 italic">"{scopeState.reportNotes}"</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default TalStageAccordionModal;
