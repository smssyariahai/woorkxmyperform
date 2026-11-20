// components/tal/TalStageWorkflowBadge.tsx — porting src/components/tal/TalStageWorkflowBadge.tsx backup.
'use client';

import React from 'react';
import {
  FileText,
  History,
  CheckSquare,
  Lock
} from 'lucide-react';

export type TalStageType = 'planning' | 'realization' | 'reported';

interface TalStageWorkflowBadgeProps {
  currentStage: TalStageType;
  planScore?: number; // 100 or 50
  progressScore?: number; // 0 - 100%
  reportScore?: number; // 100 or 50
  isPlanLocked?: boolean;
  isReported?: boolean;
  isReportingPeriodStarted?: boolean; // Today > task date / saturday / month-end at 16:00 WIB
  className?: string;
  onClickPlanning?: () => void;
  onClickProgress?: () => void;
  onClickReporting?: () => void;
  onClickBadgeContainer?: () => void;
}

/**
 * TalStageWorkflowBadge
 * Visual 3-step workflow indicator:
 * 1. PLANNING: [ FileText Planning ] saat aktif; setelah terkunci: Lock + badge skor merah [100]/[50]
 * 2. REALIZATION / PROGRESS: [ History Progress ] saat aktif; setelah ada progress/reported: History + badge skor
 * 3. REPORTING: Reported -> CheckSquare gelap + badge skor merah; belum report tapi sudah masuk
 *    periode pelaporan -> pill [ CheckSquare Reporting ]; belum waktunya -> ikon biasa.
 */
