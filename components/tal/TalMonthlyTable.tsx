// components/tal/TalMonthlyTable.tsx — porting src/components/tal/TalMonthlyTable.tsx backup.
// Adaptasi WOORK:
// - MonthYearPickerValue didefinisikan lokal (backup mengimpor dari MonthYearPicker).
// - Scope key kanonik via scopeKeyFor (bukan format backup monthly_/weekly_/daily_).
// - findUserLock: lock WOORK sudah session-scoped (fetchMyLocks mengembalikan
//   lock milik sendiri), jadi bila currentUserId/email kosong, cocokkan hanya
//   scope + scopeKey.
'use client';

import React, { useState } from 'react';
import {
  Calculator,
  Award,
  Info,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  ChevronDown,
  Building2,
  UserCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { TalScopeLockReport, TalTaskItem } from '@/lib/tal/types';
import {
  INDONESIAN_MONTHS,
  INDONESIAN_MONTHS_SHORT,
  getWeeksInMonth,
  calculateTalReportScore,
  scopeKeyFor
} from '@/lib/tal/date';

export interface MonthYearPickerValue {
  month: number; // 1 - 12
  year: number;
}

export interface MonthlyRekapRow {
  monthKey: string; // e.g. "2026-09"
  month: number;
  year: number;
  monthName: string;

  // Monthly task metrics (Structural)
  monthlyPlanScore: number;
  monthlyRealisasiScore: number;
  monthlyReportScore: number;
  nilaiTaskBulanan: number; // Planning 40% + Realisasi 40% + Reporting 20%

  // Weekly average metrics
  avgNilaiTalMingguan: number;

  // Final monthly TAL score (Structural)
  nilaiTalBulanan: number; // Nilai Task Bulanan 20% + Avg Nilai TAL Mingguan 80%

  // Raw counts
  monthlyTasksCount: number;
  weeksCount: number;
}

interface TalMonthlyTableProps {
  startFilter: MonthYearPickerValue;
  endFilter: MonthYearPickerValue;
  monthlyTasks: TalTaskItem[];
  weeklyTasks: TalTaskItem[];
  dailyTasks: TalTaskItem[];
  allLocks: TalScopeLockReport[];
  isStructural: boolean;
  currentUserId: string;
  currentUserEmail: string;
  currentUserName: string;
}

export const TalMonthlyTable: React.FC<TalMonthlyTableProps> = ({
  startFilter,
  endFilter,
  monthlyTasks,
  weeklyTasks,
  dailyTasks,
  allLocks,
  isStructural,
  currentUserId,
  currentUserEmail,
  currentUserName
}) => {
  const [isExportOpen, setIsExportOpen] = useState(false);

  const getScoreBadgeClass = (score: number) => {
    if (score >= 85) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (score >= 70) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (score >= 50) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-red-50 text-red-700 border-red-200';
  };

  const findUserLock = (scope: string, scopeKey: string) => {
    const userKeys = [
      currentUserId.toLowerCase().trim(),
      currentUserEmail.toLowerCase().trim()
    ].filter(Boolean);

    return allLocks.find(l => {
      const lScope = l.scope || l.type;
      if (lScope !== scope) return false;
      if (l.scopeKey !== scopeKey) return false;
      // Lock WOORK sudah session-scoped (milik sendiri): tanpa identitas
      // pemanggil, cocokkan hanya scope + scopeKey.
      if (userKeys.length === 0) return true;
      const lUid = (l.userId || '').toLowerCase().trim();
      const lEmail = (l.userEmail || '').toLowerCase().trim();
      return userKeys.includes(lUid) || (lEmail && userKeys.includes(lEmail));
    });
  };

  // Calculate monthly rows
  const monthlyRows: MonthlyRekapRow[] = React.useMemo(() => {
    let startY = startFilter.year;
    let startM = startFilter.month;
    let endY = endFilter.year;
    let endM = endFilter.month;

    if (startY > endY || (startY === endY && startM > endM)) {
      const tempY = startY;
      const tempM = startM;
      startY = endY;
      startM = endM;
      endY = tempY;
      endM = tempM;
    }

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

    return monthsInRange.map(({ year, month }) => {
      const monthScopeKey = scopeKeyFor('monthly', { month, year });
      const monthLock = findUserLock('monthly', monthScopeKey);

      // Monthly tasks
      const mTasks = monthlyTasks.filter(t => t.year === year && t.month === month);

      // 1. Monthly Plan Score
      const monthlyPlanScore = monthLock?.isPlanLocked ? (monthLock.planScore ?? 100) : 0;

      // 2. Monthly Realisasi Score
      let monthlyRealisasiScore = 0;
      if (monthLock?.isReported && typeof monthLock.scorePercent === 'number') {
        monthlyRealisasiScore = monthLock.scorePercent;
      } else if (mTasks.length > 0) {
        monthlyRealisasiScore = calculateTalReportScore('monthly', mTasks).scorePercent;
      }

      // 3. Monthly Report Score
      const monthlyReportScore = monthLock?.isReported ? (monthLock.reportScore ?? 100) : 0;

      // 4. Nilai Task Bulanan = Planning 40% + Realisasi 40% + Reporting 20%
      const nilaiTaskBulanan = Number(
        ((monthlyPlanScore * 0.4) + (monthlyRealisasiScore * 0.4) + (monthlyReportScore * 0.2)).toFixed(2)
      );

      // Weekly tasks inside this month
      const weeksInMonth = getWeeksInMonth(year, month);
      const weeklyScoresInMonth: number[] = [];

      weeksInMonth.forEach(w => {
        const weeklyScopeKey = scopeKeyFor('weekly', { weekNumber: w.weekNumber, weekYear: w.weekYear });
        const weeklyLock = findUserLock('weekly', weeklyScopeKey);
        const wTasks = weeklyTasks.filter(t => t.weekYear === w.weekYear && t.weekNumber === w.weekNumber);

        const wPlanScore = weeklyLock?.isPlanLocked ? (weeklyLock.planScore ?? 100) : 0;
        let wRealisasiScore = 0;
        if (weeklyLock?.isReported && typeof weeklyLock.scorePercent === 'number') {
          wRealisasiScore = weeklyLock.scorePercent;
        } else if (wTasks.length > 0) {
          wRealisasiScore = calculateTalReportScore('weekly', wTasks).scorePercent;
        }
        const wReportScore = weeklyLock?.isReported ? (weeklyLock.reportScore ?? 100) : 0;
        const wNilaiTaskMingguan = Number(
          ((wPlanScore * 0.4) + (wRealisasiScore * 0.4) + (wReportScore * 0.2)).toFixed(2)
        );

        // Daily tasks in this week
        const weekDateStrings = new Set(w.days.map(d => d.dateStr));
        const dailyTasksInWeek = dailyTasks.filter(t => t.date && weekDateStrings.has(t.date));

        const dailyScores: { realisasi: number; report: number }[] = [];
        w.days.forEach(day => {
          const dayTasks = dailyTasksInWeek.filter(t => t.date === day.dateStr);
          const dayScopeKey = scopeKeyFor('daily', { dateStr: day.dateStr });
          const dayLock = findUserLock('daily', dayScopeKey);

          if (dayTasks.length > 0 || dayLock) {
            let dRealisasi = 0;
            if (dayLock?.isReported && typeof dayLock.scorePercent === 'number') {
              dRealisasi = dayLock.scorePercent;
            } else if (dayTasks.length > 0) {
              dRealisasi = calculateTalReportScore('daily', dayTasks).scorePercent;
            }
            let dReport = 0;
            if (dayLock?.isReported) {
              dReport = dayLock.reportScore ?? 100;
            }
            dailyScores.push({ realisasi: dRealisasi, report: dReport });
          }
        });

        let avgDRealisasi = 0;
        let avgDReport = 0;
        if (dailyScores.length > 0) {
          avgDRealisasi = dailyScores.reduce((a, b) => a + b.realisasi, 0) / dailyScores.length;
          avgDReport = dailyScores.reduce((a, b) => a + b.report, 0) / dailyScores.length;
        }

        const dNilaiTaskHarian = (avgDRealisasi * (66.67 / 100)) + (avgDReport * (33.33 / 100));
        const finalWeeklyTal = Number(((wNilaiTaskMingguan * 0.4) + (dNilaiTaskHarian * 0.6)).toFixed(2));
        weeklyScoresInMonth.push(finalWeeklyTal);
      });

      const avgNilaiTalMingguan = weeklyScoresInMonth.length > 0
        ? Number((weeklyScoresInMonth.reduce((a, b) => a + b, 0) / weeklyScoresInMonth.length).toFixed(2))
        : 0;

      // Final monthly TAL score:
      // - Structural: (Nilai Task Bulanan 20%) + (Avg Nilai TAL Mingguan 80%)
      // - Staff: Avg Nilai TAL Mingguan 80%
      const nilaiTalBulanan = isStructural
        ? Number(((nilaiTaskBulanan * 0.2) + (avgNilaiTalMingguan * 0.8)).toFixed(2))
        : Number((avgNilaiTalMingguan * 0.8).toFixed(2));

      const monthName = INDONESIAN_MONTHS[month - 1] || `Bulan ${month}`;

      return {
        monthKey: `${year}-${String(month).padStart(2, '0')}`,
        month,
        year,
        monthName,
        monthlyPlanScore,
        monthlyRealisasiScore,
        monthlyReportScore,
        nilaiTaskBulanan,
        avgNilaiTalMingguan,
        nilaiTalBulanan,
        monthlyTasksCount: mTasks.length,
        weeksCount: weeksInMonth.length
      };
    });
  }, [
    startFilter,
    endFilter,
    monthlyTasks,
    weeklyTasks,
    dailyTasks,
    allLocks,
    currentUserId,
    currentUserEmail
  ]);

  // Handle Exports
  const handleExportXLSX = () => {
    setIsExportOpen(false);
    try {
      const dataToExport = isStructural
        ? monthlyRows.map((r, idx) => ({
            'No': idx + 1,
            'Bulan': `${r.monthName} ${r.year}`,
            'Nilai Planning Bulanan': r.monthlyPlanScore,
            'Nilai Realisasi Bulanan (%)': r.monthlyRealisasiScore,
            'Nilai Report Bulanan': r.monthlyReportScore,
            'Nilai Task Bulanan': r.nilaiTaskBulanan,
            'Avg Nilai TAL Mingguan': r.avgNilaiTalMingguan,
            'Nilai TAL Bulanan': r.nilaiTalBulanan
          }))
        : monthlyRows.map((r, idx) => ({
            'No': idx + 1,
            'Bulan': `${r.monthName} ${r.year}`,
            'Nilai TAL Bulanan': r.avgNilaiTalMingguan
          }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap Bulanan');
      XLSX.writeFile(wb, `TAL_Rekapitulasi_Bulanan_${startFilter.year}_${startFilter.month}_sd_${endFilter.year}_${endFilter.month}.xlsx`);
    } catch (err) {
      console.error('Error exporting monthly table to Excel:', err);
    }
  };

  const handleExportCSV = () => {
    setIsExportOpen(false);
    try {
      let headers: string[] = [];
      let rows: (string | number)[][] = [];

      if (isStructural) {
        headers = [
          'No',
          'Bulan',
          'Nilai Planning Bulanan',
          'Nilai Realisasi Bulanan (%)',
          'Nilai Report Bulanan',
          'Nilai Task Bulanan',
          'Avg Nilai TAL Mingguan',
          'Nilai TAL Bulanan'
        ];
        rows = monthlyRows.map((r, idx) => [
          idx + 1,
          `"${r.monthName} ${r.year}"`,
          r.monthlyPlanScore,
          r.monthlyRealisasiScore,
          r.monthlyReportScore,
          r.nilaiTaskBulanan,
          r.avgNilaiTalMingguan,
          r.nilaiTalBulanan
        ]);
      } else {
        headers = ['No', 'Bulan', 'Nilai TAL Bulanan'];
        rows = monthlyRows.map((r, idx) => [
          idx + 1,
          `"${r.monthName} ${r.year}"`,
          r.avgNilaiTalMingguan
        ]);
      }

      const csvContent = '\uFEFF' + [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `TAL_Rekapitulasi_Bulanan_${startFilter.year}_${startFilter.month}_sd_${endFilter.year}_${endFilter.month}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting monthly table to CSV:', err);
    }
  };

  const handleExportPDF = () => {
    setIsExportOpen(false);
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        window.print();
        return;
      }

      const startLabel = `${INDONESIAN_MONTHS[startFilter.month - 1]} ${startFilter.year}`;
      const endLabel = `${INDONESIAN_MONTHS[endFilter.month - 1]} ${endFilter.year}`;
      const printDate = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      let tableHeaderHtml = '';
      let tableRowsHtml = '';

      if (isStructural) {
        tableHeaderHtml = `
          <tr>
            <th rowspan="2" style="border-right: 1px solid #cbd5e1;">No</th>
            <th rowspan="2" style="border-right: 2px solid #64748b;">Bulan</th>
            <th colspan="4" style="border-right: 2px solid #64748b; background: #dbeafe; color: #1e3a8a;">Evaluasi Task Bulanan (Bobot 20%)</th>
            <th colspan="1" style="border-right: 2px solid #64748b; background: #f3e8ff; color: #581c87;">Evaluasi Task Mingguan (Bobot 80%)</th>
            <th rowspan="2" style="background: #d1fae5; color: #064e3b;">Nilai TAL Bulanan</th>
          </tr>
          <tr>
            <th style="border-right: 1px solid #cbd5e1; background: #eff6ff;">Plan</th>
            <th style="border-right: 1px solid #cbd5e1; background: #eff6ff;">Realisasi</th>
            <th style="border-right: 1px solid #cbd5e1; background: #eff6ff;">Report</th>
            <th style="border-right: 2px solid #64748b; background: #dbeafe; color: #1e3a8a;">Nilai Bulanan</th>
            <th style="border-right: 2px solid #64748b; background: #f3e8ff; color: #581c87;">Avg TAL Mingguan</th>
          </tr>
        `;

        monthlyRows.forEach((r, idx) => {
          tableRowsHtml += `
            <tr style="border-bottom: 1px solid #cbd5e1; font-size: 11px;">
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1;">${idx + 1}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 2px solid #64748b; font-weight: bold;">${r.monthName} ${r.year}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1;">${r.monthlyPlanScore}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1; font-weight: bold;">${r.monthlyRealisasiScore}%</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1;">${r.monthlyReportScore}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 2px solid #64748b; font-weight: bold; background: #e0f2fe; color: #0369a1;">${r.nilaiTaskBulanan}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 2px solid #64748b; font-weight: bold; background: #f3e8ff; color: #6b21a8;">${r.avgNilaiTalMingguan}</td>
              <td style="padding: 6px 8px; text-align: center; font-weight: bold; background: #d1fae5; color: #065f46;">${r.nilaiTalBulanan}</td>
            </tr>
          `;
        });
      } else {
        tableHeaderHtml = `
          <tr>
            <th rowspan="2" style="border-right: 1px solid #cbd5e1;">No</th>
            <th rowspan="2" style="border-right: 2px solid #64748b;">Bulan</th>
            <th colspan="1" style="border-right: 2px solid #64748b; background: #f3e8ff; color: #581c87;">Evaluasi Task Mingguan (Bobot 100%)</th>
            <th rowspan="2" style="background: #d1fae5; color: #064e3b;">Nilai TAL Bulanan</th>
          </tr>
          <tr>
            <th style="border-right: 2px solid #64748b; background: #f3e8ff; color: #581c87;">Avg TAL Mingguan</th>
          </tr>
        `;

        monthlyRows.forEach((r, idx) => {
          tableRowsHtml += `
            <tr style="border-bottom: 1px solid #cbd5e1; font-size: 11px;">
              <td style="padding: 6px 8px; text-align: center; border-right: 1px solid #cbd5e1;">${idx + 1}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 2px solid #64748b; font-weight: bold;">${r.monthName} ${r.year}</td>
              <td style="padding: 6px 8px; text-align: center; border-right: 2px solid #64748b; font-weight: bold; background: #f3e8ff; color: #6b21a8;">${r.avgNilaiTalMingguan}</td>
              <td style="padding: 6px 8px; text-align: center; font-weight: bold; background: #d1fae5; color: #065f46;">${r.avgNilaiTalMingguan}</td>
            </tr>
          `;
        });
      }

      const contentHtml = `
        <html>
          <head>
            <title>Rekapitulasi TAL Bulanan</title>
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
            <h1>TAL: Rekapitulasi Matriks Nilai Bulanan (${isStructural ? 'Level Struktural' : 'Level Staff'})</h1>
            <p class="meta">Karyawan: <strong>${currentUserName || currentUserEmail}</strong> | Rentang Periode: <strong>${startLabel} s/d ${endLabel}</strong> | Dicetak: ${printDate}</p>
            <table>
              <thead>
                ${tableHeaderHtml}
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

      printWindow.document.open();
      printWindow.document.write(contentHtml);
      printWindow.document.close();
    } catch (err) {
      console.error('Error exporting monthly table to PDF:', err);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Header Bar */}
        <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calculator size={16} className="text-blue-600 shrink-0" />
            <h3 className="text-xs font-bold text-slate-800">
              Matriks Rekapitulasi TAL Bulanan ({monthlyRows.length} Bulan)
            </h3>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              isStructural
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {isStructural ? <Building2 size={11} /> : <UserCheck size={11} />}
              {isStructural ? 'Level Struktural' : 'Level Staff'}
            </span>
          </div>

          {/* Export Button & Dropdown */}
          <div className="relative export-dropdown-container">
            <button
              type="button"
              id="btn-export-rekap-monthly"
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition active:scale-95 cursor-pointer"
            >
              <Download size={14} className="text-slate-600" />
              <span>Export</span>
              <ChevronDown size={13} className={`text-slate-400 transition-transform duration-200 ${isExportOpen ? 'rotate-180' : ''}`} />
            </button>

            {isExportOpen && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-slate-200/90 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  id="btn-export-xlsx-monthly"
                  onClick={handleExportXLSX}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition text-left font-medium cursor-pointer"
                >
                  <FileSpreadsheet size={15} className="text-emerald-600" />
                  <span>Export .xlsx</span>
                </button>
                <button
                  type="button"
                  id="btn-export-csv-monthly"
                  onClick={handleExportCSV}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-800 transition text-left font-medium cursor-pointer"
                >
                  <FileText size={15} className="text-blue-600" />
                  <span>Export .csv</span>
                </button>
                <button
                  type="button"
                  id="btn-export-pdf-monthly"
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-800 transition text-left font-medium cursor-pointer"
                >
                  <Printer size={15} className="text-red-600" />
                  <span>Export .pdf</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] text-slate-700 uppercase tracking-tight">
                {/* 1. Bulan */}
                <th rowSpan={2} className="py-2.5 px-3 font-bold border-r-2 border-slate-400 bg-slate-100 text-center whitespace-nowrap">
                  Bulan
                </th>

                {isStructural ? (
                  <>
                    {/* Evaluasi Task Bulanan (Bobot 20%) */}
                    <th colSpan={4} className="py-2 px-3 text-center border-r-2 border-slate-400 bg-blue-100/80 text-blue-950 font-bold whitespace-nowrap">
                      Evaluasi Task Bulanan (Bobot 20%)
                    </th>

                    {/* Evaluasi Task Mingguan (Bobot 80%) */}
                    <th colSpan={1} className="py-2 px-3 text-center border-r-2 border-slate-400 bg-purple-100/80 text-purple-950 font-bold whitespace-nowrap">
                      Evaluasi Task Mingguan (Bobot 80%)
                    </th>

                    {/* Nilai TAL Bulanan */}
                    <th rowSpan={2} className="py-2.5 px-3.5 text-center bg-emerald-100/80 text-emerald-950 font-bold whitespace-nowrap">
                      Nilai TAL Bulanan
                    </th>
                  </>
                ) : (
                  <>
                    {/* Staff Group: Task Mingguan (Bobot 100%) */}
                    <th colSpan={1} className="py-2 px-3 text-center border-r-2 border-slate-400 bg-purple-100/80 text-purple-950 font-bold whitespace-nowrap">
                      Evaluasi Task Mingguan (Bobot 100%)
                    </th>

                    {/* Staff Final TAL Bulanan */}
                    <th rowSpan={2} className="py-2.5 px-3.5 text-center bg-emerald-100/80 text-emerald-950 font-bold whitespace-nowrap">
                      Nilai TAL Bulanan
                    </th>
                  </>
                )}
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-tight">
                {isStructural ? (
                  <>
                    <th className="py-2 px-2.5 text-center border-r border-slate-200 whitespace-nowrap">Plan</th>
                    <th className="py-2 px-2.5 text-center border-r border-slate-200 whitespace-nowrap">Realisasi</th>
                    <th className="py-2 px-2.5 text-center border-r border-slate-200 whitespace-nowrap">Report</th>
                    <th className="py-2 px-3 text-center border-r-2 border-slate-400 font-bold bg-blue-50/70 text-blue-900 whitespace-nowrap">
                      Nilai Bulanan
                    </th>
                    <th className="py-2 px-3 text-center border-r-2 border-slate-400 font-bold bg-purple-50/70 text-purple-900 whitespace-nowrap">
                      Avg TAL Mingguan
                    </th>
                  </>
                ) : (
                  <th className="py-2 px-3 text-center border-r-2 border-slate-400 font-bold bg-purple-50/70 text-purple-900 whitespace-nowrap">
                    Avg TAL Mingguan
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthlyRows.length === 0 ? (
                <tr>
                  <td colSpan={isStructural ? 7 : 3} className="py-10 text-center text-slate-400 text-xs">
                    Tidak ada data bulan untuk rentang filter yang dipilih.
                  </td>
                </tr>
              ) : (
                monthlyRows.map((row, idx) => {
                  const nextRow = monthlyRows[idx + 1];
                  const isYearBoundary = nextRow && nextRow.year !== row.year;

                  return (
                    <tr
                      key={row.monthKey}
                      className={`hover:bg-blue-50/30 transition-colors ${
                        isYearBoundary ? 'border-b-2 border-slate-400' : 'border-b border-slate-100'
                      }`}
                    >
                      {/* 1. Bulan */}
                      <td className="py-2.5 px-3 border-r-2 border-slate-400 text-center whitespace-nowrap font-bold text-slate-800 bg-slate-50/30">
                        {INDONESIAN_MONTHS_SHORT[(row.month || 1) - 1]} {String(row.year).slice(-2)}
                      </td>

                    {isStructural ? (
                      <>
                        {/* 2. Nilai Planning Bulanan */}
                        <td className="py-2.5 px-2.5 border-r border-slate-200 text-center whitespace-nowrap font-bold text-slate-700">
                          {row.monthlyPlanScore}
                        </td>

                        {/* 3. Nilai Realisasi Bulanan */}
                        <td className="py-2.5 px-2.5 border-r border-slate-200 text-center whitespace-nowrap font-bold text-slate-800">
                          {row.monthlyRealisasiScore}%
                        </td>

                        {/* 4. Nilai Report Bulanan */}
                        <td className="py-2.5 px-2.5 border-r border-slate-200 text-center whitespace-nowrap font-bold text-slate-700">
                          {row.monthlyReportScore}
                        </td>

                        {/* 5. Nilai Task Bulanan */}
                        <td className="py-2.5 px-3 border-r-2 border-slate-400 text-center whitespace-nowrap bg-blue-50/40">
                          <span className="font-extrabold text-blue-900 text-xs px-2 py-0.5 bg-blue-100/70 rounded-md border border-blue-200">
                            {row.nilaiTaskBulanan}
                          </span>
                        </td>

                        {/* 6. Avg Nilai TAL Mingguan */}
                        <td className="py-2.5 px-3 border-r-2 border-slate-400 text-center whitespace-nowrap bg-purple-50/40">
                          <span className="font-extrabold text-purple-900 text-xs px-2 py-0.5 bg-purple-100/70 rounded-md border border-purple-200">
                            {row.avgNilaiTalMingguan}
                          </span>
                        </td>

                        {/* 7. Nilai TAL Bulanan (FINAL) */}
                        <td className="py-2.5 px-3.5 text-center whitespace-nowrap bg-emerald-50/50">
                          <span className={`inline-flex items-center gap-1 font-black text-xs px-2 py-0.5 rounded-lg border shadow-2xs ${getScoreBadgeClass(row.nilaiTalBulanan)}`}>
                            <Award size={12} className="shrink-0" />
                            <span>{row.nilaiTalBulanan}</span>
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Staff Level row: Avg Nilai TAL Mingguan */}
                        <td className="py-2.5 px-3 border-r-2 border-slate-400 text-center whitespace-nowrap bg-purple-50/40">
                          <span className="font-extrabold text-purple-900 text-xs px-2 py-0.5 bg-purple-100/70 rounded-md border border-purple-200">
                            {row.avgNilaiTalMingguan}
                          </span>
                        </td>

                        {/* Staff Final TAL Bulanan */}
                        <td className="py-2.5 px-3.5 text-center whitespace-nowrap bg-emerald-50/50">
                          <span className={`inline-flex items-center gap-1 font-black text-xs px-2 py-0.5 rounded-lg border shadow-2xs ${getScoreBadgeClass(row.avgNilaiTalMingguan)}`}>
                            <Award size={12} className="shrink-0" />
                            <span>{row.avgNilaiTalMingguan}</span>
                          </span>
                        </td>
                      </>
                    )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Info size={16} className="text-blue-600 shrink-0" />
          <span>Info Formula Rekapitulasi TAL Bulanan ({isStructural ? 'Level Struktural' : 'Level Staff'}):</span>
        </div>
        {isStructural ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1">
              <span className="font-bold text-blue-900">Nilai Task Bulanan</span>
              <p className="text-slate-600 text-[11px]">
                = (Planning × 40%) + (Realisasi × 40%) + (Reporting × 20%)
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1">
              <span className="font-bold text-amber-900">Avg Nilai TAL Mingguan</span>
              <p className="text-slate-600 text-[11px]">
                = Rata-rata Nilai TAL Mingguan di seluruh pekan pada bulan tersebut
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-emerald-200/80 bg-emerald-50/20 space-y-1">
              <span className="font-bold text-emerald-900">Nilai TAL Bulanan</span>
              <p className="text-emerald-800 text-[11px] font-medium">
                = (Nilai Task Bulanan × 20%) + (Avg Nilai TAL Mingguan × 80%)
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white p-3 rounded-xl border border-emerald-200/80 bg-emerald-50/20 text-xs space-y-1">
            <span className="font-bold text-emerald-900">Karyawan Level Staff</span>
            <p className="text-slate-600 text-[11px]">
              Karyawan level Staff tidak diwajibkan membuat Task Bulanan. Evaluasi bulanan dihitung dengan rumus:
            </p>
            <p className="text-emerald-800 text-[11px] font-bold">
              Nilai TAL Bulanan Staff = Avg Nilai TAL Mingguan × 80%
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TalMonthlyTable;
