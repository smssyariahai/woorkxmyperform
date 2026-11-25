'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, Badge } from '@/components/ui/primitives';
import { formatIDR } from '@/lib/modular';
import { apiJson } from '@/lib/calendar/client';

// ---------------------------------------------------------------------------
// Modul Pemantauan Langganan Master (Fase 5 §7.7).
//
// Kontrak API (desain §6 — dibuat Tugas A, file otomasi + route API):
//   GET  /api/super/subscriptions/monitoring
//        → { items: [{ tenantId, tenantCode, companyName, lifecycleStatus,
//            packageSummary { userTierName, storageTierName, moduleNames,
//            monthlyPrice }, dueAt, paymentStatus { status, label,
//            unpaidInvoice? }, graceDaysRemaining,
//            aiDeposit { available: false, reason },
//            lastAutoAction { action, detail, createdAt } | null }], settings }
//   GET  /api/super/subscriptions/monitoring/[tenantId]
//        → { subscription, history (log status, 50), autoActions (50),
//            invoices (10 terbaru), settings }
//   GET  /api/super/subscriptions/settings → settings
//   PATCH /api/super/subscriptions/settings
//        ← { graceDays 1–30, invoiceLeadDays 1–30,
//            reminderDaysBeforeGraceEnd int[] (0–14, maks 5),
//            retentionReminderDaysBefore 1–30, automationEnabled bool }
//   POST /api/super/subscriptions/[tenantId]/cancel-suspension { reason ≥10 }
//   POST /api/super/subscriptions/[tenantId]/extend-grace { days 1–30, reason ≥10 }
//   POST /api/super/subscriptions/[tenantId]/change-end-date { endDate ISO, reason ≥10 }
//   POST /api/super/subscriptions/[tenantId]/mark-paid
//        { invoiceId?, amount, paidAt?, reason ≥10 }
// Semua aksi manual wajib alasan ≥10 karakter (validasi client, pola Fase 4).
// ---------------------------------------------------------------------------

type BadgeTone = 'green' | 'amber' | 'blue' | 'red' | 'gray';

const LIFECYCLES = ['TRIAL', 'AKTIF', 'MENUNGGAK', 'DITANGGUHKAN', 'NONAKTIF', 'DIHAPUS'] as const;

