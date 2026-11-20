// components/tal/TalReportDetailModal.tsx — porting src/components/tal/TalReportDetailModal.tsx backup.
// Adaptasi WOORK: tipe dari lib/tal/types, helper dari lib/tal/date.
'use client';

import React from 'react';
import { CheckCircle2, X, Calculator, User, FileText, CheckSquare, Clock } from 'lucide-react';
import type { TalTaskType, TalScopeLockReport, TalTaskItem } from '@/lib/tal/types';
import { formatLockDateTime, calculateTalReportScore } from '@/lib/tal/date';

interface TalReportDetailModalProps {
  isOpen: boolean;
  type: TalTaskType;
  periodLabel: string;
  scopeState?: TalScopeLockReport | null;
  tasks: TalTaskItem[];
  onClose: () => void;
}

export const TalReportDetailModal: React.FC<TalReportDetailModalProps> = ({
  isOpen,
  type,
  periodLabel,
  scopeState,
  tasks,
  onClose
}) => {
  if (!isOpen) return null;

  // Compute or read saved score metrics
  const scoreDetail = calculateTalReportScore(type, tasks);

  // Prefer stored values if available, fallback to dynamically computed metrics
  const rawScore = scopeState?.scorePercent !== undefined
    ? scopeState.scorePercent
    : (scopeState?.reportSummary?.scorePercent !== undefined
        ? scopeState.reportSummary.scorePercent
        : scoreDetail.scorePercent);
  const scorePercent = Math.min(100, Math.max(0, rawScore));

  const totalMain = scopeState?.mainTaskCount !== undefined
    ? scopeState.mainTaskCount
    : scoreDetail.totalMain;

  const totalAdditional = scopeState?.additionalTaskCount !== undefined
    ? scopeState.additionalTaskCount
    : scoreDetail.totalAdditional;

  const mainDone = scopeState?.mainDoneCount !== undefined
    ? scopeState.mainDoneCount
    : scoreDetail.mainDone;

  const mainPending = scopeState?.mainPendingCount !== undefined
    ? scopeState.mainPendingCount
    : scoreDetail.mainPending;

  const additionalDone = scopeState?.additionalDoneCount !== undefined
    ? scopeState.additionalDoneCount
    : scoreDetail.additionalDone;

  const additionalPending = scopeState?.additionalPendingCount !== undefined
    ? scopeState.additionalPendingCount
    : scoreDetail.additionalPending;

  const totalDone = scopeState?.doneTaskCount !== undefined
    ? scopeState.doneTaskCount
    : scoreDetail.totalDone;

  const totalPending = scopeState?.pendingTaskCount !== undefined
    ? scopeState.pendingTaskCount
    : scoreDetail.totalPending;

  const totalTasks = scopeState?.totalTaskCount !== undefined
    ? scopeState.totalTaskCount
    : scoreDetail.totalTasks;

  const rawDailyCalc = totalMain > 0 ? Math.round(((mainDone + additionalDone) / totalMain) * 100) : 0;
  const rawOtherCalc = (totalMain || totalTasks) > 0 ? Math.round((totalDone / (totalMain || totalTasks)) * 100) : 0;

  const formulaText = type === 'daily'
    ? '=(Task Utama Done + Task Tambahan Done) / Total Task Utama (Maks. 100%)'
    : '=Task Utama Done / Total Task Utama (Maks. 100%)';

  const formulaCalculation = type === 'daily'
    ? (rawDailyCalc > 100
        ? `= (${mainDone} + ${additionalDone}) / ${totalMain || 1} = ${rawDailyCalc}% → 100% (Maks. 100%)`
        : `= (${mainDone} + ${additionalDone}) / ${totalMain || 1} = ${scorePercent}%`)
    : (rawOtherCalc > 100
        ? `= ${mainDone} / ${totalMain || 1} = ${rawOtherCalc}% → 100%`
        : `= ${mainDone} / ${totalMain || 1} = ${scorePercent}%`);

  const reportedAtFormatted = scopeState?.reportedAt
    ? formatLockDateTime(scopeState.reportedAt)
    : '';

  const reporterName = scopeState?.reportedBy || '';
  const notes = scopeState?.reportNotes || scopeState?.reportSummary?.notes;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-emerald-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <CheckCircle2 size={22} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Rincian Nilai Laporan (Reported)</h3>
              <p className="text-[11px] text-emerald-700 font-semibold">{periodLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-emerald-100/50 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Main Score Hero Card with 3-Stage Scores */}
          <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Hasil Penilaian Akhir (Realisasi)
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-4xl font-black text-emerald-700 tracking-tight">
                    {scorePercent}%
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {scorePercent >= 100 ? 'Sempurna' : scorePercent >= 80 ? 'Sangat Baik' : scorePercent >= 50 ? 'Cukup' : 'Perlu Evaluasi'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 font-medium block">Status Periode</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-white px-2 py-1 rounded-lg border border-emerald-200 shadow-2xs mt-0.5">
                  <CheckCircle2 size={12} />
                  Reported
                </span>
              </div>
            </div>

            {/* 3-Stage Scores Summary Badges */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200/70">
              <div className="p-2 bg-white/90 rounded-xl border border-emerald-100 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">1. Planning</span>
                <span className={`text-base font-black ${
                  (scopeState?.planScore ?? 100) >= 100 ? 'text-emerald-700' : 'text-amber-600'
                }`}>
                  {scopeState?.planScore !== undefined ? scopeState.planScore : 100}
                </span>
                <span className="text-[9px] text-slate-400 block">
                  {(scopeState?.planScore ?? 100) >= 100 ? 'Tepat Waktu' : 'Terlambat'}
                </span>
              </div>

              <div className="p-2 bg-white/90 rounded-xl border border-emerald-100 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">2. Realisasi</span>
                <span className="text-base font-black text-emerald-700">
                  {scorePercent}%
                </span>
                <span className="text-[9px] text-slate-400 block">
                  Progress Task
                </span>
              </div>

              <div className="p-2 bg-white/90 rounded-xl border border-emerald-100 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">3. Reporting</span>
                <span className={`text-base font-black ${
                  (scopeState?.reportScore ?? 100) >= 100 ? 'text-emerald-700' : 'text-amber-600'
                }`}>
                  {scopeState?.reportScore !== undefined ? scopeState.reportScore : 100}
                </span>
                <span className="text-[9px] text-slate-400 block">
                  {(scopeState?.reportScore ?? 100) >= 100 ? 'Tepat Waktu' : 'Terlambat'}
                </span>
              </div>
            </div>

            {/* Formula Explanation */}
            <div className="pt-2 border-t border-emerald-200/70">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 mb-1">
                <Calculator size={13} className="text-emerald-700" />
                <span>Rumus Perhitungan Realisasi:</span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100 text-xs font-mono text-emerald-900 space-y-0.5">
                <p className="text-[11px] font-semibold text-slate-700">{formulaText}</p>
                <p className="text-xs font-bold text-emerald-800">{formulaCalculation}</p>
              </div>
              {type === 'daily' && totalAdditional > 0 && (
                <p className="text-[11px] text-emerald-800/90 mt-1.5 leading-relaxed">
                  💡 <b>Catatan:</b> Tugas tambahan yang diselesaikan (Done) menambah nilai pembilang untuk mengompensasi tugas utama yang pending.
                </p>
              )}
            </div>
          </div>

          {/* Breakdown Grid */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <CheckSquare size={14} className="text-slate-500" />
              Rincian Komponen Tugas
            </h4>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {/* Tugas Utama */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Tugas Utama
                </span>
                <p className="text-lg font-black text-slate-900 mt-0.5">{totalMain} tugas</p>
                <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px]">
                  <span className="text-emerald-700 font-semibold">Done: {mainDone}</span>
                  <span className="text-amber-700 font-semibold">Pending: {mainPending}</span>
                </div>
              </div>

              {/* Tugas Tambahan (Hanya daily) / Info Jenis (Weekly/Monthly) */}
              {type === 'daily' ? (
                <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Tugas Tambahan
                  </span>
                  <p className="text-lg font-black text-amber-900 mt-0.5">{totalAdditional} tugas</p>
                  <div className="mt-1.5 pt-1.5 border-t border-amber-200/70 flex items-center justify-between text-[11px]">
                    <span className="text-emerald-700 font-semibold">Done: {additionalDone}</span>
                    <span className="text-amber-700 font-semibold">Pending: {additionalPending}</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Kategori Periode
                  </span>
                  <p className="text-sm font-bold text-slate-800 capitalize mt-1">
                    {type === 'weekly' ? 'Tugas Mingguan' : 'Tugas Bulanan'}
                  </p>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-[11px] text-slate-500">
                    Tidak ada tugas tambahan
                  </div>
                </div>
              )}

              {/* Total Tugas Selesai */}
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Total Selesai (Done)
                </span>
                <p className="text-lg font-black text-emerald-800 mt-0.5">{totalDone} tugas</p>
                <div className="mt-1.5 pt-1.5 border-t border-emerald-200 text-[11px] text-emerald-700 font-medium">
                  {type === 'daily' ? `${mainDone} utama + ${additionalDone} tambahan` : `${totalDone} tugas utama`}
                </div>
              </div>

              {/* Total Tugas Pending */}
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Total Belum Selesai (Pending)
                </span>
                <p className="text-lg font-black text-amber-800 mt-0.5">{totalPending} tugas</p>
                <div className="mt-1.5 pt-1.5 border-t border-amber-200 text-[11px] text-amber-700 font-medium">
                  {type === 'daily' ? `${mainPending} utama + ${additionalPending} tambahan` : `${totalPending} tugas utama`}
                </div>
              </div>
            </div>
          </div>

          {/* Catatan Evaluasi jika ada */}
          {notes && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1">
                <FileText size={13} className="text-slate-500" />
                <span>Catatan Evaluasi / Laporan Akhir:</span>
              </div>
              <p className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 whitespace-pre-wrap">
                {notes}
              </p>
            </div>
          )}

          {/* Audit Meta (Waktu & Pelapor) */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock size={12} className="text-slate-400" />
                Waktu Pelaporan:
              </span>
              <span className="font-bold text-slate-800">{reportedAtFormatted || '-'}</span>
            </div>
            {reporterName && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium">
                  <User size={12} className="text-slate-400" />
                  Dilaporkan Oleh:
                </span>
                <span className="font-bold text-slate-800">{reporterName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3.5 bg-slate-50 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition shadow-2xs cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default TalReportDetailModal;
