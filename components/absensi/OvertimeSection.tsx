// Lembur — ajukan lembur; bila MANAGE, tinjau (setujui/tolak). Lembur yang
// disetujui otomatis muncul di Work Calendar.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MoonStar, Send, Check, X, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  apiJson,
  formatDateKey,
  formatMinutes,
  formatHHMM,
  isValidHHMM,
  todayKeyJakarta,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_BADGE,
  type OvertimeItem,
} from '@/lib/attendance/client';

export function OvertimeSection({ canManage }: { canManage: boolean }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ overtime: OvertimeItem[]; total: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(todayKeyJakarta());
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('21:00');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiJson<{ overtime: OvertimeItem[]; total: number; limit: number }>(
        `/api/absensi/overtime?${params.toString()}`
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pengajuan lembur.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitRequest() {
    if (!date) {
      toast.error('Pilih tanggal lembur.');
      return;
    }
    if (!isValidHHMM(startTime) || !isValidHHMM(endTime)) {
      toast.error('Jam harus format HH:MM (00:00–23:59).');
      return;
    }
    if (startTime === endTime) {
      toast.error('Jam selesai tidak boleh sama dengan jam mulai.');
      return;
    }
    if (!reason.trim()) {
      toast.error('Alasan lembur wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      await apiJson('/api/absensi/overtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, startTime, endTime, reason: reason.trim() }),
      });
      toast.success('Pengajuan lembur terkirim. Menunggu ditinjau HRD/manager.');
      setReason('');
      setPage(1);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengajukan lembur.');
    } finally {
      setSubmitting(false);
    }
  }

  async function review(id: string, action: 'approve' | 'reject') {
    setProcessingId(id);
    try {
      await apiJson('/api/absensi/overtime', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      toast.success(
        action === 'approve'
          ? 'Lembur disetujui — event lembur dibuat di Work Calendar.'
          : 'Lembur ditolak.'
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memproses lembur.');
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <MoonStar className="h-4 w-4 text-brand" /> Lembur
      </h2>
      <p className="mt-1 text-[12px] text-muted">
        Lembur yang disetujui otomatis muncul sebagai event di Work Calendar.
      </p>

      {/* Form pengajuan */}
      <div className="mt-4 rounded-btn border border-line p-3">
        <p className="text-[13px] font-semibold text-ink">Ajukan Lembur</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <label className="text-[12px] text-muted">
            Tanggal
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
            />
          </label>
          <label className="text-[12px] text-muted">
            Jam mulai
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
            />
          </label>
          <label className="text-[12px] text-muted">
            Jam selesai
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
            />
          </label>
          <label className="text-[12px] text-muted">
            Alasan lembur
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mis. menyelesaikan laporan bulanan"
              maxLength={1000}
              className="mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
            />
          </label>
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Bila jam selesai lebih kecil dari jam mulai, dihitung sebagai lembur malam (lintas tengah malam).
        </p>
        <button
          type="button"
          onClick={() => void submitRequest()}
          disabled={submitting}
          className="mt-3 inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Kirim Pengajuan
        </button>
      </div>

      {/* Filter + daftar */}
      <div className="mt-4 flex items-center gap-2">
        <label className="text-[12px] text-muted">
          Status
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="ml-2 rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
          >
            <option value="">Semua</option>
            <option value="PENDING">Menunggu</option>
            <option value="APPROVED">Disetujui</option>
            <option value="REJECTED">Ditolak</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : error ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-warn dark:bg-slate-800/60">{error}</p>
      ) : !data || data.overtime.length === 0 ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Belum ada pengajuan lembur.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {data.overtime.map((o) => (
            <li key={o.id} className="rounded-btn border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    <CalendarDays className="h-3.5 w-3.5 text-muted" />
                    {formatDateKey(o.date)} · {formatHHMM(o.startTime)}–{formatHHMM(o.endTime)}
                    {o.isNight ? ' (malam)' : ''} · {formatMinutes(o.durationMinutes)}
                    {canManage && o.userName ? ` · ${o.userName}` : ''}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">Alasan: {o.reason}</p>
                  {o.approvedByName && (
                    <p className="mt-0.5 text-[12px] text-muted">
                      {o.status === 'APPROVED' ? 'Disetujui' : 'Ditolak'} oleh {o.approvedByName}
                    </p>
                  )}
                </div>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', REVIEW_STATUS_BADGE[o.status] ?? '')}>
                  {REVIEW_STATUS_LABELS[o.status] ?? o.status}
                </span>
              </div>
              {canManage && o.status === 'PENDING' && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void review(o.id, 'approve')}
                    disabled={processingId === o.id}
                    className="inline-flex items-center gap-1 rounded-btn bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Setujui
                  </button>
                  <button
                    type="button"
                    onClick={() => void review(o.id, 'reject')}
                    disabled={processingId === o.id}
                    className="inline-flex items-center gap-1 rounded-btn border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
                  >
                    <X className="h-3.5 w-3.5" /> Tolak
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && data.total > data.limit && (
        <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
          <span>Total {data.total} pengajuan</span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-btn border border-line px-2 py-1 disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <span>Halaman {page}</span>
            <button
              type="button"
              disabled={data.overtime.length < data.limit}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-btn border border-line px-2 py-1 disabled:opacity-40"
            >
              Berikutnya
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
