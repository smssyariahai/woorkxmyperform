// Laporan TAL satu anggota / gabungan tim — porting dari backup
// src/components/tal/TalTimReport.tsx (read-only untuk anggota tim lain).
'use client';

import { Eye } from 'lucide-react';
import type { TalTimReportData, TalReportTask } from '@/lib/tal/team';

function typeLabel(type: string) {
  if (type === 'daily') return 'Harian';
  if (type === 'weekly') return 'Mingguan';
  if (type === 'monthly') return 'Bulanan';
  return type || '-';
}

function statusLabel(status: string) {
  if (status === 'done') return 'Selesai';
  if (status === 'pending') return 'Tertunda';
  if (status === 'on_progress') return 'Berjalan';
  return 'Belum selesai';
}

function StatCard({ title, sub, total, finish }: { title: string; sub: string; total: number; finish: number }) {
  const pct = total > 0 ? Math.round((finish / total) * 100) : 0;
  return (
    <div className="border border-slate-200 rounded-lg p-2.5 sm:p-3 bg-white">
      <div className="text-[11px] font-semibold text-slate-500">{title}</div>
      <div className="mt-0.5 text-lg sm:text-xl font-bold text-slate-900">
        {finish}
        <span className="text-sm text-slate-400"> / {total}</span>
      </div>
      <div className="mt-1.5 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[11px] leading-tight text-slate-500">
        {pct}% selesai · {total - finish} belum selesai · {sub}
      </div>
    </div>
  );
}

function ChartRows({ rows }: { rows: { label: string; total: number; finish: number }[] }) {
  if (rows.every((r) => r.total === 0)) {
    return <div className="text-xs text-slate-400 py-1">Belum ada data pada periode ini.</div>;
  }
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-[11px]">
          <span className="w-14 shrink-0 text-slate-500">{r.label}</span>
          <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${r.total > 0 ? (r.finish / r.total) * 100 : 0}%` }} />
          </div>
          <span className="w-12 shrink-0 text-right text-slate-600">
            {r.finish}/{r.total}
          </span>
          <span className="w-9 shrink-0 text-right text-slate-400">
            {r.total > 0 ? Math.round((r.finish / r.total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, rows }: { title: string; rows: { label: string; total: number; finish: number }[] }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <h4 className="mb-2 text-sm font-bold text-slate-900">{title}</h4>
      <ChartRows rows={rows} />
    </div>
  );
}

function DetailList({ tasks }: { tasks: TalReportTask[] }) {
  if (!tasks.length) return <div className="text-sm text-slate-400 py-1.5">Belum ada task.</div>;
  return (
    <div className="divide-y divide-slate-100">
      {tasks.map((t) => (
        <div key={t.id} className="py-1.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">{t.title || '(Tanpa judul)'}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {typeLabel(t.type)} · {t.date || '-'} {t.time ? `· ${t.time}` : ''}
            </div>
          </div>
          <span
            className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              t.status === 'done'
                ? 'bg-emerald-100 text-emerald-700'
                : t.status === 'pending'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {statusLabel(t.status)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TalTimReport({ report, readOnly }: { report: TalTimReportData; readOnly?: boolean }) {
  // Pengaman: bila laporan belum lengkap (mis. API berubah bentuk), tampilkan
  // pesan biasa, bukan crash satu halaman.
  if (!report || !report.today || !report.period) {
    return <div className="text-sm text-slate-400 py-1.5">Belum ada laporan.</div>;
  }
  return (
    <div>
      {readOnly && (
        <div className="mb-3 border border-amber-200 bg-amber-50 text-amber-800 text-sm font-medium rounded-lg px-3 py-2 flex items-center gap-2">
          <Eye size={14} /> Mode lihat saja (HANYA LIHAT) — Anda tidak bisa mengubah TAL karyawan ini.
        </div>
      )}
      <div className={`grid gap-2 sm:gap-3 ${report.monthHidden ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <StatCard title="Hari Ini" sub={report.period.today} total={report.today.total} finish={report.today.finish} />
        <StatCard
          title="Minggu Ini"
          sub={`Week ${report.period.weekNumber} · ${report.period.weekStart} s.d. ${report.period.weekEnd}`}
          total={report.week.total}
          finish={report.week.finish}
        />
        {!report.monthHidden && (
          <StatCard
            title="Bulan Ini"
            sub={`${report.period.month}/${report.period.year}`}
            total={report.month.total}
            finish={report.month.finish}
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
        <ChartCard title="Grafik Performa Harian (14 hari terakhir)" rows={report.charts.daily} />
        <ChartCard title="Grafik Performa Mingguan (8 minggu terakhir)" rows={report.charts.weekly} />
        {!report.monthHidden && (
          <ChartCard title="Grafik Performa Bulanan (6 bulan terakhir)" rows={report.charts.monthly} />
        )}
      </div>

      <h4 className="mt-4 mb-1 text-sm font-bold text-slate-900">Detail Task Hari Ini</h4>
      <DetailList tasks={report.today.tasks} />

      <h4 className="mt-4 mb-1 text-sm font-bold text-slate-900">Detail Task Minggu Ini</h4>
      <DetailList tasks={report.week.tasks} />

      {!report.monthHidden && (
        <>
          <h4 className="mt-4 mb-1 text-sm font-bold text-slate-900">Detail Task Bulan Ini</h4>
          <DetailList tasks={report.month.tasks} />
        </>
      )}
    </div>
  );
}

export default TalTimReport;
