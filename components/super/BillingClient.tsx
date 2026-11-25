'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, Badge } from '@/components/ui/primitives';
import { formatIDR } from '@/lib/modular';
import { apiJson } from '@/lib/calendar/client';

// ---------------------------------------------------------------------------
// Halaman Billing & Rekonsiliasi Master (Fase 6 §9.5).
//
// Kontrak API (desain §6 — dibuat Tugas A):
//   GET  /api/super/billing/bank-accounts → { accounts: [{ bankCode, bankName,
//        accountNumber, accountHolderName, isActive, sortOrder }] }
//   POST /api/super/billing/bank-accounts (MANAGE, upsert satu rekening)
//        ← { bankCode, accountNumber, accountHolderName, isActive? }
//   PATCH /api/super/billing/bank-accounts/[bankCode] (MANAGE)
//   POST /api/super/billing/statements/upload (MANAGE, multipart:
//        bankCode, uploadMethod 'CSV_UPLOAD'|'MANUAL_PULL', file)
//        → { statement, summary { matched, underpaid, overpaid, duplicate,
//            unknown, skipped } }
//   GET  /api/super/billing/statements?bankCode=&page=
//        → { items: [{ id, bankCode, fileName, rowCount, matchedCount,
//            queuedCount, skippedRows, uploadMethod, createdAt }] }
//   GET  /api/super/billing/queue?status=&bankCode=&page=
//        → { mutations: [{ id, statementId?, bankCode, valueDate, amount,
//            description?, reference?, status, matchedInvoiceId?, tenantId?,
//            resolutionNote?, resolvedByUserId?, resolvedAt?, createdAt }],
//            reports: [{ id, tenantId, invoiceId?, bankCode, transferDate,
//            amount, proofPath?, status, resolveNote?, createdAt }],
//            page, total }
//   POST /api/super/billing/queue/mutations/[id]/resolve (MANAGE)
//        { action: 'link-invoice'|'credit'|'dismiss', invoiceId?, note }
//   POST /api/super/billing/queue/reports/[id]/resolve (MANAGE)
//        { decision: 'settle'|'reject', invoiceId?, amount?, note }
//   GET  /api/super/billing/queue/reports/[id]/proof (MANAGE) — unduh bukti
//        laporan tenant (rute Master-only, pola Fase 3).
//   POST /api/super/subscriptions/[tenantId]/invoices (MANAGE)
//        ← { purpose, items [{label, amount}], baseAmount, periodStart,
//            periodEnd, billingCycle, reason ≥10, replacesInvoiceId?,
//            packageSnapshot?, validityHours? } → 201 invoice
//   GET  /api/super/subscriptions/[tenantId]/invoices (VIEW)
//        → { invoices: [{ id, number, purpose, baseAmount, ppnAmount,
//            uniqueCode, status, periodStart, periodEnd, issuedAt, validUntil,
//            itemsJson?, isManual?, creditApplied? }], creditBalance }
//   POST /api/super/subscriptions/[tenantId]/invoices/[invoiceId]/reissue
//        (MANAGE) → invoice baru
//   POST /api/super/subscriptions/[tenantId]/invoices/[invoiceId]/cancel
//        (MANAGE) { reason ≥10 } → Dibatalkan/Diganti
//   GET  /api/super/subscriptions/monitoring (Fase 5) — daftar tenant untuk
//        pemilih invoice manual: { items: [{ tenantId, companyName, tenantCode }] }
//   GET  /api/super/pricing/catalog (Fase 1) — settings.ppnRateBps untuk
//        hitung PPN client-side di form invoice manual.
// Penarikan otomatis iBanking TIDAK dibangun (§1 desain) — tab Rekonsiliasi
// menyatakan ini dengan jujur di atas; jalur utama adalah unggah CSV.
// ---------------------------------------------------------------------------

type BadgeTone = 'green' | 'amber' | 'blue' | 'red' | 'gray';

const BANK_CODES = ['MANDIRI', 'BRI', 'BNI', 'BCA', 'PERMATA', 'BSI'] as const;
const BANK_NAMES: Record<string, string> = {
  MANDIRI: 'Bank Mandiri',
  BRI: 'Bank BRI',
  BNI: 'Bank BNI',
  BCA: 'Bank BCA',
  PERMATA: 'Bank Permata',
  BSI: 'Bank Syariah Indonesia',
};

const PURPOSES = [
  { value: 'RENEWAL', label: 'Perpanjangan' },
  { value: 'NEW', label: 'Langganan baru' },
  { value: 'MODULE_ADD', label: 'Tambah modul' },
  { value: 'UPGRADE_DIFF', label: 'Selisih upgrade' },
  { value: 'OTHER', label: 'Lainnya' },
] as const;

function purposeLabel(p: string): string {
  return PURPOSES.find((x) => x.value === p)?.label ?? p;
}

const MUTATION_TONES: Record<string, BadgeTone> = {
  MATCHED: 'green',
  UNDERPAID: 'amber',
  OVERPAID: 'blue',
  DUPLICATE: 'blue',
  UNKNOWN: 'gray',
  RESOLVED_MANUAL: 'green',
};

const MUTATION_LABELS: Record<string, string> = {
  MATCHED: 'Cocok',
  UNDERPAID: 'Kurang bayar',
  OVERPAID: 'Lebih bayar',
  DUPLICATE: 'Bayar ganda',
  UNKNOWN: 'Tidak dikenal',
  RESOLVED_MANUAL: 'Diselesaikan manual',
};

