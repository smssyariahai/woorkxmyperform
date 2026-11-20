// components/tal/dashboard/TalDashboardQuickActions.tsx — 4 aksi cepat
// dinamis (rencana harian, terapkan template, lapor hari ini, lapor
// pekan/bulan).
// Porting src/components/tal/dashboard/TalDashboardQuickActions.tsx (backup
// MyPerform). Adaptasi: impor Link react-router-dom yang tak terpakai di
// backup dibuang; aksi diteruskan lewat callback dari halaman (di backup
// komponen ini tidak dirender TalMain — di WOORK dirender di hub).
// Prop canCreatePlan/hasDailyTasks/canReportToday diterima untuk kompatibilitas
// API backup, namun belum dipakai oleh tampilan saat ini.
'use client';

import React from 'react';
import { PlusCircle, Sparkles, FileCheck, CalendarCheck, CheckCircle2 } from 'lucide-react';

interface TalDashboardQuickActionsProps {
  canCreatePlan?: boolean;
  hasDailyTasks?: boolean;
  canReportToday?: boolean;
  isDailyReported?: boolean;
  onCreateDailyPlan: () => void;
  onApplyRoutineTemplate: () => void;
  onReportToday: () => void;
  onReportWeeklyOrMonthly: () => void;
}

export const TalDashboardQuickActions: React.FC<TalDashboardQuickActionsProps> = ({
  isDailyReported = false,
  onCreateDailyPlan,
  onApplyRoutineTemplate,
  onReportToday,
  onReportWeeklyOrMonthly
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Akses Cepat Dinamis
        </span>
        <span className="text-[10px] text-slate-400 font-medium">
          Aksi Cepat Harian & Periodik
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Action 1: Buat Rencana Harian */}
        <button
          type="button"
          onClick={onCreateDailyPlan}
          className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition">
            <PlusCircle size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition block truncate">
              Rencana Harian
            </span>
            <span className="text-[10px] text-slate-400 block truncate">
              Buat / Tambah Task
            </span>
          </div>
        </button>

        {/* Action 2: Terapkan Template Rutinitas */}
        <button
          type="button"
          onClick={onApplyRoutineTemplate}
          className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 transition-all text-left group cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition">
            <Sparkles size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-slate-800 group-hover:text-amber-600 transition block truncate">
              Terapkan Template
            </span>
            <span className="text-[10px] text-slate-400 block truncate">
              Pilih Preset Rutin
            </span>
          </div>
        </button>

        {/* Action 3: Laporkan Hari Ini */}
        <button
          type="button"
          onClick={onReportToday}
          disabled={isDailyReported}
          className={`flex items-center gap-2 p-2 rounded-xl border transition-all text-left group cursor-pointer ${
            isDailyReported
              ? 'border-emerald-200 bg-emerald-50/30 text-slate-400 cursor-not-allowed'
              : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'
          }`}
        >
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
            isDailyReported
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
          }`}>
            {isDailyReported ? <CheckCircle2 size={15} /> : <FileCheck size={15} />}
          </div>
          <div className="min-w-0 flex-1">
            <span className={`text-xs font-bold transition block truncate ${
              isDailyReported ? 'text-emerald-700' : 'text-slate-800 group-hover:text-emerald-600'
            }`}>
              {isDailyReported ? 'Laporan Selesai' : 'Laporkan Hari Ini'}
            </span>
            <span className="text-[10px] text-slate-400 block truncate">
              {isDailyReported ? 'Sudah disubmit' : 'Kirim Realisasi Harian'}
            </span>
          </div>
        </button>

        {/* Action 4: Laporkan Mingguan/Bulanan */}
        <button
          type="button"
          onClick={onReportWeeklyOrMonthly}
          className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all text-left group cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition">
            <CalendarCheck size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition block truncate">
              Lapor Pekan/Bulan
            </span>
            <span className="text-[10px] text-slate-400 block truncate">
              Rekapitulasi Periodik
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
