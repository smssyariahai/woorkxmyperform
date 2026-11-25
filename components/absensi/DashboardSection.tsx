// Dashboard HRD — ringkasan hari ini, per departemen, per lokasi, tren,
// daftar terlambat + belum check out.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  apiJson,
  formatTimeId,
  formatDateLongId,
  formatDateKey,
  recordStatusLabel,
  type DashboardResponse,
} from '@/lib/attendance/client';

export function DashboardSection() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<DashboardResponse>(`/api/absensi/dashboard?days=${days}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat dashboard absensi.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
        <p className="text-[13px] text-warn">{error ?? 'Dashboard tidak tersedia.'}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-btn border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Coba lagi
        </button>
      </section>
    );
  }

  const t = data.totals;
  const cards = [
    { label: 'Karyawan Aktif', value: t.activeEmployees },
    { label: 'Hadir', value: t.present },
    { label: 'Terlambat', value: t.late },
    { label: 'Pulang Awal', value: t.earlyLeave },
    { label: 'Belum Check Out', value: t.incomplete },
    { label: 'Alpha', value: t.absent },
    { label: 'Belum Check In', value: t.notYetCheckedIn },
    { label: 'Cuti', value: t.leave },
  ];
  const maxTrend = Math.max(1, ...data.trend.map((d) => d.present + d.late + d.absent));

  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <LayoutDashboard className="h-4 w-4 text-brand" /> Dashboard Absensi
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {formatDateLongId(new Date(`${data.date}T00:00:00Z`))}
            {t.holiday ? ` · Libur: ${t.holidayName ?? 'Hari libur'}` : ''}
            {data.scope === 'department' ? ' · Ruang lingkup: departemen saya' : ' · Ruang lingkup: seluruh organisasi'}
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
                days === d ? 'bg-brand text-white' : 'bg-slate-100 text-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
              )}
            >
              {d} hari
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-btn bg-slate-50 p-3 text-center dark:bg-slate-800/60">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{c.label}</p>
            <p className="mt-1 text-[24px] font-bold leading-none text-ink">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tren kehadiran */}
      <div className="mt-5">
        <h3 className="text-[13px] font-semibold text-ink">Tren Kehadiran ({days} hari terakhir)</h3>
        {data.trend.length === 0 ? (
          <p className="mt-2 rounded-btn bg-slate-50 px-3 py-4 text-center text-[12px] text-muted dark:bg-slate-800/60">
            Belum ada data tren.
          </p>
        ) : (
          <div className="mt-3 flex items-end gap-1.5">
            {data.trend.map((d) => {
              const total = d.present + d.late + d.absent;
              const h = Math.max(4, Math.round((total / maxTrend) * 96));
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${formatDateKey(d.date)}: hadir ${d.present}, terlambat ${d.late}, alpha ${d.absent}`}>
                  <span className="text-[11px] font-semibold text-ink">{total}</span>
                  <div className="flex h-24 w-full items-end justify-center gap-0.5">
                    <div className="w-2/5 rounded-t bg-emerald-500" style={{ height: `${Math.max(2, Math.round((d.present / maxTrend) * 96))}px` }} />
                    <div className="w-2/5 rounded-t bg-amber-500" style={{ height: `${Math.max(d.late > 0 ? 3 : 0, Math.round((d.late / maxTrend) * 96))}px` }} />
                    <div className="w-2/5 rounded-t bg-red-400" style={{ height: `${Math.max(d.absent > 0 ? 3 : 0, Math.round((d.absent / maxTrend) * 96))}px` }} />
                  </div>
                  <span className="text-[10px] text-muted">{formatDateKey(d.date).slice(0, 6)}</span>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Hadir</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" /> Terlambat</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" /> Alpha</span>
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Per departemen */}
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Per Departemen (hari ini)</h3>
          {data.byDepartment.length === 0 ? (
            <p className="mt-2 rounded-btn bg-slate-50 px-3 py-4 text-center text-[12px] text-muted dark:bg-slate-800/60">
              Belum ada anggota.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[12px] text-muted">
                    <th className="py-1.5 pr-2 font-medium">Departemen</th>
                    <th className="py-1.5 pr-2 font-medium">Total</th>
                    <th className="py-1.5 pr-2 font-medium">Hadir</th>
                    <th className="py-1.5 pr-2 font-medium">Terlambat</th>
                    <th className="py-1.5 pr-2 font-medium">Alpha</th>
                    <th className="py-1.5 font-medium">Cuti</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDepartment.map((d) => (
                    <tr key={d.departmentId ?? '__none__'} className="border-b border-line last:border-0">
                      <td className="py-1.5 pr-2 font-medium text-ink">{d.departmentName}</td>
                      <td className="py-1.5 pr-2 text-ink">{d.total}</td>
                      <td className="py-1.5 pr-2 text-ink">{d.present}</td>
                      <td className="py-1.5 pr-2 text-ink">{d.late}</td>
                      <td className="py-1.5 pr-2 text-ink">{d.absent}</td>
                      <td className="py-1.5 text-ink">{d.leave}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Per lokasi */}
          <h3 className="mt-4 text-[13px] font-semibold text-ink">Per Lokasi (check-in hari ini)</h3>
          {data.byLocation.length === 0 ? (
            <p className="mt-2 rounded-btn bg-slate-50 px-3 py-4 text-center text-[12px] text-muted dark:bg-slate-800/60">
              Belum ada yang check in hari ini.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {data.byLocation.map((l) => (
                <li key={l.locationId ?? '__remote__'} className="flex items-center justify-between rounded-btn bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800/60">
                  <span className="text-ink">{l.locationName}</span>
                  <span className="font-semibold text-ink">{l.count} orang</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Terlambat + belum check out */}
        <div>
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Terlambat Hari Ini ({data.lateToday.length})
          </h3>
          {data.lateToday.length === 0 ? (
            <p className="mt-2 rounded-btn bg-slate-50 px-3 py-4 text-center text-[12px] text-muted dark:bg-slate-800/60">
              Tidak ada yang terlambat hari ini.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {data.lateToday.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-btn border border-line px-3 py-2 text-[13px]">
                  <span className="text-ink">
                    {r.userName ?? r.userEmail ?? '—'}
                    <span className="block text-[11px] text-muted">
                      {r.checkInAt ? `Masuk ${formatTimeId(r.checkInAt)}` : ''} · {r.shiftName ?? ''}
                    </span>
                  </span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    +{r.lateMinutes} mnt
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Clock className="h-4 w-4 text-violet-500" /> Belum Check Out ({data.notCheckedOut.length})
          </h3>
          {data.notCheckedOut.length === 0 ? (
            <p className="mt-2 rounded-btn bg-slate-50 px-3 py-4 text-center text-[12px] text-muted dark:bg-slate-800/60">
              Semua sudah check out.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {data.notCheckedOut.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-btn border border-line px-3 py-2 text-[13px]">
                  <span className="text-ink">
                    {r.userName ?? r.userEmail ?? '—'}
                    <span className="block text-[11px] text-muted">
                      {recordStatusLabel(r.status)} · {r.checkInAt ? `masuk ${formatTimeId(r.checkInAt)}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