const INVOICE_TONES: Record<string, BadgeTone> = {
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
const BTN_DANGER =
  'rounded-btn border border-danger px-3.5 py-2 text-[13px] font-medium text-danger disabled:opacity-50';

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

function toDateInput(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
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

type Tab = 'rekening' | 'rekonsiliasi' | 'manual' | 'laporan';

export default function BillingClient() {
  const [tab, setTab] = useState<Tab>('rekening');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // Rekening.
  const [accounts, setAccounts] = useState<any[]>([]);
  const [editBank, setEditBank] = useState<string | null>(null);
  const [editNumber, setEditNumber] = useState('');
  const [editHolder, setEditHolder] = useState('');
  const [editActive, setEditActive] = useState(true);

  // Rekonsiliasi.
  const [statements, setStatements] = useState<any[]>([]);
  const [queueMutations, setQueueMutations] = useState<any[]>([]);
  const [queueReports, setQueueReports] = useState<any[]>([]);
  const [uploadBank, setUploadBank] = useState('BCA');
  const [uploadMethod, setUploadMethod] = useState<'CSV_UPLOAD' | 'MANUAL_PULL'>('CSV_UPLOAD');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<any>(null);
  const [queueStatusFilter, setQueueStatusFilter] = useState('');
  const [queueBankFilter, setQueueBankFilter] = useState('');
  // Form selesaikan mutasi.
  const [resolveMutationId, setResolveMutationId] = useState<string | null>(null);
  const [resolveMutationAmount, setResolveMutationAmount] = useState(0);
  const [resolveAction, setResolveAction] = useState<'link-invoice' | 'credit' | 'dismiss'>('link-invoice');
  const [resolveInvoiceId, setResolveInvoiceId] = useState('');
  const [resolveHandling, setResolveHandling] = useState<'FOLLOW_UP_INVOICE' | 'FORGIVEN_REASON'>('FOLLOW_UP_INVOICE');
  const [resolveNote, setResolveNote] = useState('');
  const [resolveTenantInvoices, setResolveTenantInvoices] = useState<any[]>([]);

  // Invoice manual.
  const [tenants, setTenants] = useState<any[]>([]);
  const [ppnRateBps, setPpnRateBps] = useState(1100);
  const [manualTenantId, setManualTenantId] = useState('');
  const [manualPurpose, setManualPurpose] = useState('RENEWAL');
  const [manualItems, setManualItems] = useState<{ label: string; amount: string }[]>([
    { label: '', amount: '' },
  ]);
  const [manualBase, setManualBase] = useState('');
  const [manualBaseEdited, setManualBaseEdited] = useState(false);
  const [manualPeriodStart, setManualPeriodStart] = useState(toDateInput(new Date().toISOString()));
  const [manualPeriodEnd, setManualPeriodEnd] = useState('');
  const [manualCycle, setManualCycle] = useState('MONTHLY');
  const [manualReplacesId, setManualReplacesId] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [tenantInvoices, setTenantInvoices] = useState<any[]>([]);
  const [tenantCredit, setTenantCredit] = useState(0);
  const [createdInvoice, setCreatedInvoice] = useState<any>(null);

  // Laporan tenant.
  const [reportResolveId, setReportResolveId] = useState<string | null>(null);
  const [reportDecision, setReportDecision] = useState<'settle' | 'reject'>('settle');
  const [reportInvoiceId, setReportInvoiceId] = useState('');
  const [reportAmount, setReportAmount] = useState('');
  const [reportNote, setReportNote] = useState('');

  const tenantName = useCallback(
    (tenantId: string | null | undefined) => {
      if (!tenantId) return '—';
      const t = tenants.find((x: any) => x.tenantId === tenantId || x.id === tenantId);
      return t ? `${t.companyName ?? t.tenantCode ?? tenantId}` : tenantId;
    },
    [tenants],
  );

  const loadAccounts = useCallback(async () => {
    try {
      const j = await apiJson<any>('/api/super/billing/bank-accounts');
      const list = Array.isArray(j?.accounts) ? j.accounts : Array.isArray(j) ? j : [];
      setAccounts(list);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat rekening penampung.');
    }
  }, []);

  const loadStatements = useCallback(async () => {
    try {
      const j = await apiJson<any>('/api/super/billing/statements');
      const list = Array.isArray(j?.items) ? j.items : Array.isArray(j?.statements) ? j.statements : Array.isArray(j) ? j : [];
      setStatements(list);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat riwayat statement.');
    }
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (queueStatusFilter) q.set('status', queueStatusFilter);
      if (queueBankFilter) q.set('bankCode', queueBankFilter);
      const j = await apiJson<any>(`/api/super/billing/queue?${q.toString()}`);
      setQueueMutations(Array.isArray(j?.mutations) ? j.mutations : []);
      setQueueReports(Array.isArray(j?.reports) ? j.reports : []);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat antrean rekonsiliasi.');
    }
  }, [queueStatusFilter, queueBankFilter]);

  const loadTenantsAndSettings = useCallback(async () => {
    try {
      const j = await apiJson<any>('/api/super/subscriptions/monitoring');
      setTenants(Array.isArray(j?.items) ? j.items : []);
    } catch {
      // Pemilih tenant invoice manual tetap kosong bila monitoring gagal.
    }
    try {
      const c = await apiJson<any>('/api/super/pricing/catalog');
      if (typeof c?.settings?.ppnRateBps === 'number') setPpnRateBps(c.settings.ppnRateBps);
    } catch {
      // Fallback PPN 11% (Fase 1).
    }
  }, []);

  const loadTenantInvoices = useCallback(async (tenantId: string) => {
    if (!tenantId) {
      setTenantInvoices([]);
      setTenantCredit(0);
      return;
    }
    try {
      const j = await apiJson<any>(`/api/super/subscriptions/${tenantId}/invoices`);
      setTenantInvoices(Array.isArray(j?.invoices) ? j.invoices : []);
      setTenantCredit(typeof j?.creditBalance === 'number' ? j.creditBalance : 0);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat invoice tenant.');
      setTenantInvoices([]);
      setTenantCredit(0);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadAccounts(), loadStatements(), loadQueue(), loadTenantsAndSettings()]);
      setLoading(false);
    })();
  }, [loadAccounts, loadStatements, loadQueue, loadTenantsAndSettings]);

  useEffect(() => {
    loadQueue();
  }, [queueStatusFilter, queueBankFilter, loadQueue]);

  useEffect(() => {
    if (manualTenantId) loadTenantInvoices(manualTenantId);
    else {
      setTenantInvoices([]);
      setTenantCredit(0);
    }
    setManualReplacesId('');
    setCreatedInvoice(null);
  }, [manualTenantId, loadTenantInvoices]);

  // ---- Rekening ----
  function openEdit(bankCode: string) {
    const acc = accounts.find((a: any) => a.bankCode === bankCode);
    setEditBank(bankCode);
    setEditNumber(acc?.accountNumber ?? '');
    setEditHolder(acc?.accountHolderName ?? '');
    setEditActive(acc?.isActive !== false);
  }

  async function saveAccount() {
    if (!editBank) return;
    const number = editNumber.trim();
    if (number && !/^[0-9A-Za-z][0-9A-Za-z \-]{3,29}$/.test(number)) {
      toast.error('Nomor rekening: 4–30 karakter (angka/huruf, spasi, tanda -).');
      return;
    }
    setBusy(`account-${editBank}`);
    try {
      await apiJson('/api/super/billing/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankCode: editBank,
          accountNumber: number,
          accountHolderName: editHolder.trim(),
          isActive: editActive,
        }),
      });
      toast.success(`Rekening ${BANK_NAMES[editBank] ?? editBank} disimpan.`);
      setEditBank(null);
      await loadAccounts();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan rekening.');
    } finally {
      setBusy('');
    }
  }

  // ---- Rekonsiliasi: unggah CSV ----
  async function uploadCsv() {
    if (!uploadFile) {
      toast.error('Pilih berkas CSV rekening koran dulu.');
      return;
    }
    if (!/\.csv$/i.test(uploadFile.name)) {
      toast.error('Berkas harus berformat CSV (.csv).');
      return;
    }
    if (uploadFile.size > 5 * 1024 * 1024) {
      toast.error('Berkas CSV maksimal 5 MB.');
      return;
    }
    setBusy('upload');
    setUploadSummary(null);
    try {
      const fd = new FormData();
      fd.append('bankCode', uploadBank);
      fd.append('uploadMethod', uploadMethod);
      fd.append('file', uploadFile);
      const r = await fetch('/api/super/billing/statements/upload', { method: 'POST', body: fd });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.success === false) throw new Error(body.message || `Unggah gagal (${r.status}).`);
      const data = body.data ?? body;
      setUploadSummary(data.summary ?? data);
      toast.success('CSV diunggah dan dicocokkan.');
      setUploadFile(null);
      await Promise.all([loadStatements(), loadQueue()]);
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengunggah CSV.');
    } finally {
      setBusy('');
    }
  }

  // ---- Rekonsiliasi: selesaikan mutasi ----
  async function openResolveMutation(m: any) {
    setResolveMutationId(m.id);
    setResolveMutationAmount(Number(m.amount) || 0);
    setResolveAction('link-invoice');
    setResolveHandling('FOLLOW_UP_INVOICE');
    setResolveInvoiceId(m.matchedInvoiceId ?? '');
    setResolveNote('');
    if (m.tenantId) {
      try {
        const j = await apiJson<any>(`/api/super/subscriptions/${m.tenantId}/invoices`);
        setResolveTenantInvoices(Array.isArray(j?.invoices) ? j.invoices : []);
      } catch {
        setResolveTenantInvoices([]);
      }
    } else {
      setResolveTenantInvoices([]);
    }
  }

  async function submitResolveMutation() {
    if (!resolveMutationId) return;
    if (resolveAction === 'link-invoice' && !resolveInvoiceId) {
      toast.error('Pilih invoice yang akan ditautkan.');
      return;
    }
    if (resolveNote.trim().length < 10) {
      toast.error('Catatan penyelesaian minimal 10 karakter.');
      return;
    }
    setBusy(`mutation-${resolveMutationId}`);
    try {
      // Bila menautkan mutasi kurang bayar dengan selisih > kode unik,
      // server wajib tahu cara selisih ditangani (FOLLOW_UP_INVOICE /
      // FORGIVEN_REASON) — tanpa ini resolve selalu 400.
      const selectedInv = resolveTenantInvoices.find((inv: any) => inv.id === resolveInvoiceId);
      const shortfall =
        resolveAction === 'link-invoice' && selectedInv
          ? invoiceTotal(selectedInv) - resolveMutationAmount
          : 0;
      const needsHandling = shortfall > 0 && shortfall !== (selectedInv?.uniqueCode ?? 0);
      await apiJson(`/api/super/billing/queue/mutations/${resolveMutationId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: resolveAction,
          invoiceId: resolveAction === 'link-invoice' ? resolveInvoiceId : undefined,
          handling: needsHandling ? resolveHandling : undefined,
          note: resolveNote.trim(),
        }),
      });
      toast.success('Mutasi diselesaikan.');
      setResolveMutationId(null);
      await loadQueue();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyelesaikan mutasi.');
    } finally {
      setBusy('');
    }
  }

  // ---- Invoice manual ----
  const itemsSum = useMemo(
    () =>
      manualItems.reduce((s, it) => {
        const n = Number(String(it.amount).replace(/[^0-9]/g, '')) || 0;
        return s + n;
      }, 0),
    [manualItems],
  );

  useEffect(() => {
    if (!manualBaseEdited) setManualBase(itemsSum > 0 ? String(itemsSum) : '');
  }, [itemsSum, manualBaseEdited]);

  const manualBaseNum = Number(String(manualBase).replace(/[^0-9]/g, '')) || 0;
  const manualPpn = Math.round((manualBaseNum * ppnRateBps) / 10000);

  async function submitManualInvoice() {
    if (!manualTenantId) {
      toast.error('Pilih tenant dulu.');
      return;
    }
    const items = manualItems
      .filter((it) => it.label.trim() && Number(String(it.amount).replace(/[^0-9]/g, '')) > 0)
      .map((it) => ({ label: it.label.trim(), amount: Number(String(it.amount).replace(/[^0-9]/g, '')) }));
    if (items.length === 0) {
      toast.error('Isi minimal satu item rincian (label + nominal).');
      return;
    }
    if (manualBaseNum <= 0) {
      toast.error('Harga dasar harus lebih dari 0.');
      return;
    }
    if (!manualPeriodStart || !manualPeriodEnd) {
      toast.error('Isi periode tagihan (awal dan akhir).');
      return;
    }
    if (new Date(manualPeriodEnd) <= new Date(manualPeriodStart)) {
      toast.error('Tanggal akhir periode harus setelah tanggal awal.');
      return;
    }
    if (manualReason.trim().length < 10) {
      toast.error('Alasan nego minimal 10 karakter.');
      return;
    }
    setBusy('manual-invoice');
    try {
      const j = await apiJson<any>(`/api/super/subscriptions/${manualTenantId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: manualPurpose,
          items,
          baseAmount: manualBaseNum,
          periodStart: new Date(`${manualPeriodStart}T00:00:00`).toISOString(),
          periodEnd: new Date(`${manualPeriodEnd}T23:59:59`).toISOString(),
          billingCycle: manualCycle,
          reason: manualReason.trim(),
          replacesInvoiceId: manualReplacesId || undefined,
        }),
      });
      const inv = j?.invoice ?? j;
      setCreatedInvoice(inv);
      toast.success(`Invoice manual ${inv?.number ?? ''} diterbitkan.`);
      setManualItems([{ label: '', amount: '' }]);
      setManualBase('');
      setManualBaseEdited(false);
      setManualReason('');
      setManualReplacesId('');
      await loadTenantInvoices(manualTenantId);
    } catch (e: any) {
      toast.error(e.message || 'Gagal menerbitkan invoice manual.');
    } finally {
      setBusy('');
    }
  }

  async function reissueInvoice(invoiceId: string) {
    if (!manualTenantId) return;
    setBusy(`reissue-${invoiceId}`);
    try {
      await apiJson(`/api/super/subscriptions/${manualTenantId}/invoices/${invoiceId}/reissue`, {
        method: 'POST',
      });
      toast.success('Invoice baru diterbitkan (kode unik baru).');
      await loadTenantInvoices(manualTenantId);
    } catch (e: any) {
      toast.error(e.message || 'Gagal menerbitkan ulang invoice.');
    } finally {
      setBusy('');
    }
  }

  async function cancelInvoice(invoiceId: string) {
    const reason = window.prompt('Alasan pembatalan invoice (minimal 10 karakter):');
    if (reason === null) return;
    if (reason.trim().length < 10) {
      toast.error('Alasan pembatalan minimal 10 karakter.');
      return;
    }
    if (!manualTenantId) return;
    setBusy(`cancel-${invoiceId}`);
    try {
      await apiJson(`/api/super/subscriptions/${manualTenantId}/invoices/${invoiceId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      toast.success('Invoice dibatalkan.');
      await loadTenantInvoices(manualTenantId);
    } catch (e: any) {
      toast.error(e.message || 'Gagal membatalkan invoice.');
    } finally {
      setBusy('');
    }
  }

  // ---- Laporan tenant ----
  async function submitResolveReport() {
    if (!reportResolveId) return;
    if (reportDecision === 'reject' && reportNote.trim().length < 10) {
      toast.error('Alasan penolakan minimal 10 karakter.');
      return;
    }
    if (reportDecision === 'settle' && !reportInvoiceId) {
      toast.error('Pilih invoice yang akan dilunaskan dari laporan ini.');
      return;
    }
    setBusy(`report-${reportResolveId}`);
    try {
      await apiJson(`/api/super/billing/queue/reports/${reportResolveId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: reportDecision,
          invoiceId: reportInvoiceId || undefined,
          amount: reportAmount ? Number(String(reportAmount).replace(/[^0-9]/g, '')) || undefined : undefined,
          note: reportNote.trim() || undefined,
        }),
      });
      toast.success(reportDecision === 'settle' ? 'Laporan dilunaskan.' : 'Laporan ditolak.');
      setReportResolveId(null);
      setReportNote('');
      await loadQueue();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyelesaikan laporan.');
    } finally {
      setBusy('');
    }
  }

  const pendingReports = useMemo(
    () => queueReports.filter((r: any) => r.status === 'PENDING'),
    [queueReports],
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'rekening', label: 'Rekening' },
    { id: 'rekonsiliasi', label: 'Rekonsiliasi' },
    { id: 'manual', label: 'Invoice Manual' },
    { id: 'laporan', label: `Laporan${pendingReports.length ? ` (${pendingReports.length})` : ''}` },
  ];

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-muted py-4 text-center">Memuat billing…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <Card>
          <p className="text-sm text-danger py-2">{error}</p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'rounded-btn bg-brand px-4 py-2 text-[13.5px] font-semibold text-white'
                : 'rounded-btn border border-line bg-white px-4 py-2 text-[13.5px] font-medium text-ink'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rekening' && (
        <div className="space-y-4">
          <Card className="!p-5">
            <p className="text-[13.5px] text-muted">
              Satu rekening penampung untuk masing-masing dari 6 bank. Nomor rekening diisi
              Master — tidak ada di spesifikasi. Hanya rekening yang nomornya sudah terisi
              yang tampil di invoice tenant.
            </p>
          </Card>
          <div className="grid sm:grid-cols-2 gap-4">
            {BANK_CODES.map((code) => {
              const acc = accounts.find((a: any) => a.bankCode === code);
              const filled = Boolean(acc?.accountNumber);
              const editing = editBank === code;
              return (
                <Card key={code} className="!p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[15px] font-bold text-ink">{BANK_NAMES[code]}</h3>
                    <Badge tone={filled ? 'green' : 'gray'}>
                      {filled ? (acc?.isActive === false ? 'Terisi · nonaktif' : 'Terisi') : 'Belum diisi'}
                    </Badge>
                  </div>
                  {!editing ? (
                    <div className="mt-3 space-y-1.5 text-[13.5px]">
                      <p>
                        <span className="text-muted">Nomor rekening: </span>
                        <span className="font-medium text-ink">{acc?.accountNumber || '—'}</span>
                      </p>
                      <p>
                        <span className="text-muted">Atas nama: </span>
                        <span className="font-medium text-ink">{acc?.accountHolderName || '—'}</span>
                      </p>
                      <button type="button" onClick={() => openEdit(code)} className={BTN_GHOST + ' mt-2'}>
                        {filled ? 'Ubah rekening' : 'Isi rekening'}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className={LABEL}>Nomor rekening</label>
                        <input
                          className={INPUT}
                          value={editNumber}
                          onChange={(e) => setEditNumber(e.target.value)}
                          placeholder="Contoh: 1234567890"
                          inputMode="numeric"
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Atas nama</label>
                        <input
                          className={INPUT}
                          value={editHolder}
                          onChange={(e) => setEditHolder(e.target.value)}
                          placeholder="Nama pemilik rekening"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-[13.5px] text-ink">
                        <input
                          type="checkbox"
                          checked={editActive}
                          onChange={(e) => setEditActive(e.target.checked)}
                        />
                        Rekening aktif
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveAccount}
                          disabled={busy === `account-${code}`}
                          className={BTN_PRIMARY}
                        >
                          Simpan
                        </button>
                        <button type="button" onClick={() => setEditBank(null)} className={BTN_GHOST}>
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'rekonsiliasi' && (
        <div className="space-y-5">
          <Card className="!p-5 border-amber-300 bg-amber-50">
            <h3 className="text-[15px] font-bold text-ink">Penarikan otomatis belum tersedia</h3>
            <p className="mt-2 text-[13.5px] text-ink">
              Bank tidak menyediakan akses otomatis dari server ini, OTP tidak boleh
              diotomasi, dan syarat layanan bank melarang scraping halaman internet
              banking. Cadangan yang tersedia (sesuai §9.5):
            </p>
            <ul className="mt-2 list-disc pl-5 text-[13.5px] text-ink space-y-1">
              <li>
                <strong>(a) Penarikan manual</strong> — Master menyelesaikan OTP di kanal bank
                yang sah, lalu mengunggah CSV dengan metode &ldquo;Penarikan manual&rdquo;.
              </li>
              <li>
                <strong>(b) Unggah CSV rekening koran</strong> — jalur utama: sistem mencocokkan
                mutasi dari berkas secara otomatis berdasarkan total persis + tanggal nilai.
              </li>
              <li>
                <strong>(c) Konfirmasi manual</strong> — Master melunaskan invoice dari antrean
                atau dari laporan tenant, dengan bukti transfer dan alasan tercatat.
              </li>
            </ul>
            <p className="mt-2 text-[13px] text-muted">
              Tidak ada kredensial bank yang disimpan di mana pun. Pencocokan memakai
              tanggal nilai (value date) mutasi, bukan waktu unggah.
            </p>
          </Card>

          <Card className="!p-5">
            <h3 className="text-[15px] font-bold text-ink">Unggah CSV Rekening Koran</h3>
            <div className="mt-3 grid sm:grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Bank penampung</label>
                <select className={INPUT} value={uploadBank} onChange={(e) => setUploadBank(e.target.value)}>
                  {BANK_CODES.map((code) => (
                    <option key={code} value={code}>
                      {BANK_NAMES[code]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Metode</label>
                <select
                  className={INPUT}
                  value={uploadMethod}
                  onChange={(e) => setUploadMethod(e.target.value as 'CSV_UPLOAD' | 'MANUAL_PULL')}
                >
                  <option value="CSV_UPLOAD">Unggah CSV (cadangan b)</option>
                  <option value="MANUAL_PULL">Penarikan manual setelah OTP (cadangan a)</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Berkas CSV (maks 5 MB)</label>
                <input
                  type="file"
                  accept=".csv"
                  className={INPUT}
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={uploadCsv} disabled={busy === 'upload' || !uploadFile} className={BTN_PRIMARY}>
                {busy === 'upload' ? 'Mengunggah…' : 'Unggah & cocokkan'}
              </button>
              {uploadFile && <span className="text-[13px] text-muted">{uploadFile.name}</span>}
            </div>
            {uploadSummary && (
              <div className="mt-4 rounded-btn border border-line bg-canvas px-4 py-3">
                <p className="text-[13.5px] font-semibold text-ink">Hasil pencocokan</p>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[13px]">
                  <p>Cocok (Lunas): <strong>{uploadSummary.matched ?? 0}</strong></p>
                  <p>Kurang bayar: <strong>{uploadSummary.underpaid ?? 0}</strong></p>
                  <p>Lebih bayar: <strong>{uploadSummary.overpaid ?? 0}</strong></p>
                  <p>Bayar ganda: <strong>{uploadSummary.duplicate ?? 0}</strong></p>
                  <p>Tidak dikenal: <strong>{uploadSummary.unknown ?? 0}</strong></p>
                  <p>Baris dilewati: <strong>{uploadSummary.skipped ?? 0}</strong></p>
                </div>
              </div>
            )}
          </Card>

          <Card className="!p-5">
            <h3 className="text-[15px] font-bold text-ink">Riwayat Statement</h3>
            {statements.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-muted">Belum ada statement yang diunggah.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="py-2 pr-3 font-medium">Bank</th>
                      <th className="py-2 pr-3 font-medium">Berkas</th>
                      <th className="py-2 pr-3 font-medium">Baris</th>
                      <th className="py-2 pr-3 font-medium">Cocok</th>
                      <th className="py-2 pr-3 font-medium">Antrean</th>
                      <th className="py-2 pr-3 font-medium">Metode</th>
                      <th className="py-2 font-medium">Diunggah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statements.map((s: any) => (
                      <tr key={s.id} className="border-b border-line">
                        <td className="py-2 pr-3">{BANK_NAMES[s.bankCode] ?? s.bankCode}</td>
                        <td className="py-2 pr-3 break-words">{s.fileName}</td>
                        <td className="py-2 pr-3">{s.rowCount ?? '—'}</td>
                        <td className="py-2 pr-3">{s.matchedCount ?? 0}</td>
                        <td className="py-2 pr-3">{s.queuedCount ?? 0}</td>
                        <td className="py-2 pr-3">{s.uploadMethod === 'MANUAL_PULL' ? 'Penarikan manual' : 'CSV'}</td>
                        <td className="py-2">{fmtDateTime(s.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="!p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-ink">Antrean Rekonsiliasi Manual</h3>
              <div className="flex gap-2">
                <select className={INPUT + ' !w-auto'} value={queueStatusFilter} onChange={(e) => setQueueStatusFilter(e.target.value)}>
                  <option value="">Semua status</option>
                  {Object.keys(MUTATION_LABELS).map((k) => (
                    <option key={k} value={k}>
                      {MUTATION_LABELS[k]}
                    </option>
                  ))}
                </select>
                <select className={INPUT + ' !w-auto'} value={queueBankFilter} onChange={(e) => setQueueBankFilter(e.target.value)}>
                  <option value="">Semua bank</option>
                  {BANK_CODES.map((code) => (
                    <option key={code} value={code}>
                      {BANK_NAMES[code]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {queueMutations.length === 0 ? (
              <p className="mt-3 text-[13.5px] text-muted">Antrean kosong — tidak ada mutasi bermasalah.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="py-2 pr-3 font-medium">Tanggal nilai</th>
                      <th className="py-2 pr-3 font-medium">Bank</th>
                      <th className="py-2 pr-3 font-medium">Nominal</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Tenant</th>
                      <th className="py-2 pr-3 font-medium">Keterangan</th>
                      <th className="py-2 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueMutations.map((m: any) => (
                      <tr key={m.id} className="border-b border-line align-top">
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(m.valueDate)}</td>
                        <td className="py-2 pr-3">{BANK_NAMES[m.bankCode] ?? m.bankCode}</td>
                        <td className="py-2 pr-3 font-medium whitespace-nowrap">{formatIDR(m.amount ?? 0)}</td>
                        <td className="py-2 pr-3">
                          <Badge tone={MUTATION_TONES[m.status] ?? 'gray'}>{MUTATION_LABELS[m.status] ?? m.status}</Badge>
                        </td>
                        <td className="py-2 pr-3">{tenantName(m.tenantId)}</td>
                        <td className="py-2 pr-3 break-words">
                          {m.description ?? m.reference ?? '—'}
                          {m.resolutionNote && <p className="text-muted mt-1">{m.resolutionNote}</p>}
                        </td>
                        <td className="py-2">
                          {m.status !== 'RESOLVED_MANUAL' && m.status !== 'MATCHED' && (
                            <button type="button" onClick={() => openResolveMutation(m)} className={BTN_GHOST}>
                              Selesaikan
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {resolveMutationId && (
              <div className="mt-4 rounded-btn border border-line bg-canvas px-4 py-3 space-y-3">
                <p className="text-[13.5px] font-semibold text-ink">Selesaikan mutasi</p>
                <div>
                  <label className={LABEL}>Tindakan</label>
                  <select
                    className={INPUT}
                    value={resolveAction}
                    onChange={(e) => setResolveAction(e.target.value as 'link-invoice' | 'credit' | 'dismiss')}
                  >
                    <option value="link-invoice">Tautkan invoice + lunaskan</option>
                    <option value="credit">Jadikan saldo kredit</option>
                    <option value="dismiss">Abaikan (bukan pembayaran tenant)</option>
                  </select>
                </div>
                {resolveAction === 'link-invoice' && (
                  <div>
                    <label className={LABEL}>Invoice</label>
                    <select className={INPUT} value={resolveInvoiceId} onChange={(e) => setResolveInvoiceId(e.target.value)}>
                      <option value="">— Pilih invoice —</option>
                      {resolveTenantInvoices
                        .filter((inv: any) => inv.status === 'Belum Dibayar')
                        .map((inv: any) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.number} — {formatIDR(invoiceTotal(inv))} ({inv.status})
                          </option>
                        ))}
                    </select>
                    {resolveTenantInvoices.length === 0 && (
                      <p className="mt-1 text-[12.5px] text-muted">
                        Tenant mutasi ini belum diketahui — tautkan lewat laporan tenant atau buat invoice manual dulu.
                      </p>
                    )}
                    {(() => {
                      const sel = resolveTenantInvoices.find((inv: any) => inv.id === resolveInvoiceId);
                      if (!sel) return null;
                      const shortfall = invoiceTotal(sel) - resolveMutationAmount;
                      if (shortfall <= 0 || shortfall === (sel.uniqueCode ?? 0)) return null;
                      return (
                        <div className="mt-2">
                          <label className={LABEL}>
                            Kekurangan {formatIDR(shortfall)} (lebih besar dari kode unik) — cara menangani
                          </label>
                          <select
                            className={INPUT}
                            value={resolveHandling}
                            onChange={(e) =>
                              setResolveHandling(e.target.value as 'FOLLOW_UP_INVOICE' | 'FORGIVEN_REASON')
                            }
                          >
                            <option value="FOLLOW_UP_INVOICE">Buat invoice susulan untuk sisanya</option>
                            <option value="FORGIVEN_REASON">Maafkan kekurangan (alasan di catatan)</option>
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                )}
                <div>
                  <label className={LABEL}>Catatan penyelesaian (minimal 10 karakter)</label>
                  <textarea
                    className={INPUT}
                    rows={2}
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                    placeholder="Contoh: Mutasi dari PT Uji, transfer tanpa kode unik — dilunaskan manual."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={submitResolveMutation}
                    disabled={busy === `mutation-${resolveMutationId}`}
                    className={BTN_PRIMARY}
                  >
                    Simpan penyelesaian
                  </button>
                  <button type="button" onClick={() => setResolveMutationId(null)} className={BTN_GHOST}>
                    Batal
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'manual' && (
        <div className="space-y-5">
          <Card className="!p-5">
            <h3 className="text-[15px] font-bold text-ink">Terbitkan Invoice Manual (Nego)</h3>
            <p className="mt-1 text-[13px] text-muted">
              Harga hasil nego — nilai diisi sendiri, bukan dari katalog. PPN dihitung sistem
              dari harga dasar dan dibebankan ke tenant. Kode unik dibuat otomatis oleh sistem
              dan baru terlihat setelah invoice terbit.
            </p>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Tenant</label>
                <select className={INPUT} value={manualTenantId} onChange={(e) => setManualTenantId(e.target.value)}>
                  <option value="">— Pilih tenant —</option>
                  {tenants.map((t: any) => (
                    <option key={t.tenantId} value={t.tenantId}>
                      {t.companyName} ({t.tenantCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Tujuan</label>
                <select className={INPUT} value={manualPurpose} onChange={(e) => setManualPurpose(e.target.value)}>
                  {PURPOSES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Siklus penagihan</label>
                <select className={INPUT} value={manualCycle} onChange={(e) => setManualCycle(e.target.value)}>
                  <option value="MONTHLY">Bulanan</option>
                  <option value="YEARLY">Tahunan</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Ganti invoice sistem (opsional)</label>
                <select className={INPUT} value={manualReplacesId} onChange={(e) => setManualReplacesId(e.target.value)}>
                  <option value="">— Tidak menggantikan invoice —</option>
                  {tenantInvoices
                    .filter((inv: any) => inv.status === 'Belum Dibayar')
                    .map((inv: any) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.number} — {formatIDR(invoiceTotal(inv))}
                      </option>
                    ))}
                </select>
                {manualReplacesId && (
                  <p className="mt-1 text-[12.5px] text-muted">
                    Invoice sistem yang diganti akan berstatus Dibatalkan/Diganti dan kode
                    uniknya tidak bisa lagi dicocokkan.
                  </p>
                )}
              </div>
              <div>
                <label className={LABEL}>Periode awal</label>
                <input
                  type="date"
                  className={INPUT}
                  value={manualPeriodStart}
                  onChange={(e) => setManualPeriodStart(e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>Periode akhir</label>
                <input
                  type="date"
                  className={INPUT}
                  value={manualPeriodEnd}
                  onChange={(e) => setManualPeriodEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className={LABEL}>Rincian item (bebas — hasil nego)</label>
              <div className="space-y-2">
                {manualItems.map((it, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      className={INPUT + ' flex-1'}
                      value={it.label}
                      onChange={(e) => {
                        const next = [...manualItems];
                        next[idx] = { ...next[idx], label: e.target.value };
                        setManualItems(next);
                      }}
                      placeholder="Contoh: Paket nego tahunan"
                    />
                    <input
                      className={INPUT + ' !w-[180px]'}
                      value={it.amount}
                      onChange={(e) => {
                        const next = [...manualItems];
                        next[idx] = { ...next[idx], amount: e.target.value.replace(/[^0-9]/g, '') };
                        setManualItems(next);
                      }}
                      placeholder="Nominal (Rp)"
                      inputMode="numeric"
                    />
                    {manualItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setManualItems(manualItems.filter((_, i) => i !== idx))}
                        className={BTN_DANGER}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setManualItems([...manualItems, { label: '', amount: '' }])}
                className={BTN_GHOST + ' mt-2'}
              >
                + Tambah item
              </button>
            </div>

            <div className="mt-4 grid sm:grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Harga dasar (Rp)</label>
                <input
                  className={INPUT}
                  value={manualBase}
                  onChange={(e) => {
                    setManualBase(e.target.value.replace(/[^0-9]/g, ''));
                    setManualBaseEdited(true);
                  }}
                  placeholder="Dihitung dari item"
                  inputMode="numeric"
                />
                <p className="mt-1 text-[12.5px] text-muted">
                  Jumlah item: {formatIDR(itemsSum)} — dasar bisa diedit bila berbeda dari jumlah item.
                </p>
              </div>
              <div>
                <label className={LABEL}>PPN ({(ppnRateBps / 100).toFixed(ppnRateBps % 100 === 0 ? 0 : 1)}%)</label>
                <p className="rounded-btn border border-line bg-canvas px-3 py-2 text-[13.5px] font-medium text-ink">
                  {formatIDR(manualPpn)}
                </p>
              </div>
              <div>
                <label className={LABEL}>Total sebelum kode unik</label>
                <p className="rounded-btn border border-line bg-canvas px-3 py-2 text-[13.5px] font-medium text-ink">
                  {formatIDR(manualBaseNum + manualPpn)}
                </p>
                <p className="mt-1 text-[12.5px] text-muted">Total transfer = total ini + kode unik (otomatis).</p>
              </div>
            </div>

            <div className="mt-4">
              <label className={LABEL}>Alasan nego (minimal 10 karakter)</label>
              <textarea
                className={INPUT}
                rows={2}
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="Contoh: Nego tahunan — diskon pilot untuk 12 bulan pertama."
              />
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={submitManualInvoice}
                disabled={busy === 'manual-invoice'}
                className={BTN_PRIMARY}
              >
                {busy === 'manual-invoice' ? 'Menerbitkan…' : 'Terbitkan invoice manual'}
              </button>
            </div>

            {createdInvoice && (
              <div className="mt-4 rounded-btn border border-line bg-canvas px-4 py-3">
                <p className="text-[13.5px] font-semibold text-ink">
                  Invoice {createdInvoice.number} terbit — total transfer{' '}
                  {formatIDR(invoiceTotal(createdInvoice))} (berlaku s.d.{' '}
                  {fmtDateTime(createdInvoice.validUntil)}).
                </p>
              </div>
            )}
          </Card>

          {manualTenantId && (
            <Card className="!p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold text-ink">Invoice tenant terpilih</h3>
                <p className="text-[13.5px] text-muted">
                  Saldo kredit: <strong className="text-ink">{formatIDR(tenantCredit)}</strong>
                </p>
              </div>
              {tenantInvoices.length === 0 ? (
                <p className="mt-2 text-[13.5px] text-muted">Tenant ini belum punya invoice.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-muted">
                        <th className="py-2 pr-3 font-medium">Nomor</th>
                        <th className="py-2 pr-3 font-medium">Tujuan</th>
                        <th className="py-2 pr-3 font-medium">Total transfer</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Berlaku s.d.</th>
                        <th className="py-2 font-medium">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenantInvoices.map((inv: any) => (
                        <tr key={inv.id} className="border-b border-line">
                          <td className="py-2 pr-3 font-medium">{inv.number}</td>
                          <td className="py-2 pr-3">
                            {purposeLabel(inv.purpose ?? 'RENEWAL')}
                            {inv.isManual ? ' (manual)' : ''}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">{formatIDR(invoiceTotal(inv))}</td>
                          <td className="py-2 pr-3">
                            <Badge tone={INVOICE_TONES[inv.status] ?? 'gray'}>{inv.status}</Badge>
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">{fmtDateTime(inv.validUntil)}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              {inv.status === 'Kedaluwarsa' && (
                                <button
                                  type="button"
                                  onClick={() => reissueInvoice(inv.id)}
                                  disabled={busy === `reissue-${inv.id}`}
                                  className={BTN_GHOST}
                                >
                                  Terbitkan ulang
                                </button>
                              )}
                              {inv.status === 'Belum Dibayar' && (
                                <button
                                  type="button"
                                  onClick={() => cancelInvoice(inv.id)}
                                  disabled={busy === `cancel-${inv.id}`}
                                  className={BTN_DANGER}
                                >
                                  Batalkan
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === 'laporan' && (
        <div className="space-y-5">
          <Card className="!p-5">
            <h3 className="text-[15px] font-bold text-ink">Laporan Pembayaran Tenant</h3>
            <p className="mt-1 text-[13px] text-muted">
              Client Administrator melaporkan &ldquo;saya sudah transfer&rdquo; dari halaman
              billing-nya (bank, tanggal, nominal, bukti transfer). Lunaskan dari sini
              bila bukti cocok, atau tolak dengan alasan.
            </p>
            {pendingReports.length === 0 && queueReports.length === 0 ? (
              <p className="mt-3 text-[13.5px] text-muted">Belum ada laporan pembayaran tenant.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="py-2 pr-3 font-medium">Tenant</th>
                      <th className="py-2 pr-3 font-medium">Bank</th>
                      <th className="py-2 pr-3 font-medium">Tanggal transfer</th>
                      <th className="py-2 pr-3 font-medium">Nominal</th>
                      <th className="py-2 pr-3 font-medium">Invoice</th>
                      <th className="py-2 pr-3 font-medium">Bukti</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueReports.map((r: any) => (
                      <tr key={r.id} className="border-b border-line align-top">
                        <td className="py-2 pr-3">{tenantName(r.tenantId)}</td>
                        <td className="py-2 pr-3">{BANK_NAMES[r.bankCode] ?? r.bankCode}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.transferDate)}</td>
                        <td className="py-2 pr-3 font-medium whitespace-nowrap">{formatIDR(r.amount ?? 0)}</td>
                        <td className="py-2 pr-3">{r.invoiceId ? r.invoiceId.slice(0, 12) + '…' : '—'}</td>
                        <td className="py-2 pr-3">
                          {r.proofPath ? (
                            <a
                              className="text-brand underline"
                              href={`/api/super/billing/queue/reports/${r.id}/proof`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Unduh bukti
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={r.status === 'PENDING' ? 'amber' : r.status === 'RESOLVED' ? 'green' : 'gray'}>
                            {r.status === 'PENDING' ? 'Menunggu' : r.status === 'RESOLVED' ? 'Selesai' : 'Ditolak'}
                          </Badge>
                          {r.resolveNote && <p className="text-muted mt-1">{r.resolveNote}</p>}
                        </td>
                        <td className="py-2">
                          {r.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => {
                                setReportResolveId(r.id);
                                setReportDecision('settle');
                                setReportInvoiceId(r.invoiceId ?? '');
                                setReportAmount(String(r.amount ?? ''));
                                setReportNote('');
                              }}
                              className={BTN_GHOST}
                            >
                              Proses
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportResolveId && (
              <div className="mt-4 rounded-btn border border-line bg-canvas px-4 py-3 space-y-3">
                <p className="text-[13.5px] font-semibold text-ink">Proses laporan tenant</p>
                <div>
                  <label className={LABEL}>Keputusan</label>
                  <select
                    className={INPUT}
                    value={reportDecision}
                    onChange={(e) => setReportDecision(e.target.value as 'settle' | 'reject')}
                  >
                    <option value="settle">Lunaskan invoice dari laporan ini</option>
                    <option value="reject">Tolak laporan</option>
                  </select>
                </div>
                {reportDecision === 'settle' && (
                  <>
                    <div>
                      <label className={LABEL}>Invoice yang dilunaskan</label>
                      <input
                        className={INPUT}
                        value={reportInvoiceId}
                        onChange={(e) => setReportInvoiceId(e.target.value)}
                        placeholder="ID invoice (terisi dari laporan bila ada)"
                      />
                      <p className="mt-1 text-[12.5px] text-muted">
                        Kosongkan bila laporan tidak menautkan invoice — isi dengan ID invoice
                        Belum Dibayar tenant itu.
                      </p>
                    </div>
                    <div>
                      <label className={LABEL}>Nominal yang diterima (Rp)</label>
                      <input
                        className={INPUT}
                        value={reportAmount}
                        onChange={(e) => setReportAmount(e.target.value.replace(/[^0-9]/g, ''))}
                        inputMode="numeric"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className={LABEL}>
                    Catatan {reportDecision === 'reject' ? '(wajib, minimal 10 karakter)' : '(opsional)'}
                  </label>
                  <textarea
                    className={INPUT}
                    rows={2}
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    placeholder={
                      reportDecision === 'reject'
                        ? 'Contoh: Bukti transfer tidak terbaca dan nominal tidak cocok dengan invoice mana pun.'
                        : 'Contoh: Bukti transfer cocok dengan mutasi BCA tanggal 24 November 2026.'
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={submitResolveReport}
                    disabled={busy === `report-${reportResolveId}`}
                    className={BTN_PRIMARY}
                  >
                    Simpan keputusan
                  </button>
                  <button type="button" onClick={() => setReportResolveId(null)} className={BTN_GHOST}>
                    Batal
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
