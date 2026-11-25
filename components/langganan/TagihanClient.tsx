'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, Badge } from '@/components/ui/primitives';
import { formatIDR } from '@/lib/modular';
import { apiJson } from '@/lib/calendar/client';

// ---------------------------------------------------------------------------
// Halaman Tagihan tenant (Fase 6 §9.5).
//
// Kontrak API tenant (desain §6 — dibuat Tugas A):
//   GET  /api/tenant/subscription/invoices
//        → { invoices: [{ id, number, purpose, itemsJson?, baseAmount,
//            ppnAmount, uniqueCode, transferTotal?, status, periodStart,
//            periodEnd, issuedAt, validUntil, creditApplied? }],
//            creditBalance, bankAccounts: [{ bankCode, bankName,
//            accountNumber, accountHolderName }] (hanya yang nomornya terisi) }
//   POST /api/tenant/subscription/invoices/[id]/reissue (OWNER, hanya
//        Kedaluwarsa) → invoice baru
//   POST /api/tenant/subscription/payment-report (OWNER, multipart:
//        bankCode, transferDate, amount, proof ≤10 MB)
//        → 201 { report }
// ---------------------------------------------------------------------------

const BANK_NAMES: Record<string, string> = {
  MANDIRI: 'Bank Mandiri',
  BRI: 'Bank BRI',
  BNI: 'Bank BNI',
  BCA: 'Bank BCA',
  PERMATA: 'Bank Permata',
  BSI: 'Bank Syariah Indonesia',
};

const PURPOSE_LABELS: Record<string, string> = {
  RENEWAL: 'Perpanjangan',
  NEW: 'Langganan baru',
  MODULE_ADD: 'Tambah modul',
  UPGRADE_DIFF: 'Selisih upgrade',
  TOPUP_AI: 'Top-up Deposit AI',
  OTHER: 'Lainnya',
};

const INVOICE_TONES: Record<string, 'green' | 'amber' | 'blue' | 'red' | 'gray'> = {
  'Belum Dibayar': 'amber',
  Lunas: 'green',
  Kedaluwarsa: 'gray',
  'Dibatalkan-Diganti': 'gray',
};

const INPUT =
  'w-full rounded-btn border border-line bg-white px-3 py-2 text-[13.5px] text-ink';
const LABEL = 'block text-[12.5px] font-medium text-muted mb-1';
const BTN_PRIMARY =
  'rounded-btn bg-brand px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50';
const BTN_GHOST =
  'rounded-btn border border-line px-3.5 py-2 text-[13px] font-medium text-ink disabled:opacity-50';

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function invoiceTotal(inv: any): number {
  if (typeof inv?.transferTotal === 'number') return inv.transferTotal;
  return (inv?.baseAmount ?? 0) + (inv?.ppnAmount ?? 0) + (inv?.uniqueCode ?? 0);
}

function parseItems(inv: any): { label: string; amount: number }[] {
  const raw = inv?.itemsJson;
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function hoursLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 3600000));
}