function lifecycleBadge(status: string): { tone: BadgeTone; label: string } {
  // Catatan: sistem Badge hanya punya 5 tone (tanpa oranye) — DITANGGUHKAN
  // memakai merah seperti DIHAPUS; keduanya dibedakan lewat label.
  switch (status) {
    case 'TRIAL':
      return { tone: 'blue', label: 'Trial' };
    case 'AKTIF':
      return { tone: 'green', label: 'Aktif' };
    case 'MENUNGGAK':
      return { tone: 'amber', label: 'Menunggak' };
    case 'DITANGGUHKAN':
      return { tone: 'red', label: 'Ditangguhkan' };
    case 'NONAKTIF':
      return { tone: 'gray', label: 'Nonaktif' };
    case 'DIHAPUS':
      return { tone: 'red', label: 'Dihapus' };
    default:
      return { tone: 'gray', label: status };
  }
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toDateInput(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

const AUTO_ACTION_LABELS: Record<string, string> = {
  RENEWAL_NOTICE: 'Pemberitahuan perpanjangan',
  RENEWAL_INVOICE_ISSUED: 'Invoice perpanjangan diterbitkan',
  INVOICE_EXPIRED: 'Invoice kedaluwarsa',
  MARKED_OVERDUE: 'Ditandai Menunggak',
  GRACE_REMINDER: 'Pengingat tenggang',
  AUTO_SUSPENDED: 'Penangguhan otomatis',
  RETENTION_REMINDER: 'Pengingat retensi',
  PAYMENT_APPLIED: 'Pembayaran diterapkan',
  MANUAL_REACTIVATE: 'Batalkan penangguhan (manual)',
  MANUAL_GRACE_EXTENDED: 'Tenggang diperpanjang (manual)',
  MANUAL_END_DATE_CHANGED: 'Tanggal berakhir diubah (manual)',
  MANUAL_PAYMENT_CONFIRMED: 'Pembayaran dikonfirmasi (manual)',
};

function autoActionLabel(action: string): string {
  return AUTO_ACTION_LABELS[action] ?? action;
}

const INVOICE_STATUS_TONE: Record<string, BadgeTone> = {
  'Belum Dibayar': 'amber',
  Lunas: 'green',
  Kedaluwarsa: 'gray',
  'Dibatalkan-Diganti': 'gray',
};

function invoiceTotal(inv: any): number {
  if (typeof inv?.transferTotal === 'number') return inv.transferTotal;
  return (inv?.baseAmount ?? 0) + (inv?.ppnAmount ?? 0) + (inv?.uniqueCode ?? 0);
}

type DetailPanel = 'cancel-suspension' | 'extend-grace' | 'change-end-date' | 'mark-paid' | null;

export default function SubscriptionMonitoringClient() {
  const [items, setItems] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState('');

  // Form pengaturan otomasi.
  const [graceDays, setGraceDays] = useState(14);
  const [invoiceLeadDays, setInvoiceLeadDays] = useState(7);
  const [reminderDaysText, setReminderDaysText] = useState('7,3,1');
  const [retentionReminderDaysBefore, setRetentionReminderDaysBefore] = useState(7);
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [settingsDirty, setSettingsDirty] = useState(false);

  // Form aksi manual di detail.
  const [panel, setPanel] = useState<DetailPanel>(null);
  const [reason, setReason] = useState('');
  const [graceDaysExtra, setGraceDaysExtra] = useState(5);
  const [endDate, setEndDate] = useState('');
  const [markInvoiceId, setMarkInvoiceId] = useState('');
  const [markAmount, setMarkAmount] = useState('');
  const [markPaidAt, setMarkPaidAt] = useState(todayInput());

  const loadMonitoring = useCallback(async () => {
    try {
      const j = await apiJson<any>('/api/super/subscriptions/monitoring');
      setItems(Array.isArray(j?.items) ? j.items : []);
      if (j?.settings) applySettings(j.settings);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Gagal memuat pemantauan langganan.');
    } finally {
      setLoading(false);
    }
  }, []);

  function applySettings(s: any) {
    setSettings(s);
    setGraceDays(typeof s?.graceDays === 'number' ? s.graceDays : 14);
    setInvoiceLeadDays(typeof s?.invoiceLeadDays === 'number' ? s.invoiceLeadDays : 7);
    setReminderDaysText(
      Array.isArray(s?.reminderDaysBeforeGraceEnd) ? s.reminderDaysBeforeGraceEnd.join(',') : '7,3,1',
    );
    setRetentionReminderDaysBefore(
      typeof s?.retentionReminderDaysBefore === 'number' ? s.retentionReminderDaysBefore : 7,
    );
    setAutomationEnabled(s?.automationEnabled !== false);
    setSettingsDirty(false);
  }

  const loadDetail = useCallback(async (tenantId: string) => {
    setDetailLoading(true);
    try {
      const j = await apiJson<any>(`/api/super/subscriptions/monitoring/${tenantId}`);
      setDetail(j);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat detail tenant.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonitoring();
  }, [loadMonitoring]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it: any) => {
      if (lifecycleFilter && it.lifecycleStatus !== lifecycleFilter) return false;
      if (needle && !`${it.companyName ?? ''} ${it.tenantCode ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [items, lifecycleFilter, q]);

  function markDirty() {
    setSettingsDirty(true);
  }

  function parseReminderDays(): number[] | null {
    const parts = reminderDaysText
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p !== '');
    if (parts.length === 0 || parts.length > 5) return null;
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 14)) return null;
    return [...new Set(nums)].sort((a, b) => b - a);
  }

  async function saveSettings() {
    if (!Number.isInteger(graceDays) || graceDays < 1 || graceDays > 30) {
      toast.error('Tenggang (graceDays) harus 1–30 hari.');
      return;
    }
    if (!Number.isInteger(invoiceLeadDays) || invoiceLeadDays < 1 || invoiceLeadDays > 30) {
      toast.error('Jarak terbit invoice (invoiceLeadDays) harus 1–30 hari.');
      return;
    }
    const reminderDays = parseReminderDays();
    if (!reminderDays) {
      toast.error('Pengingat tenggang: isi 1–5 angka 0–14, pisahkan dengan koma (mis. 7,3,1).');
      return;
    }
    if (!Number.isInteger(retentionReminderDaysBefore) || retentionReminderDaysBefore < 1 || retentionReminderDaysBefore > 30) {
      toast.error('Pengingat retensi harus 1–30 hari.');
      return;
    }
    setBusy('settings');
    try {
      const j = await apiJson<any>('/api/super/subscriptions/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graceDays,
          invoiceLeadDays,
          reminderDaysBeforeGraceEnd: reminderDays,
          retentionReminderDaysBefore,
          automationEnabled,
        }),
      });
      applySettings(j?.settings ?? j);
      toast.success('Pengaturan otomasi disimpan.');
      await loadMonitoring();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setBusy('');
    }
  }

  function openPanel(p: DetailPanel) {
    setPanel(p);
    setReason('');
    const sub = detail?.subscription;
    if (p === 'change-end-date') {
      const due = sub?.lifecycleStatus === 'TRIAL' ? sub?.trialEndsAt : sub?.currentPeriodEndsAt;
      setEndDate(toDateInput(due));
    }
    if (p === 'mark-paid') {
      const unpaid = (detail?.invoices ?? []).filter((inv: any) => inv.status === 'Belum Dibayar');
      const first = unpaid[0];
      setMarkInvoiceId(first?.id ?? '');
      setMarkAmount(first ? String(invoiceTotal(first)) : '');
      setMarkPaidAt(todayInput());
    }
  }

  function requireReason(): boolean {
    if (reason.trim().length < 10) {
      toast.error('Alasan wajib diisi minimal 10 karakter.');
      return false;
    }
    return true;
  }

  async function postManual(path: string, body: any, okMsg: string) {
    setBusy(path);
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Aksi gagal.');
      toast.success(okMsg);
      setPanel(null);
      setReason('');
      await loadDetail(selectedId!);
      await loadMonitoring();
    } catch (e: any) {
      toast.error(e.message || 'Aksi gagal.');
    } finally {
      setBusy('');
    }
  }

  async function submitManual() {
    if (!selectedId || !panel) return;
    if (!requireReason()) return;
    const base = `/api/super/subscriptions/${selectedId}`;
    if (panel === 'cancel-suspension') {
      await postManual(`${base}/cancel-suspension`, { reason: reason.trim() }, 'Penangguhan dibatalkan.');
    } else if (panel === 'extend-grace') {
      if (!Number.isInteger(graceDaysExtra) || graceDaysExtra < 1 || graceDaysExtra > 30) {
        toast.error('Tambahan tenggang harus 1–30 hari.');
        return;
      }
      await postManual(
        `${base}/extend-grace`,
        { days: graceDaysExtra, reason: reason.trim() },
        'Tenggang diperpanjang.',
      );
    } else if (panel === 'change-end-date') {
      if (!endDate) {
        toast.error('Pilih tanggal berakhir yang baru.');
        return;
      }
      const iso = new Date(`${endDate}T00:00:00`).toISOString();
      if (new Date(iso).getTime() <= Date.now()) {
        toast.error('Tanggal berakhir baru harus di masa depan.');
        return;
      }
      await postManual(
        `${base}/change-end-date`,
        { endDate: iso, reason: reason.trim() },
        'Tanggal berakhir diubah.',
      );
    } else if (panel === 'mark-paid') {
      const amount = Number(markAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error('Jumlah pembayaran harus lebih dari 0.');
        return;
      }
      const paidAt = markPaidAt ? new Date(`${markPaidAt}T00:00:00`).toISOString() : undefined;
      await postManual(
        `${base}/mark-paid`,
        {
          invoiceId: markInvoiceId || undefined,
          amount,
          paidAt,
          reason: reason.trim(),
        },
        'Pembayaran ditandai lunas — langganan diperpanjang.',
      );
    }
  }

  const selected = selectedId ? items.find((it: any) => it.tenantId === selectedId) : null;
  const sub = detail?.subscription;
  const subLb = lifecycleBadge(sub?.lifecycleStatus ?? '');
  const unpaidInvoices: any[] = (detail?.invoices ?? []).filter((inv: any) => inv.status === 'Belum Dibayar');
  const selectedInvoice = unpaidInvoices.find((inv: any) => inv.id === markInvoiceId);

  return (
    <div className="space-y-5">
      {/* Kartu pengaturan otomasi */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-bold text-ink">Pengaturan Otomasi</h2>
            <p className="text-[13px] text-muted mt-0.5">
              Aturan otomatis §7.7 — berlaku untuk semua tenant. Perubahan dicatat di audit.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <input
              type="checkbox"
              checked={automationEnabled}
              onChange={(e) => {
                setAutomationEnabled(e.target.checked);
                markDirty();
              }}
            />
            Otomasi aktif
          </label>
        </div>

        {!automationEnabled && (
          <div className="mt-3 rounded-btn border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-[13.5px] font-semibold text-amber-900">
              Peringatan: mematikan otomasi menghentikan SEMUA aksi otomatis — termasuk terbit
              invoice perpanjangan, penanda Menunggak, penangguhan otomatis, dan kedaluwarsa
              invoice. Master yang mematikan otomasi bertanggung jawab atas tindak lanjut manual.
            </p>
          </div>
        )}

        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block">
            <span className="text-[12px] text-muted">Tenggang Menunggak (hari)</span>
            <input
              type="number"
              min={1}
              max={30}
              value={graceDays}
              onChange={(e) => {
                setGraceDays(Number(e.target.value));
                markDirty();
              }}
              className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink"
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-muted">Invoice terbit sebelum jatuh tempo (hari)</span>
            <input
              type="number"
              min={1}
              max={30}
              value={invoiceLeadDays}
              onChange={(e) => {
                setInvoiceLeadDays(Number(e.target.value));
                markDirty();
              }}
              className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink"
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-muted">Pengingat tenggang (sisa hari, koma)</span>
            <input
              type="text"
              value={reminderDaysText}
              onChange={(e) => {
                setReminderDaysText(e.target.value);
                markDirty();
              }}
              placeholder="7,3,1"
              className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink"
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-muted">Pengingat retensi sebelum habis (hari)</span>
            <input
              type="number"
              min={1}
              max={30}
              value={retentionReminderDaysBefore}
              onChange={(e) => {
                setRetentionReminderDaysBefore(Number(e.target.value));
                markDirty();
              }}
              className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveSettings}
            disabled={!settingsDirty || busy === 'settings'}
            className="rounded-btn bg-brand px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
          >
            {busy === 'settings' ? 'Menyimpan…' : 'Simpan Pengaturan'}
          </button>
          {!settingsDirty && settings && (
            <span className="text-[12.5px] text-muted">Pengaturan tersimpan.</span>
          )}
        </div>
      </Card>

      {/* Filter + tabel tenant */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-bold text-ink">Tenant</h2>
          <select
            value={lifecycleFilter}
            onChange={(e) => setLifecycleFilter(e.target.value)}
            className="rounded-btn border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink"
            aria-label="Filter status langganan"
          >
            <option value="">Semua status</option>
            {LIFECYCLES.map((s) => (
              <option key={s} value={s}>
                {lifecycleBadge(s).label}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari perusahaan / kode tenant…"
            className="min-w-[220px] flex-1 rounded-btn border border-line bg-white px-3 py-1.5 text-[13px] text-ink"
          />
          <span className="text-[12.5px] text-muted">{filtered.length} tenant</span>
        </div>

        {loading ? (
          <p className="mt-4 text-[13.5px] text-muted">Memuat…</p>
        ) : error ? (
          <p className="mt-4 text-[13.5px] text-danger">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-[13.5px] text-muted">Tidak ada tenant yang cocok.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2 pr-3 font-medium">Perusahaan</th>
                  <th className="py-2 pr-3 font-medium">Paket</th>
                  <th className="py-2 pr-3 font-medium">Berakhir</th>
                  <th className="py-2 pr-3 font-medium">Pembayaran</th>
                  <th className="py-2 pr-3 font-medium">Sisa tenggang</th>
                  <th className="py-2 pr-3 font-medium">Deposit AI</th>
                  <th className="py-2 font-medium">Aksi otomatis terakhir</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it: any) => {
                  const lb = lifecycleBadge(it.lifecycleStatus ?? '');
                  const ps = it.paymentStatus ?? {};
                  const unpaid = ps.unpaidInvoice;
                  const last = it.lastAutoAction;
                  return (
                    <tr
                      key={it.tenantId}
                      onClick={() => setSelectedId(it.tenantId)}
                      className={`cursor-pointer border-b border-line hover:bg-canvas ${
                        selectedId === it.tenantId ? 'bg-canvas' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-3">
                        <span className="font-semibold text-ink">{it.companyName}</span>
                        <span className="block text-[12px] text-muted">
                          <code className="bg-canvas px-1 rounded">{it.tenantCode}</code>{' '}
                          <Badge tone={lb.tone}>{lb.label}</Badge>
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-ink">
                        {it.packageSummary
                          ? `${it.packageSummary.userTierName ?? '—'} · ${it.packageSummary.storageTierName ?? '—'}${it.packageSummary.moduleNames?.length ? ` · ${it.packageSummary.moduleNames.join(', ')}` : ''}`
                          : '—'}
                        {typeof it.packageSummary?.monthlyPrice === 'number' && (
                          <span className="block text-[12px] text-muted">
                            {formatIDR(it.packageSummary.monthlyPrice)}/bln
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-ink">{fmtDate(it.dueAt)}</td>
                      <td className="py-2.5 pr-3 text-ink">
                        {ps.label ?? ps.status ?? '—'}
                        {unpaid && (
                          <span className="block text-[12px] text-muted">
                            {unpaid.number}
                            {unpaid.validUntil ? ` · berlaku s.d. ${fmtDateTime(unpaid.validUntil)}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-ink">
                        {typeof it.graceDaysRemaining === 'number'
                          ? `${it.graceDaysRemaining} hari`
                          : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-muted">Belum tersedia</td>
                      <td className="py-2.5 text-ink">
                        {last ? (
                          <>
                            {autoActionLabel(last.action)}
                            <span className="block text-[12px] text-muted">
                              {last.detail ?? ''}
                              {last.createdAt ? ` · ${fmtDateTime(last.createdAt)}` : ''}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12.5px] text-muted">
          Klik baris untuk melihat detail, riwayat, log otomasi, invoice, dan aksi manual.
        </p>
      </Card>

      {/* Detail per tenant */}
      {selectedId && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-ink">
              Detail — {selected?.companyName ?? detail?.tenant?.companyName ?? selectedId}
            </h2>
            <div className="flex items-center gap-2">
              {sub && <Badge tone={subLb.tone}>{subLb.label}</Badge>}
              <Link
                href={`/admin/tenants/${selectedId}`}
                className="rounded-btn border border-line px-3 py-1.5 text-[13px] font-medium text-ink"
              >
                Detail Tenant →
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                  setPanel(null);
                }}
                className="rounded-btn border border-line px-3 py-1.5 text-[13px] text-ink"
              >
                Tutup
              </button>
            </div>
          </div>

          {detailLoading ? (
            <p className="mt-4 text-[13.5px] text-muted">Memuat detail…</p>
          ) : !detail ? (
            <p className="mt-4 text-[13.5px] text-muted">Detail tidak dapat dimuat.</p>
          ) : (
            <div className="mt-4 space-y-5">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-[13.5px]">
                <div>
                  <p className="text-[12px] text-muted">Paket</p>
                  <p className="font-medium text-ink mt-0.5 break-words">
                    {sub?.packageSnapshot
                      ? `${sub.packageSnapshot.userTier?.name ?? '—'} · ${sub.packageSnapshot.storageTier?.name ?? '—'}${sub.packageSnapshot.modules?.length ? ` · ${sub.packageSnapshot.modules.map((m: any) => m.name).join(', ')}` : ''}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-muted">Trial berakhir</p>
                  <p className="font-medium text-ink mt-0.5">{fmtDateTime(sub?.trialEndsAt)}</p>
                </div>
                <div>
                  <p className="text-[12px] text-muted">Periode berakhir</p>
                  <p className="font-medium text-ink mt-0.5">{fmtDateTime(sub?.currentPeriodEndsAt)}</p>
                </div>
                <div>
                  <p className="text-[12px] text-muted">Tenggang berakhir</p>
                  <p className="font-medium text-ink mt-0.5">{fmtDateTime(sub?.graceEndsAt)}</p>
                </div>
              </div>

              {sub?.lifecycleReason && (
                <p className="text-[13.5px] text-ink">
                  <span className="text-muted">Alasan terakhir: </span>
                  {sub.lifecycleReason}
                </p>
              )}

              {/* Tombol aksi manual */}
              <div>
                <h3 className="text-[14px] font-bold text-ink">Aksi Manual</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sub?.lifecycleStatus === 'DITANGGUHKAN' && (
                    <button
                      type="button"
                      onClick={() => openPanel('cancel-suspension')}
                      className="rounded-btn bg-brand px-3.5 py-2 text-[13px] font-semibold text-white"
                    >
                      Batalkan Penangguhan
                    </button>
                  )}
                  {sub?.lifecycleStatus === 'MENUNGGAK' && (
                    <button
                      type="button"
                      onClick={() => openPanel('extend-grace')}
                      className="rounded-btn bg-brand px-3.5 py-2 text-[13px] font-semibold text-white"
                    >
                      Perpanjang Tenggang
                    </button>
                  )}
                  {sub?.lifecycleStatus !== 'DIHAPUS' && (
                    <button
                      type="button"
                      onClick={() => openPanel('change-end-date')}
                      className="rounded-btn border border-line px-3.5 py-2 text-[13px] font-medium text-ink"
                    >
                      Ubah Tanggal Berakhir
                    </button>
                  )}
                  {sub?.lifecycleStatus !== 'DIHAPUS' && (
                    <button
                      type="button"
                      onClick={() => openPanel('mark-paid')}
                      className="rounded-btn border border-line px-3.5 py-2 text-[13px] font-medium text-ink"
                    >
                      Tandai Lunas
                    </button>
                  )}
                  <Link
                    href={`/admin/tenants/${selectedId}`}
                    className="rounded-btn border border-danger px-3.5 py-2 text-[13px] font-medium text-danger"
                  >
                    Konfirmasi Hapus →
                  </Link>
                </div>

                {panel && (
                  <div className="mt-3 rounded-btn border border-line bg-canvas p-4 space-y-3">
                    <p className="text-[13.5px] font-semibold text-ink">
                      {panel === 'cancel-suspension' && 'Batalkan Penangguhan'}
                      {panel === 'extend-grace' && 'Perpanjang Tenggang'}
                      {panel === 'change-end-date' && 'Ubah Tanggal Berakhir'}
                      {panel === 'mark-paid' && 'Tandai Lunas'}
                    </p>
                    {panel === 'extend-grace' && (
                      <label className="block max-w-[220px]">
                        <span className="text-[12px] text-muted">Tambahan hari (1–30)</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={graceDaysExtra}
                          onChange={(e) => setGraceDaysExtra(Number(e.target.value))}
                          className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink"
                        />
                      </label>
                    )}
                    {panel === 'change-end-date' && (
                      <label className="block max-w-[220px]">
                        <span className="text-[12px] text-muted">
                          Tanggal berakhir baru{' '}
                          {sub?.lifecycleStatus === 'TRIAL' ? '(trialEndsAt)' : '(currentPeriodEndsAt)'}
                        </span>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink"
                        />
                      </label>
                    )}
                    {panel === 'mark-paid' && (
                      <div className="grid sm:grid-cols-3 gap-3">
                        <label className="block">
                          <span className="text-[12px] text-muted">Invoice</span>
                          <select
                            value={markInvoiceId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setMarkInvoiceId(id);
                              const inv = unpaidInvoices.find((x: any) => x.id === id);
                              if (inv) setMarkAmount(String(invoiceTotal(inv)));
                            }}
                            className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink"
                          >
                            <option value="">Tanpa invoice (pembayaran manual)</option>
                            {unpaidInvoices.map((inv: any) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.number} — {formatIDR(invoiceTotal(inv))}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-[12px] text-muted">Jumlah dibayar (Rp)</span>
                          <input
                            type="number"
                            min={1}
                            value={markAmount}
                            onChange={(e) => setMarkAmount(e.target.value)}
                            className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink"
                          />
                          {selectedInvoice && (
                            <span className="text-[12px] text-muted">
                              Total tagihan: {formatIDR(invoiceTotal(selectedInvoice))} — jumlah
                              harus ≥ total tagihan.
                            </span>
                          )}
                        </label>
                        <label className="block">
                          <span className="text-[12px] text-muted">Tanggal bayar</span>
                          <input
                            type="date"
                            value={markPaidAt}
                            onChange={(e) => setMarkPaidAt(e.target.value)}
                            className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink"
                          />
                        </label>
                      </div>
                    )}
                    <label className="block">
                      <span className="text-[12px] text-muted">Alasan (wajib, min. 10 karakter)</span>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink"
                        placeholder="Tulis alasan tindakan manual ini…"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={submitManual}
                        disabled={!!busy}
                        className="rounded-btn bg-brand px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
                      >
                        {busy ? 'Memproses…' : 'Jalankan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPanel(null)}
                        className="rounded-btn border border-line px-4 py-2 text-[13.5px] text-ink"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tabel invoice */}
              <div>
                <h3 className="text-[14px] font-bold text-ink">Invoice (10 terbaru)</h3>
                {!detail.invoices || detail.invoices.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted">Belum ada invoice.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-line text-muted">
                          <th className="py-2 pr-3 font-medium">Nomor</th>
                          <th className="py-2 pr-3 font-medium">Periode</th>
                          <th className="py-2 pr-3 font-medium">Total transfer</th>
                          <th className="py-2 pr-3 font-medium">Status</th>
                          <th className="py-2 font-medium">Berlaku s.d.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.invoices.map((inv: any) => (
                          <tr key={inv.id} className="border-b border-line">
                            <td className="py-2 pr-3 font-medium text-ink">{inv.number}</td>
                            <td className="py-2 pr-3 text-ink">
                              {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}
                            </td>
                            <td className="py-2 pr-3 text-ink">
                              {formatIDR(invoiceTotal(inv))}
                              <span className="block text-[12px] text-muted">
                                Dasar {formatIDR(inv.baseAmount ?? 0)} + PPN{' '}
                                {formatIDR(inv.ppnAmount ?? 0)} + kode {inv.uniqueCode ?? '—'}
                              </span>
                            </td>
                            <td className="py-2 pr-3">
                              <Badge tone={INVOICE_STATUS_TONE[inv.status] ?? 'gray'}>{inv.status}</Badge>
                            </td>
                            <td className="py-2 text-ink">{fmtDateTime(inv.validUntil)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Tabel log otomasi */}
              <div>
                <h3 className="text-[14px] font-bold text-ink">Log Otomasi (50 terbaru)</h3>
                {!detail.autoActions || detail.autoActions.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted">Belum ada tindakan otomatis / manual.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-line text-muted">
                          <th className="py-2 pr-3 font-medium">Waktu</th>
                          <th className="py-2 pr-3 font-medium">Aksi</th>
                          <th className="py-2 pr-3 font-medium">Aktor</th>
                          <th className="py-2 font-medium">Detail / alasan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.autoActions.map((a: any) => (
                          <tr key={a.id} className="border-b border-line">
                            <td className="py-2 pr-3 text-ink">{fmtDateTime(a.createdAt)}</td>
                            <td className="py-2 pr-3 font-medium text-ink">{autoActionLabel(a.action)}</td>
                            <td className="py-2 pr-3 text-ink">{a.actorType ?? '—'}</td>
                            <td className="py-2 text-ink">
                              {a.detail ?? ''}
                              {a.reason ? (
                                <span className="block text-[12px] text-muted">{a.reason}</span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Tabel riwayat status */}
              <div>
                <h3 className="text-[14px] font-bold text-ink">Riwayat Status (50 terbaru)</h3>
                {!detail.history || detail.history.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted">Belum ada riwayat status.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-line text-muted">
                          <th className="py-2 pr-3 font-medium">Waktu</th>
                          <th className="py-2 pr-3 font-medium">Dari → Ke</th>
                          <th className="py-2 font-medium">Alasan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.history.map((h: any) => (
                          <tr key={h.id} className="border-b border-line">
                            <td className="py-2 pr-3 text-ink">{fmtDateTime(h.createdAt)}</td>
                            <td className="py-2 pr-3 text-ink">
                              {h.fromStatus} → {h.toStatus}
                            </td>
                            <td className="py-2 text-ink">{h.reason ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
