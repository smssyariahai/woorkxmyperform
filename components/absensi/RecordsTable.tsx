// Riwayat absensi — tabel + filter tanggal/status (+ user/departemen bila
// MANAGE) + pagination + modal detail (termasuk riwayat koreksi record).
'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, History } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  apiJson,
  formatTimeId,
  formatDateKey,
  formatMinutes,
  formatHHMM,
  recordStatusLabel,
  recordStatusBadge,
  shiftDateKey,
  todayKeyJakarta,
  METHOD_LABELS,
  type AttendanceRecord,
  type RecordsResponse,
  type Correction,
} from '@/lib/attendance/client';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'PRESENT', label: 'Hadir' },
  { value: 'LATE', label: 'Terlambat' },
  { value: 'EARLY_LEAVE', label: 'Pulang Awal' },
  { value: 'INCOMPLETE', label: 'Belum Check Out' },
];

export function RecordsTable({ canManage }: { canManage: boolean }) {
  const today = todayKeyJakarta();
  const [from, setFrom] = useState(shiftDateKey(today, -30));
  const [to, setTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState('');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AttendanceRecord | null>(null);
  const [detailCorrections, setDetailCorrections] = useState<Correction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from,
        to,
        page: String(page),
        limit: '20',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (canManage && userId.trim()) params.set('userId', userId.trim());
      const res = await apiJson<RecordsResponse>(`/api/absensi/records?${params.toString()}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat riwayat absensi.');
    } finally {
      setLoading(false);
    }
  }, [from, to, page, statusFilter, userId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(rec: AttendanceRecord) {
    setDetail(rec);
    setDetailCorrections([]);
    setDetailLoading(true);
    try {
      // Endpoint koreksi tidak punya filter recordId — ambil halaman pertama
      // (maks 100) lalu saring di klien berdasarkan record ini.
      const res = await apiJson<{ corrections: Correction[] }>(
        '/api/absensi/corrections?limit=100'
      ).catch(() => ({ corrections: [] as Correction[] }));
      setDetailCorrections((res.corrections ?? []).filter((c) => c.recordId === rec.id));
    } finally {
      setDetailLoading(false);
    }
  }

  const summary = data?.summary;

  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <History className="h-4 w-4 text-brand" /> Riwayat Absensi
      </h2>

      {/* Filter */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[12px] text-muted">
          Dari
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="mt-1 block rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
          />
        </label>
        <label className="text-[12px] text-muted">
          Sampai
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="mt-1 block rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
          />
        </label>
        <label className="text-[12px] text-muted">
          Status
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="mt-1 block rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {canManage && (
          <label className="text-[12px] text-muted">
            User ID (opsional)
            <input
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
              placeholder="ID pengguna…"
              className="mt-1 block w-44 rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-btn bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
        >
          Tampilkan
        </button>
      </div>

      {/* Ringkasan */}
      {summary && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {[
            { label: 'Total', value: summary.total },
            { label: 'Hadir', value: summary.present },
            { label: 'Terlambat', value: summary.late },
            { label: 'Pulang Awal', value: summary.earlyLeave },
            { label: 'Belum Check Out', value: summary.incomplete },
            { label: 'Alpha', value: summary.alpha ?? '—' },
            { label: 'Cuti (hari)', value: summary.leaveDays },
            { label: 'Lembur', value: formatMinutes(summary.totalOvertimeMinutes) },
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
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-warn dark:bg-slate-800/60">
          {error}
        </p>
      ) : !data || data.records.length === 0 ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Belum ada record absensi pada rentang ini.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[12px] text-muted">
                  <th className="py-2 pr-2 font-medium">Tanggal</th>
                  {canManage && <th className="py-2 pr-2 font-medium">Karyawan</th>}
                  <th className="py-2 pr-2 font-medium">Masuk</th>
                  <th className="py-2 pr-2 font-medium">Pulang</th>
                  <th className="py-2 pr-2 font-medium">Jam Kerja</th>
                  <th className="py-2 pr-2 font-medium">Status</th>
                  <th className="py-2 pr-2 font-medium">Terlambat</th>
                  <th className="py-2 pr-2 font-medium">Lembur</th>
                  <th className="py-2 pr-2 font-medium">Lokasi</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => void openDetail(r)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="py-2 pr-2 font-medium text-ink">{formatDateKey(r.date)}</td>
                    {canManage && (
                      <td className="py-2 pr-2 text-ink">
                        {r.userName ?? r.userEmail ?? '—'}
                        {r.position ? <span className="block text-[11px] text-muted">{r.position}</span> : null}
                      </td>
                    )}
                    <td className="py-2 pr-2 text-ink">{r.checkInAt ? formatTimeId(r.checkInAt) : '—'}</td>
                    <td className="py-2 pr-2 text-ink">{r.checkOutAt ? formatTimeId(r.checkOutAt) : '—'}</td>
                    <td className="py-2 pr-2 text-ink">{r.workMinutes > 0 ? formatMinutes(r.workMinutes) : '—'}</td>
                    <td className="py-2 pr-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', recordStatusBadge(r.status))}>
                        {recordStatusLabel(r.status)}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-ink">{r.lateMinutes > 0 ? formatMinutes(r.lateMinutes) : '—'}</td>
                    <td className="py-2 pr-2 text-ink">{r.overtimeMinutes > 0 ? formatMinutes(r.overtimeMinutes) : '—'}</td>
                    <td className="py-2 pr-2 text-muted">
                      {r.locationName ?? '—'}
                      {r.isRemote ? ' (Remote)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
            <span>
              Menampilkan {data.records.length} dari {data.total} record
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-btn border border-line p-1.5 disabled:opacity-40"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-1">Halaman {page}</span>
              <button
                type="button"
                disabled={data.records.length < data.limit}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-btn border border-line p-1.5 disabled:opacity-40"
                aria-label="Halaman berikutnya"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </span>
          </div>
        </>
      )}

      {/* Modal detail */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-slate-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">
                  Absensi {formatDateKey(detail.date)}
                </h3>
                <p className="text-[12px] text-muted">
                  {detail.userName ?? detail.userEmail ?? ''}
                  {detail.position ? ` · ${detail.position}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-btn p-1.5 text-muted hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Status</dt>
                <dd className="mt-0.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-semibold', recordStatusBadge(detail.status))}>
                    {recordStatusLabel(detail.status)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Shift</dt>
                <dd className="mt-0.5 text-ink">
                  {detail.shiftName ?? '—'}
                  {detail.shiftStartTime ? ` (${formatHHMM(detail.shiftStartTime)}–${formatHHMM(detail.shiftEndTime)})` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Jam Masuk</dt>
                <dd className="mt-0.5 text-ink">
                  {detail.checkInAt ? formatTimeId(detail.checkInAt) : '—'}
                  {detail.checkInMethod ? ` · ${METHOD_LABELS[detail.checkInMethod] ?? detail.checkInMethod}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Jam Pulang</dt>
                <dd className="mt-0.5 text-ink">
                  {detail.checkOutAt ? formatTimeId(detail.checkOutAt) : '—'}
                  {detail.checkOutMethod ? ` · ${METHOD_LABELS[detail.checkOutMethod] ?? detail.checkOutMethod}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Jam Kerja</dt>
                <dd className="mt-0.5 text-ink">{formatMinutes(detail.workMinutes)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Istirahat</dt>
                <dd className="mt-0.5 text-ink">{formatMinutes(detail.breakMinutes)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Terlambat / Pulang Awal</dt>
                <dd className="mt-0.5 text-ink">
                  {detail.lateMinutes > 0 ? formatMinutes(detail.lateMinutes) : '—'}
                  {' / '}
                  {detail.earlyMinutes > 0 ? formatMinutes(detail.earlyMinutes) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Lembur</dt>
                <dd className="mt-0.5 text-ink">{formatMinutes(detail.overtimeMinutes)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Lokasi</dt>
                <dd className="mt-0.5 text-ink">
                  {detail.locationName ?? '—'}
                  {detail.isRemote ? ' (Remote)' : ''}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Jadwal</dt>
                <dd className="mt-0.5 text-ink">{detail.scheduleName ?? '—'}</dd>
              </div>
            </dl>
            {(detail.checkInNote || detail.checkOutNote) && (
              <div className="mt-4 text-[13px]">
                {detail.checkInNote && <p className="text-muted">Catatan masuk: <span className="text-ink">{detail.checkInNote}</span></p>}
                {detail.checkOutNote && <p className="mt-1 text-muted">Catatan pulang: <span className="text-ink">{detail.checkOutNote}</span></p>}
              </div>
            )}
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-[12px] font-semibold text-ink">Riwayat Koreksi</p>
              {detailLoading ? (
                <p className="mt-2 text-[12px] text-muted">Memuat…</p>
              ) : detailCorrections.length === 0 ? (
                <p className="mt-2 text-[12px] text-muted">Tidak ada pengajuan koreksi untuk record ini.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detailCorrections.map((c) => (
                    <li key={c.id} className="rounded-btn bg-slate-50 p-2.5 text-[12px] dark:bg-slate-800/60">
                      <span className="font-medium text-ink">{c.type}</span>
                      {' — '}
                      <span className="text-muted">{c.reason}</span>
                      <span className={cn('ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold', c.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : c.status === 'REJECTED' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
                        {c.status === 'APPROVED' ? 'Disetujui' : c.status === 'REJECTED' ? 'Ditolak' : 'Menunggu'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