export default function TagihanClient({ isOwner }: { isOwner: boolean }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [creditBalance, setCreditBalance] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // Form laporkan pembayaran.
  const [reportBank, setReportBank] = useState('BCA');
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportAmount, setReportAmount] = useState('');
  const [reportInvoiceId, setReportInvoiceId] = useState('');
  const [reportFile, setReportFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await apiJson<any>('/api/tenant/subscription/invoices');
      setInvoices(Array.isArray(j?.invoices) ? j.invoices : []);
      setCreditBalance(typeof j?.creditBalance === 'number' ? j.creditBalance : 0);
      setBankAccounts(Array.isArray(j?.bankAccounts) ? j.bankAccounts : []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Gagal memuat tagihan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unpaidInvoices = useMemo(
    () => invoices.filter((inv: any) => inv.status === 'Belum Dibayar'),
    [invoices],
  );

  async function reissue(invoiceId: string) {
    setBusy(`reissue-${invoiceId}`);
    try {
      await apiJson(`/api/tenant/subscription/invoices/${invoiceId}/reissue`, { method: 'POST' });
      toast.success('Invoice baru diterbitkan dengan kode unik baru.');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal meminta invoice baru.');
    } finally {
      setBusy('');
    }
  }

  async function submitReport() {
    const amount = Number(String(reportAmount).replace(/[^0-9]/g, '')) || 0;
    if (!reportBank) {
      toast.error('Pilih bank tujuan transfer.');
      return;
    }
    if (!reportDate) {
      toast.error('Isi tanggal transfer.');
      return;
    }
    if (new Date(reportDate) > new Date()) {
      toast.error('Tanggal transfer tidak boleh di masa depan.');
      return;
    }
    if (amount <= 0) {
      toast.error('Nominal transfer harus lebih dari 0.');
      return;
    }
    if (reportFile && reportFile.size > 10 * 1024 * 1024) {
      toast.error('Bukti transfer maksimal 10 MB.');
      return;
    }
    setBusy('report');
    try {
      const fd = new FormData();
      fd.append('bankCode', reportBank);
      fd.append('transferDate', new Date(`${reportDate}T00:00:00`).toISOString());
      fd.append('amount', String(amount));
      if (reportInvoiceId) fd.append('invoiceId', reportInvoiceId);
      if (reportFile) fd.append('proof', reportFile);
      const r = await fetch('/api/tenant/subscription/payment-report', { method: 'POST', body: fd });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.success === false) throw new Error(body.message || `Gagal mengirim laporan (${r.status}).`);
      toast.success('Pembayaran dilaporkan — Master akan memeriksanya.');
      setReportAmount('');
      setReportInvoiceId('');
      setReportFile(null);
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengirim laporan pembayaran.');
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-muted py-4 text-center">Memuat tagihan…</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p className="text-sm text-danger py-4 text-center">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="!p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-ink">Saldo Kredit Langganan</h2>
          <p className="text-[15px] font-bold text-ink">{formatIDR(creditBalance)}</p>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          Kelebihan bayar dan bayar ganda tercatat sebagai saldo kredit dan otomatis dipakai
          untuk tagihan berikutnya (dasar invoice berkurang sebesar kredit yang dipakai).
        </p>
      </Card>

      {bankAccounts.length > 0 && (
        <Card className="!p-5">
          <h2 className="text-[15px] font-bold text-ink">Rekening Penampung</h2>
          <p className="mt-1 text-[13px] text-muted">
            Transfer total persis yang tertera di invoice ke salah satu rekening di bawah ini.
            Kode unik membuat total Anda unik — jangan mengubah nominalnya.
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            {bankAccounts.map((a: any) => (
              <div key={a.bankCode} className="rounded-btn border border-line bg-canvas px-4 py-3">
                <p className="text-[13.5px] font-semibold text-ink">{BANK_NAMES[a.bankCode] ?? a.bankName ?? a.bankCode}</p>
                <p className="text-[13.5px] text-ink mt-0.5">{a.accountNumber}</p>
                {a.accountHolderName && <p className="text-[12.5px] text-muted">a.n. {a.accountHolderName}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="!p-5">
        <h2 className="text-[15px] font-bold text-ink">Daftar Tagihan</h2>
        {invoices.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-muted">Belum ada tagihan.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {invoices.map((inv: any) => {
              const items = parseItems(inv);
              const hLeft = inv.status === 'Belum Dibayar' ? hoursLeft(inv.validUntil) : null;
              return (
                <div key={inv.id} className="rounded-btn border border-line px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[14px] font-semibold text-ink">
                      {inv.number} · {PURPOSE_LABELS[inv.purpose ?? 'RENEWAL'] ?? inv.purpose}
                      {inv.isManual ? ' (manual)' : ''}
                    </p>
                    <Badge tone={INVOICE_TONES[inv.status] ?? 'gray'}>{inv.status}</Badge>
                  </div>
                  {items.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[13px]">
                      {items.map((it, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="text-muted">{it.label}</span>
                          <span className="text-ink whitespace-nowrap">{formatIDR(it.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[13px]">
                    <p>
                      <span className="text-muted">Dasar: </span>
                      <span className="text-ink">{formatIDR(inv.baseAmount ?? 0)}</span>
                    </p>
                    <p>
                      <span className="text-muted">PPN: </span>
                      <span className="text-ink">{formatIDR(inv.ppnAmount ?? 0)}</span>
                    </p>
                    <p>
                      <span className="text-muted">Kode unik: </span>
                      <span className="text-ink">{inv.uniqueCode ?? '—'}</span>
                    </p>
                    <p>
                      <span className="text-muted">Total transfer: </span>
                      <strong className="text-ink">{formatIDR(invoiceTotal(inv))}</strong>
                    </p>
                    <p>
                      <span className="text-muted">Periode: </span>
                      <span className="text-ink">
                        {inv.periodStart && inv.periodEnd ? `${fmtDate(inv.periodStart)} – ${fmtDate(inv.periodEnd)}` : '—'}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted">Terbit: </span>
                      <span className="text-ink">{fmtDateTime(inv.issuedAt)}</span>
                    </p>
                    <p>
                      <span className="text-muted">Berlaku s.d.: </span>
                      <span className="text-ink">
                        {fmtDateTime(inv.validUntil)}
                        {hLeft != null ? ` (sisa ~${hLeft} jam)` : ''}
                      </span>
                    </p>
                    {inv.creditApplied ? (
                      <p>
                        <span className="text-muted">Kredit dipakai: </span>
                        <span className="text-ink">{formatIDR(inv.creditApplied)}</span>
                      </p>
                    ) : null}
                    {inv.paidAt ? (
                      <p>
                        <span className="text-muted">Dibayar: </span>
                        <span className="text-ink">{fmtDateTime(inv.paidAt)}</span>
                      </p>
                    ) : null}
                  </div>
                  {inv.status === 'Belum Dibayar' && bankAccounts.length > 0 && (
                    <p className="mt-2 text-[13px] text-muted">
                      Transfer ke {bankAccounts.map((a: any) => `${BANK_NAMES[a.bankCode] ?? a.bankCode} ${a.accountNumber}`).join(' · ')}.
                    </p>
                  )}
                  {inv.status === 'Kedaluwarsa' && isOwner && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => reissue(inv.id)}
                        disabled={busy === `reissue-${inv.id}`}
                        className={BTN_GHOST}
                      >
                        Minta Invoice Baru
                      </button>
                      <p className="mt-1 text-[12.5px] text-muted">
                        Invoice baru memakai dasar + PPN yang sama, kode unik baru, dan masa
                        berlaku baru. Invoice lama tetap kedaluwarsa.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {isOwner && (
        <Card className="!p-5">
          <h2 className="text-[15px] font-bold text-ink">Laporkan Pembayaran</h2>
          <p className="mt-1 text-[13px] text-muted">
            Sudah transfer tetapi invoice belum berubah Lunas? Laporkan di sini dengan bukti
            transfer — Master akan memeriksanya. Bukti maksimal 10 MB (PDF/JPG/PNG).
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Invoice (opsional)</label>
              <select className={INPUT} value={reportInvoiceId} onChange={(e) => setReportInvoiceId(e.target.value)}>
                <option value="">— Tanpa invoice tertentu —</option>
                {unpaidInvoices.map((inv: any) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.number} — {formatIDR(invoiceTotal(inv))}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Bank tujuan</label>
              <select className={INPUT} value={reportBank} onChange={(e) => setReportBank(e.target.value)}>
                {Object.keys(BANK_NAMES).map((code) => (
                  <option key={code} value={code}>
                    {BANK_NAMES[code]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Tanggal transfer</label>
              <input
                type="date"
                className={INPUT}
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Nominal yang ditransfer (Rp)</label>
              <input
                className={INPUT}
                value={reportAmount}
                onChange={(e) => setReportAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Contoh: 721655"
                inputMode="numeric"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Bukti transfer (PDF/JPG/PNG, maks 10 MB)</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className={INPUT}
                onChange={(e) => setReportFile(e.target.files?.[0] ?? null)}
              />
              {reportFile && <p className="mt-1 text-[12.5px] text-muted">{reportFile.name}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={submitReport}
            disabled={busy === 'report'}
            className={BTN_PRIMARY + ' mt-3'}
          >
            {busy === 'report' ? 'Mengirim…' : 'Kirim laporan pembayaran'}
          </button>
        </Card>
      )}
      {!isOwner && (
        <Card className="!p-5">
          <p className="text-[13.5px] text-muted">
            Hanya Client Administrator (OWNER) yang bisa meminta invoice baru dan melaporkan
            pembayaran.
          </p>
        </Card>
      )}
    </div>
  );
}