export const TalStageWorkflowBadge: React.FC<TalStageWorkflowBadgeProps> = ({
  currentStage,
  planScore,
  progressScore,
  reportScore,
  isPlanLocked,
  isReported,
  isReportingPeriodStarted = false,
  className = '',
  onClickPlanning,
  onClickProgress,
  onClickReporting,
  onClickBadgeContainer
}) => {
  const hasPlanScore = isPlanLocked || planScore !== undefined;
  const hasProgressScore = progressScore !== undefined && (currentStage === 'realization' || currentStage === 'reported' || isReported);

  const displayPlanScore = planScore !== undefined ? planScore : 100;
  const displayProgressScore = progressScore !== undefined ? Math.round(progressScore) : 100;
  const displayReportScore = reportScore !== undefined ? reportScore : 100;

  const handleContainerClick = (e: React.MouseEvent) => {
    if (onClickBadgeContainer) {
      onClickBadgeContainer();
    }
  };

  // Determine Reporting visual state:
  // 1. isReported: CheckSquare icon in dark slate text-slate-800 with RED SCORE BADGE (no text "Reporting")
  // 2. !isReported && isReportingPeriodStarted: [ CheckSquare Reporting ] pill with text
  // 3. default / early: simple icon without badge
  const showReportingWithText = !isReported && (isReportingPeriodStarted || currentStage === 'reported');
  const showReportingWithScoreBadge = isReported;

  return (
    <div
      onClick={handleContainerClick}
      title="Klik untuk melihat detail alur 3 tahap (Perencanaan, Realisasi, Pelaporan)"
      className={`inline-flex items-center gap-1.5 p-1 bg-slate-100/90 hover:bg-slate-200/70 transition-colors rounded-2xl border border-slate-200/80 shadow-2xs cursor-pointer select-none ${className}`}
    >
      {/* 1. STEP: PLANNING */}
      {currentStage === 'planning' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onClickPlanning) onClickPlanning();
            else if (onClickBadgeContainer) onClickBadgeContainer();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-800 rounded-xl font-bold text-xs shadow-xs border border-slate-200/70 select-none cursor-pointer hover:bg-slate-50 transition"
        >
          <FileText size={16} className="text-blue-600 shrink-0" />
          <span className="tracking-tight">Planning</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onClickPlanning) onClickPlanning();
            else if (onClickBadgeContainer) onClickBadgeContainer();
          }}
          title={`Tahap 1 Perencanaan (Nilai: ${displayPlanScore})`}
          className="relative flex items-center justify-center w-8 h-8 rounded-xl text-slate-800 hover:bg-white/80 transition cursor-pointer"
        >
          <Lock size={17} strokeWidth={2.2} className="text-slate-800 shrink-0" />
          {hasPlanScore && (
            <span className="absolute -top-1.5 -right-1 px-1 py-0.2 min-w-4 text-[9px] font-black rounded-full bg-[#ef4444] text-white shadow-2xs leading-tight text-center">
              {displayPlanScore}
            </span>
          )}
        </button>
      )}

      {/* 2. STEP: PROGRESS / REALISASI */}
      {currentStage === 'realization' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onClickProgress) onClickProgress();
            else if (onClickBadgeContainer) onClickBadgeContainer();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-800 rounded-xl font-bold text-xs shadow-xs border border-slate-200/70 select-none cursor-pointer hover:bg-slate-50 transition"
        >
          <History size={16} strokeWidth={2.2} className="text-amber-500 shrink-0" />
          <span className="tracking-tight">Progress</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onClickProgress) onClickProgress();
            else if (onClickBadgeContainer) onClickBadgeContainer();
          }}
          title={`Tahap 2 Realisasi (Nilai: ${displayProgressScore}%)`}
          className="relative flex items-center justify-center w-8 h-8 rounded-xl text-slate-800 hover:bg-white/80 transition cursor-pointer"
        >
          <History size={17} strokeWidth={2.2} className="text-slate-800 shrink-0" />
          {(hasProgressScore || isReported) && (
            <span className="absolute -top-1.5 -right-1 px-1 py-0.2 min-w-4 text-[9px] font-black rounded-full bg-[#ef4444] text-white shadow-2xs leading-tight text-center">
              {displayProgressScore}
            </span>
          )}
        </button>
      )}

      {/* 3. STEP: REPORTING */}
      {showReportingWithScoreBadge ? (
        /* Kondisi: User SUDAH Report -> Ikon CheckSquare ABU-ABU GELAP (text-slate-800) dengan BADGE NILAI MERAH (tanpa teks "Reporting") */
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onClickReporting) onClickReporting();
            else if (onClickBadgeContainer) onClickBadgeContainer();
          }}
          title={`Tahap 3 Pelaporan Selesai (Nilai Report: ${displayReportScore}) - Klik untuk melihat detail`}
          className="relative flex items-center justify-center w-8 h-8 rounded-xl text-slate-800 hover:bg-white/80 transition cursor-pointer"
        >
          <CheckSquare size={17} strokeWidth={2.2} className="text-slate-800 shrink-0" />
          <span className="absolute -top-1.5 -right-1 px-1 py-0.2 min-w-4 text-[9px] font-black rounded-full bg-[#ef4444] text-white shadow-2xs leading-tight text-center">
            {displayReportScore}
          </span>
        </button>
      ) : showReportingWithText ? (
        /* Kondisi: Today > cutoff 16.00 WIB & Belum Report -> Ikon CheckSquare centang hijau bersanding dengan TEKS "Reporting" */
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onClickReporting) onClickReporting();
            else if (onClickBadgeContainer) onClickBadgeContainer();
          }}
          title="Periode Pelaporan Aktif (Melewati 16.00 WIB) - Klik untuk melihat detail"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-700 rounded-xl font-bold text-xs shadow-xs border border-emerald-300 select-none cursor-pointer hover:bg-emerald-50/70 transition"
        >
          <CheckSquare size={16} strokeWidth={2.2} className="text-emerald-600 shrink-0" />
          <span className="tracking-tight text-slate-800">Reporting</span>
        </button>
      ) : (
        /* Kondisi: Belum Report & Belum jam 16.00 WIB -> Ikon CheckSquare biasa */
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onClickReporting) onClickReporting();
            else if (onClickBadgeContainer) onClickBadgeContainer();
          }}
          title="Tahap 3 Reporting (Belum masuk waktu pelaporan)"
          className="relative flex items-center justify-center w-8 h-8 rounded-xl text-slate-400 hover:bg-white/80 transition cursor-pointer"
        >
          <CheckSquare size={17} strokeWidth={2.2} className="text-slate-400 shrink-0" />
        </button>
      )}
    </div>
  );
};

export default TalStageWorkflowBadge;
