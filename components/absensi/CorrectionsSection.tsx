// Koreksi absensi — ajukan koreksi untuk record sendiri; bila MANAGE,
// tinjau (setujui/tolak) semua pengajuan.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileEdit, Send, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  apiJson,
  formatDateKey,
  formatTimeId,
  CORRECTION_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_BADGE,
  shiftDateKey,
  todayKeyJakarta,
  type Correction,
  type AttendanceRecord,
  type RecordsResponse,
} from '@/lib/attendance/client';

const CORRECTION_TYPES = [
  { value: 'CHECK_IN', label: 'Jam Masuk' },
  { value: 'CHECK_OUT', label: 'Jam Pulang' },
  { value: 'STATUS', label: 'Status' },
  { value: 'DATE', label: 'Tanggal' },
];

const CORRECTABLE_STATUSES = ['PRESENT', 'LATE', 'EARLY_LEAVE', 'INCOMPLETE'];
const STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Hadir',
  LATE: 'Terlambat',
  EARLY_LEAVE: 'Pulang Awal',
  INCOMPLETE: 'Belum Check Out',
};

export function CorrectionsSection({ canManage }: { canManage: boolean }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ corrections: Correction[]; total: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form pengajuan
  const [myRecords, setMyRecords] = useState<AttendanceRecord[]>([]);
  const [recordId, setRecordId] = useState('');
  const [type, setType] = useState('CHECK_IN');
  const [valueTime, setValueTime] = useState('');
  const [valueStatus, setValueStatus] = useState('PRESENT');
  const [valueDate, setValueDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiJson<{ corrections: Correction[]; total: number; limit: number }>(
        `/api/absensi/corrections?${params.toString()}`
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pengajuan koreksi.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  const loadMyRecords = useCallback(async () => {
    try {
      const today = todayKeyJakarta();
      const res = await apiJson<RecordsResponse>(
        `/api/absensi/records?from=${shiftDateKey(today, -30)}&to=${today}&limit=50`
      );
      setMyRecords(res.records);
    } catch {
      setMyRecords([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadMyRecords();
  }, [load, loadMyRecords]);

  function requestedValue(): Record<string, unknown> {
    if (type === 'CHECK_IN' || type === 'CHECK_OUT') {
      if (!valueTime) return {};
      const key = type === 'CHECK_IN' ? 'checkInAt' : 'checkOutAt';
      return { [key]: new Date(valueTime).toISOString() };
    }
    if (type === 'STATUS') return { status: valueStatus };
    if (type === 'DATE') return { date: valueDate };
    return {};
  }

  async function submitRequest() {
    if (!recordId) {
      toast.error('Pilih record absensi yang ingin dikoreksi.');
      return;
    }
    const v = requestedValue();
    if (Object.keys(v).length === 0) {
      toast.error('Isi nilai koreksi yang diminta.');
      return;
    }
    if (!reason.trim()) {
      toast.error('Alasan koreksi wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      await apiJson('/api/absensi/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, type, reason: reason.trim(), requestedValue: v }),
      });
      toast.success('Pengajuan koreksi terkirim. Menunggu ditinjau HRD/manager.');
      setReason('');
      setValueTime('');
      setValueDate('');
      setPage(1);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengajukan koreksi.');
    } finally {
      setSubmitting(false);
    }
  }

  async function review(id: string, action: 'approve' | 'reject') {
    setReviewingId(id);
    try {
      await apiJson('/api/absensi/corrections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, reviewNote: reviewNote.trim() || null }),
      });
      toast.success(action === 'approve' ? 'Koreksi disetujui dan record diperbarui.' : 'Koreksi ditolak.');
      setReviewNote('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memproses koreksi.');
    } finally {
      setReviewingId(null);
    }
  }

  function describeValue(c: Correction): string {
    const v = c.requestedValue ?? {};
    if (c.type === 'CHECK_IN' && typeof v.checkInAt === 'string') {
      return `Jam masuk → ${formatTimeId(v.checkInAt)} (${formatDateKey(v.checkInAt.slice(0, 10))})`;
    }
    if (c.type === 'CHECK_OUT' && typeof v.checkOutAt === 'string') {
      return `Jam pulang → ${formatTimeId(v.checkOutAt)} (${formatDateKey(v.checkOutAt.slice(0, 10))})`;
    }
    if (c.type === 'STATUS' && typeof v.status === 'string') {
      return `Status → ${STATUS_LABELS[v.status] ?? v.status}`;
    }
    if (c.type === 'DATE' && typeof v.date === 'string') {
      return `Tanggal → ${formatDateKey(v.date)}`;
    }
    return '—';
  }

  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <FileEdit className="h-4 w-4 text-brand" /> Koreksi Absensi
      </h2>
      <p className="mt-1 text-[12px] text-muted">
        Jam atau status yang salah bisa dikoreksi — pengajuan ditinjau HRD/manager dulu sebelum record berubah.
      </p>

      {/* Form pengajuan */}
      <div className="mt-4 rounded-btn border border-line p-3">
        <p className="text-[13px] font-semibold text-ink">Ajukan Koreksi</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-[12px] text-muted">
            Record absensi
            <select
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              className="mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
            >
              <option value="">— Pilih tanggal —</option>
              {myRecords.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatDateKey(r.date)}
                  {r.checkInAt ? ` · masuk ${formatTimeId(r.checkInAt)}` : ' · belum check in'}
                  {r.checkOutAt ? ` · pulang ${formatTimeId(r.checkOutAt)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-muted">
            Jenis koreksi
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
            >
              {CORRECTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {(type === 'CHECK_IN' || type === 'CHECK_OUT') && (
            <label className="text-[12px] text-muted">
              {type === 'CHECK_IN' ? 'Jam masuk yang benar' : 'Jam pulang yang benar'}
              <input
                type="datetime-local"
                value={valueTime}
                onChange={(e) => setValueTime(e.target.value)}
                className="mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
              />
            </label>
          )}
          {type === 'STATUS' && (
            <label className="text-[12px] text-muted">
              Status yang benar
              <select
                value={valueStatus}
                onChange={(e) => setValueStatus(e.target.value)}
                className="mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
              >
                {CORRECTABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type === 'DATE' && (
            <label className="text-[12px] text-muted">
              Tanggal yang benar
              <input
                type="date"
                value={valueDate}
                onChange={(e) => setValueDate(e.target.value)}
                className="mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
              />
            </label>
          )}
          <label className="text-[12px] text-muted sm:col-span-2">
            Alasan koreksi
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mis. lupa check out karena rapat mendadak"
              maxLength={1000}
              className="mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
            />
          </label>
        </div>
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
      ) : !data || data.corrections.length === 0 ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Belum ada pengajuan koreksi.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {data.corrections.map((c) => (
            <li key={c.id} className="rounded-btn border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {CORRECTION_TYPE_LABELS[c.type] ?? c.type}
                    {c.recordDate ? ` · ${formatDateKey(c.recordDate)}` : ''}
                    {canManage && c.requestedByName ? ` · ${c.requestedByName}` : ''}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">{describeValue(c)}</p>
                  <p className="mt-0.5 text-[12px] text-muted">Alasan: {c.reason}</p>
                  {c.reviewNote && (
                    <p className="mt-0.5 text-[12px] text-muted">
                      Catatan peninjau: {c.reviewNote}
                      {c.reviewedByName ? ` (${c.reviewedByName})` : ''}
                    </p>
                  )}
                </div>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', REVIEW_STATUS_BADGE[c.status] ?? '')}>
                  {REVIEW_STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              {canManage && c.status === 'PENDING' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={reviewingId === c.id ? reviewNote : ''}
                    onChange={(e) => {
                      setReviewingId(c.id);
                      setReviewNote(e.target.value);
                    }}
                    onFocus={() => setReviewingId(c.id)}
                    placeholder="Catatan peninjau (opsional)"
                    className="min-w-[180px] flex-1 rounded-btn border border-line bg-white px-2 py-1.5 text-[12px] text-ink outline-none focus:border-brand dark:bg-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => void review(c.id, 'approve')}
                    className="inline-flex items-center gap-1 rounded-btn bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
                  >
                    <Check className="h-3.5 w-3.5" /> Setujui
                  </button>
                  <button
                    type="button"
                    onClick={() => void review(c.id, 'reject')}
                    className="inline-flex items-center gap-1 rounded-btn border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
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
              disabled={data.corrections.length < data.limit}
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
