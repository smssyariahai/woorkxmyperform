// Laporan absensi — rekap per karyawan + ekspor CSV.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import {
  apiJson,
  formatMinutes,
  shiftDateKey,
  todayKeyJakarta,
  type ReportResponse,
} from '@/lib/attendance/client';

export function ReportsSection() {
  const today = todayKeyJakarta();
  const [from, setFrom] = useState(shiftDateKey(today, -30));
  const [to, setTo] = useState(today);
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<ReportResponse>(
        `/api/absensi/reports?from=${from}&to=${to}&format=json`
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat laporan absensi.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadCsv() {
    setDownloading(true);
    try {
      const r = await fetch(`/api/absensi/reports?from=${from}&to=${to}&format=csv`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || `Gagal mengunduh CSV (${r.status}).`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-absensi-${from}-${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Laporan CSV berhasil diunduh.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengunduh CSV.');
    } finally {
      setDownloading(false);
    }
  }

  const totals = data?.totals;

  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <BarChart3 className="h-4 w-4 text-brand" /> Laporan Absensi
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">Rekap per karyawan (maksimal 62 hari).</p>
        </div>
        <button
          type="button"
          onClick={() => void downloadCsv()}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Unduh CSV
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[12px] text-muted">
          Dari
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
          />
        </label>
        <label className="text-[12px] text-muted">
          Sampai
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-btn bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
        >
          Tampilkan
        </button>
      </div>

      {totals && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: 'Hari Kerja', value: totals.workDays },
            { label: 'Hadir', value: totals.present },
            { label: 'Terlambat', value: totals.late },
            { label: 'Mnt Terlambat', value: totals.lateMinutes },
            { label: 'Alpha', value: totals.absent },
            { label: 'Cuti (hari)', value: totals.leaveDays },
            { label: 'Lembur', value: formatMinutes(totals.overtimeMinutes) },
          ].map((s) => (
            <div key={s.label} className="rounded-btn bg-slate-50 p-2.5 text-center dark:bg-slate-800/60">
              <p className="text-[11px] text-muted">{s.label}</p>
              <p className="mt-0.5 text-[15px] font-bold text-ink">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : error ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-warn dark:bg-slate-800/60">{error}</p>
      ) : !data || data.rows.length === 0 ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Belum ada data absensi pada rentang ini.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-muted">
                <th className="py-2 pr-2 font-medium">Karyawan</th>
                <th className="py-2 pr-2 font-medium">Hari Kerja</th>
                <th className="py-2 pr-2 font-medium">Hadir</th>
                <th className="py-2 pr-2 font-medium">Terlambat</th>
                <th className="py-2 pr-2 font-medium">Mnt Terlambat</th>
                <th className="py-2 pr-2 font-medium">Pulang Awal</th>
                <th className="py-2 pr-2 font-medium">Lembur</th>
                <th className="py-2 pr-2 font-medium">Jam Kerja</th>
                <th className="py-2 pr-2 font-medium">Alpha</th>
                <th className="py-2 font-medium">Cuti</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.userId} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2 font-medium text-ink">
                    {r.name ?? r.email ?? '—'}
                    <span className="block text-[11px] font-normal text-muted">
                      {[r.position, r.department].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-ink">{r.workDays}</td>
                  <td className="py-2 pr-2 text-ink">{r.present}</td>
                  <td className="py-2 pr-2 text-ink">{r.late}</td>
                  <td className="py-2 pr-2 text-ink">{r.lateMinutes}</td>
                  <td className="py-2 pr-2 text-ink">{r.earlyLeave}</td>
                  <td className="py-2 pr-2 text-ink">{formatMinutes(r.overtimeMinutes)}</td>
                  <td className="py-2 pr-2 text-ink">{formatMinutes(r.workMinutes)}</td>
                  <td className="py-2 pr-2 text-ink">{r.absent}</td>
                  <td className="py-2 text-ink">{r.leaveDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
