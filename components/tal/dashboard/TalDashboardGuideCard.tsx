// components/tal/dashboard/TalDashboardGuideCard.tsx — kartu panduan SOP
// TAL (collapsible).
// Porting src/components/tal/dashboard/TalDashboardGuideCard.tsx (backup
// MyPerform) apa adanya (impor CheckCircle yang tak terpakai di backup
// dibuang).
'use client';

import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Lock, Clock, ShieldCheck } from 'lucide-react';

export const TalDashboardGuideCard: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/70 transition cursor-pointer text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BookOpen size={14} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-800 block leading-snug">
              Petunjuk & Panduan Singkat SOP Operasional TAL
            </span>
            <span className="text-[11px] text-slate-500 block leading-none">
              Ringkasan aturan locking, batas toleransi jam lapor, dan standar disiplin kerja
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 shrink-0">
          <span>{isOpen ? 'Tutup Panduan' : 'Lihat Ringkasan SOP'}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {isOpen && (
        <div className="p-3.5 pt-0 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* 1. Aturan Locking */}
          <div className="bg-slate-50/80 rounded-xl p-3 space-y-1.5 border border-slate-100">
            <div className="flex items-center gap-1.5 text-indigo-700 font-bold">
              <Lock size={13} />
              <span>1. Aturan Kunci Rencana (Locking)</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              • <strong>Rencana Mingguan:</strong> Wajib dikunci maksimal <strong>H+2 hari kerja</strong> dari awal pekan (Selasa pukul 23:59).
              <br />
              • <strong>Rencana Bulanan:</strong> Wajib dikunci maksimal <strong>H+3 hari kerja</strong> dari awal bulan.
              <br />
              • Jika melewati batas, status plan dinilai terlambat dan mempengaruhi skor ketepatan.
            </p>
          </div>

          {/* 2. Toleransi Jam Lapor */}
          <div className="bg-slate-50/80 rounded-xl p-3 space-y-1.5 border border-slate-100">
            <div className="flex items-center gap-1.5 text-amber-700 font-bold">
              <Clock size={13} />
              <span>2. Toleransi Jam Pelaporan</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              • <strong>Laporan Harian:</strong> Batas submit pukul <strong>23:59 WIB</strong> pada hari H atau toleransi pagi hari kerja berikutnya sebelum jam kerja dimulai.
              <br />
              • <strong>Laporan Mingguan:</strong> Submit pencapaian akhir pekan (Jumat/Sabtu) setelah seluruh task selesai dievaluasi.
            </p>
          </div>

          {/* 3. SOP Operasional */}
          <div className="bg-slate-50/80 rounded-xl p-3 space-y-1.5 border border-slate-100">
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
              <ShieldCheck size={13} />
              <span>3. Alur 4 Langkah Disiplin TAL</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              1. <strong>Plan:</strong> Susun daftar target kerja secara terukur.
              <br />
              2. <strong>Lock:</strong> Kunci rencana untuk komitmen target.
              <br />
              3. <strong>Execute:</strong> Kerjakan tugas dan update progres berkala.
              <br />
              4. <strong>Report & Rollover:</strong> Kirim laporan realisasi & rollover tugas tertunda.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
