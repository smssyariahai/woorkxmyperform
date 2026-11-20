'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui/primitives';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  FileSignature,
  FileText,
  Loader2,
  Save,
  Search,
  Send,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { PdfViewer, type EsignPosition } from './PdfViewer';
import { SignaturePlacement } from './SignaturePlacement';
import { ESIGN_CATEGORIES } from './status';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(j.message || 'Terjadi kesalahan.');
  return j.data;
}

interface SearchUser {
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  position?: string | null;
  department?: string | null;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function titleFromFileName(name: string) {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Naikkan angka di ujung nomor dokumen (ESIGN/2026/001 -> .../002). */
function bumpNumber(num: string) {
  const m = /^(.*?)(\d+)$/.exec(num);
  if (!m) return `${num}-2`;
  return `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}`;
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap rounded-lg border border-line bg-slate-50 p-1 dark:bg-slate-800"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors',
            value === o.value
              ? 'bg-white text-ink shadow-sm dark:bg-slate-900'
              : 'text-muted hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STEPS = [
  { n: 1, label: 'Upload Dokumen', hint: 'Pilih file PDF' },
  { n: 2, label: 'Penandatangan', hint: 'Siapa yang menandatangani' },
  { n: 3, label: 'Posisi Tanda Tangan', hint: 'Atur posisi di PDF' },
  { n: 4, label: 'Info & Kirim', hint: 'Periksa lalu kirim' },
];

/**
 * Wizard buat dokumen E-Sign (Privy-like, 4 langkah):
 *  1. Upload PDF (file disimpan lokal dulu) — judul otomatis dari nama file.
 *  2. Penandatangan (cari pengguna, tambah ke daftar lokal, atur urutan).
 *  3. Posisi Tanda Tangan — seret/ketuk kotak tiap penandatangan ke halaman
 *     PDF (opsional; yang belum ditempatkan ditempatkan otomatis server).
 *  4. Info & Kirim — field esensial + ringkasan + Kirim / Simpan sebagai Draft.
 *
 * Server baru disentuh di langkah 4, dengan payload yang SAMA seperti form
 * lama: POST /api/esign/documents (draft) -> POST .../upload (PDF) ->
 * POST .../signers per penandatangan (beserta placement bila sudah diatur) ->
 * POST .../send (hanya bila Kirim).
 */
export function DocumentForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Langkah 1 — file (lokal dulu, belum diunggah ke server).
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Info dokumen (judul + nomor terisi otomatis, tetap bisa diubah).
  const [title, setTitle] = useState('');
  const [documentNumber, setDocumentNumber] = useState(
    () => `ESIGN/${new Date().getFullYear()}/001`
  );
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [workflowType, setWorkflowType] = useState<'SEQUENTIAL' | 'PARALLEL'>('SEQUENTIAL');
  const [expiresAt, setExpiresAt] = useState('');
  const [displayMode, setDisplayMode] = useState<'all' | 'signature'>('all');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const titleEditedRef = useRef(false);
  const numberEditedRef = useRef(false);

  // Langkah 2 — penandatangan (daftar lokal; baru dikirim di langkah 4).
  const [signers, setSigners] = useState<SearchUser[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Langkah 3 — posisi tanda tangan (fraksi 0–1 + nomor halaman, per userId;
  // satuan yang sama dengan EsignSigner di API — lihat SignaturePlacement).
  const [placements, setPlacements] = useState<Record<string, EsignPosition>>({});

  // Langkah 4 — kirim.
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdDocId, setCreatedDocId] = useState<string | null>(null);
  const [titleError, setTitleError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [numberError, setNumberError] = useState('');

  // Buang posisi milik penandatangan yang dihapus dari daftar.
  useEffect(() => {
    setPlacements((prev) => {
      const ids = new Set(signers.map((s) => s.userId));
      const keys = Object.keys(prev);
      if (keys.every((k) => ids.has(k))) return prev;
      const next: Record<string, EsignPosition> = {};
      for (const k of keys) if (ids.has(k)) next[k] = prev[k];
      return next;
    });
  }, [signers]);

  // Saran nomor dokumen: lanjutkan dari nomor terbesar yang sudah ada.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/esign/documents');
        if (cancelled || numberEditedRef.current) return;
        const year = new Date().getFullYear();
        let max = 0;
        for (const it of data.items ?? []) {
          const m = /^ESIGN\/\d{4}\/(\d+)$/.exec(it.documentNumber ?? '');
          if (m) max = Math.max(max, Number(m[1]));
        }
        setDocumentNumber(`ESIGN/${year}/${String(max + 1).padStart(3, '0')}`);
      } catch {
        // Tanpa izin baca daftar, pakai nomor default — 409 ditangani saat kirim.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Blob URL pratinjau PDF (dibersihkan saat file diganti).
  useEffect(() => {
    if (!file) {
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Pencarian pengguna (pola yang sama seperti SignerManager).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api(`/api/esign/signers/search?q=${encodeURIComponent(q.trim())}`);
        setResults(data.items ?? []);
      } catch (e: any) {
        toast.error(friendlyFetchError(e, 'Gagal mencari pengguna.'));
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q]);

  function pickFile(f: File | null) {
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Format harus PDF.');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('Ukuran maksimal 10MB.');
      return;
    }
    setFile(f);
    // File baru = halaman berbeda — posisi lama tidak berlaku lagi.
    setPlacements({});
    if (!titleEditedRef.current) {
      const t = titleFromFileName(f.name);
      if (t) setTitle(t);
    }
  }

  function addSigner(u: SearchUser) {
    if (signers.some((s) => s.userId === u.userId)) {
      toast.error(`${u.name} sudah ada di daftar penandatangan.`);
      return;
    }
    setSigners((prev) => [...prev, u]);
    setQ('');
    setResults([]);
  }

  function moveSigner(index: number, dir: -1 | 1) {
    setSigners((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function validateStep4() {
    let ok = true;
    if (title.trim().length < 3) {
      setTitleError('Nama dokumen minimal 3 karakter.');
      ok = false;
    } else {
      setTitleError('');
    }
    if (!category) {
      setCategoryError('Pilih salah satu kategori.');
      ok = false;
    } else {
      setCategoryError('');
    }
    if (!documentNumber.trim()) {
      setNumberError('Nomor dokumen wajib diisi.');
      setAdvancedOpen(true);
      ok = false;
    } else {
      setNumberError('');
    }
    return ok;
  }

  async function createDraftOnce(num: string) {
    const r = await fetch('/api/esign/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentNumber: num,
        title: title.trim(),
        category,
        description: description.trim() || null,
        workflowType,
        approvalStatus: 'NOT_REQUIRED',
        expiresAt: expiresAt || null,
        showSignerName: displayMode === 'all',
        showSignerPosition: displayMode === 'all',
        showSignedDate: displayMode === 'all',
        showDocRef: displayMode === 'all',
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.success) {
      const err = new Error(j.message || 'Gagal membuat dokumen.') as Error & { status?: number };
      err.status = r.status;
      throw err;
    }
    return j.data.item;
  }

  /** Buat draft; bila nomor otomatis bentrok (409), naikkan angkanya dan coba lagi. */
  async function createDraftWithRetry() {
    let num = documentNumber.trim();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const item = await createDraftOnce(num);
        if (num !== documentNumber.trim()) setDocumentNumber(num);
        return item;
      } catch (e: any) {
        if (e?.status === 409 && attempt < 2) {
          num = bumpNumber(num);
          continue;
        }
        throw e;
      }
    }
    throw new Error('Gagal membuat dokumen.');
  }

  async function uploadFile(docId: string) {
    if (!file) throw new Error('File PDF belum dipilih.');
    const form = new FormData();
    form.append('file', file);
    const r = await fetch(`/api/esign/documents/${docId}/upload`, { method: 'POST', body: form });
    const j = await r.json().catch(() => ({}));
    if (!j.success) throw new Error(j.message || 'Gagal mengunggah PDF.');
    return j.data;
  }

  async function addAllSigners(docId: string) {
    for (let i = 0; i < signers.length; i++) {
      const s = signers[i];
      const pos = placements[s.userId];
      const r = await fetch(`/api/esign/documents/${docId}/signers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: s.userId,
          signingOrder: i + 1,
          ...(workflowType === 'PARALLEL' ? { signingGroup: 1 } : {}),
          // Posisi tanda tangan (fraksi 0–1 + nomor halaman); bila belum
          // ditempatkan, dikosongkan — server menempatkannya otomatis.
          ...(pos
            ? {
                placementPage: pos.page,
                placementX: pos.x,
                placementY: pos.y,
                placementWidth: pos.width,
                placementHeight: pos.height,
              }
            : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.success) throw new Error(j.message || `Gagal menambahkan ${s.name}.`);
      if (j.data?.warning) toast.warning(j.data.warning);
    }
  }

  /** Draft + upload + penandatangan (dipakai Kirim maupun Simpan sebagai Draft). */
  async function prepareDocument(): Promise<string> {
    setSubmitError(null);
    setProgress('Membuat draft…');
    const item = await createDraftWithRetry();
    setCreatedDocId(item.id);
    setProgress('Mengunggah PDF…');
    await uploadFile(item.id);
    setProgress('Menambahkan penandatangan…');
    await addAllSigners(item.id);
    return item.id;
  }

  async function handleSend() {
    if (!validateStep4()) return;
    setSubmitting(true);
    try {
      const id = await prepareDocument();
      setProgress('Mengirim dokumen…');
      const sent = await api(`/api/esign/documents/${id}/send`, { method: 'POST' });
      toast.success('Dokumen dikirim untuk ditandatangani.');
      // Server mengembalikan peringatan untuk penandatangan tanpa posisi.
      if (sent?.warnings?.length) {
        toast.warning(
          `Posisi tanda tangan belum diatur untuk: ${sent.warnings
            .map((w: { signerName: string }) => w.signerName)
            .join(', ')} — akan ditempatkan otomatis di halaman terakhir.`
        );
      }
      router.push(`/esign/${id}`);
    } catch (e: any) {
      setSubmitError(friendlyFetchError(e, 'Gagal mengirim dokumen.'));
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  async function handleSaveDraft() {
    if (!validateStep4()) return;
    setSubmitting(true);
    try {
      const id = await prepareDocument();
      toast.success('Draft disimpan. Kamu bisa menambah penandatangan atau mengirimnya nanti.');
      router.push(`/esign/${id}`);
    } catch (e: any) {
      setSubmitError(friendlyFetchError(e, 'Gagal menyimpan draft.'));
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const displayAll = displayMode === 'all';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
          <FileSignature className="h-5 w-5 text-brand-700" /> Buat Dokumen E-Sign
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Empat langkah singkat — unggah PDF, pilih penandatangan, atur posisi tanda tangan, lalu
          kirim. Tanda tangan elektronik internal — bukan tersertifikasi PSrE.
        </p>
      </div>

      {/* Stepper */}
      <ol className="flex items-start gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
          const done = step > s.n;
          const current = step === s.n;
          const clickable = s.n < step;
          return (
            <li key={s.n} className="flex min-w-0 flex-1 items-start gap-2">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && setStep(s.n as 1 | 2 | 3 | 4)}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left',
                  clickable && 'hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                    done
                      ? 'bg-emerald-600 text-white'
                      : current
                        ? 'bg-brand-600 text-white'
                        : 'border border-line bg-white text-muted dark:bg-slate-900'
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : s.n}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block truncate text-[13px] font-semibold',
                      current ? 'text-ink' : 'text-muted'
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="hidden truncate text-[12px] text-muted sm:block">{s.hint}</span>
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className={cn('mt-4 h-px w-4 shrink-0 sm:w-8', done ? 'bg-emerald-500' : 'bg-line')} />
              )}
            </li>
          );
        })}
      </ol>

      {/* ============ LANGKAH 1 — UPLOAD ============ */}
      {step === 1 && (
        <Card>
          <CardTitle>Unggah dokumen PDF</CardTitle>
          <p className="mt-1 text-[13px] text-muted">
            Pilih file kontrak atau surat yang akan ditandatangani. Nama dokumen akan terisi
            otomatis dari nama file — bisa diubah nanti di langkah 3.
          </p>
          <div className="mt-4">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
                e.target.value = '';
              }}
            />
            {!file ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) pickFile(f);
                }}
                className={cn(
                  'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-12 text-center transition-colors',
                  drag ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'border-line hover:border-brand/50'
                )}
              >
                <UploadCloud className="h-10 w-10 text-muted" />
                <span className="text-[15px] font-medium text-ink">
                  Seret file PDF ke sini, atau klik untuk memilih
                </span>
                <span className="flex items-center gap-1.5 text-[12px] text-muted">
                  <FileText className="h-3.5 w-3.5" /> Hanya PDF · maksimal 10 MB
                </span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-line bg-slate-50 p-3 dark:bg-slate-800/60">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{file.name}</span>
                    <span className="block text-[12px] text-muted">{formatBytes(file.size)} · PDF</span>
                  </span>
                  <button
                    type="button"
                    className="btn-secondary !px-3 !py-2"
                    onClick={() => inputRef.current?.click()}
                  >
                    Ganti
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-danger hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => {
                      setFile(null);
                      setPlacements({});
                    }}
                    title="Hapus file"
                    aria-label="Hapus file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {fileUrl && (
                  <div>
                    <p className="mb-2 text-[13px] font-medium text-ink">Pratinjau dokumen</p>
                    <PdfViewer src={fileUrl} />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              className="btn-primary !px-5 !py-3 !text-[15px]"
              disabled={!file}
              onClick={() => setStep(2)}
            >
              Lanjut ke Penandatangan <ArrowRight className="ml-1 inline h-4 w-4" />
            </button>
          </div>
          {!file && (
            <p className="mt-2 text-right text-[12px] text-muted">Pilih file PDF dulu untuk melanjutkan.</p>
          )}
        </Card>
      )}

      {/* ============ LANGKAH 2 — PENANDATANGAN ============ */}
      {step === 2 && (
        <Card>
          <CardTitle>Siapa yang menandatangani?</CardTitle>
          <p className="mt-1 text-[13px] text-muted">
            {workflowType === 'SEQUENTIAL'
              ? 'Berurutan — penandatangan diminta satu per satu sesuai nomor urut di bawah.'
              : 'Bersamaan — semua penandatangan diminta tanda tangan pada saat yang sama.'}{' '}
            Urutan penandatanganan bisa diubah di Pengaturan lanjutan (langkah 4).
          </p>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              className="input w-full !pl-9"
              placeholder="Cari nama atau email pengguna… (min. 2 huruf)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {searching && <p className="mt-1 text-[12px] text-muted">Mencari…</p>}
            {results.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white shadow-lg dark:bg-slate-900">
                {results.map((u) => (
                  <li key={u.userId}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-[13px] hover:bg-brand-50 dark:hover:bg-brand-900/20"
                      onClick={() => addSigner(u)}
                    >
                      <b>{u.name}</b> <span className="text-muted">· {u.email}</span>
                      {u.position ? (
                        <span className="block text-[12px] text-muted">{u.position}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {signers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
                <p className="text-[14px] font-medium text-ink">Belum ada penandatangan</p>
                <p className="mt-1 text-[13px] text-muted">
                  Cari nama atau email pengguna di atas, lalu ketuk untuk menambahkan.
                </p>
              </div>
            ) : (
              signers.map((s, i) => (
                <div
                  key={s.userId}
                  className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 dark:bg-slate-900"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-700 dark:bg-brand-900/40">
                    {initials(s.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="inline-block min-w-6 rounded bg-brand-50 px-1.5 py-0.5 text-center text-[11px] font-bold text-brand-700 dark:bg-brand-900/40">
                        {i + 1}
                      </span>
                      <b className="truncate text-[14px] text-ink">{s.name}</b>
                    </span>
                    <span className="block truncate text-[12px] text-muted">
                      {[s.position, s.department, s.email].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      className="rounded p-1 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-30 dark:hover:bg-slate-800"
                      disabled={i === 0}
                      onClick={() => moveSigner(i, -1)}
                      title="Naikkan urutan"
                      aria-label="Naikkan urutan"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-30 dark:hover:bg-slate-800"
                      disabled={i === signers.length - 1}
                      onClick={() => moveSigner(i, 1)}
                      title="Turunkan urutan"
                      aria-label="Turunkan urutan"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg p-2 text-danger hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => setSigners((prev) => prev.filter((x) => x.userId !== s.userId))}
                    title="Hapus penandatangan"
                    aria-label="Hapus penandatangan"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-1 inline h-4 w-4" /> Kembali
            </button>
            <div className="text-right">
              <button
                type="button"
                className="btn-primary !px-5 !py-3 !text-[15px]"
                disabled={signers.length === 0}
                onClick={() => setStep(3)}
              >
                Lanjut ke Posisi Tanda Tangan <ArrowRight className="ml-1 inline h-4 w-4" />
              </button>
              {signers.length === 0 && (
                <p className="mt-2 text-[12px] text-muted">Tambahkan minimal 1 penandatangan.</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ============ LANGKAH 3 — POSISI TANDA TANGAN ============ */}
      {step === 3 && fileUrl && (
        <Card>
          <CardTitle>Di mana mereka menandatangani?</CardTitle>
          <p className="mt-1 text-[13px] text-muted">
            Seret atau ketuk untuk menempatkan kotak tanda tangan setiap orang di dokumen. Langkah
            ini opsional — yang belum ditempatkan akan diatur otomatis nanti.
          </p>
          <div className="mt-4">
            <SignaturePlacement
              fileUrl={fileUrl}
              signers={signers}
              placements={placements}
              onPlacementsChange={setPlacements}
            />
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-1 inline h-4 w-4" /> Kembali
            </button>
            <button
              type="button"
              className="btn-primary !px-5 !py-3 !text-[15px]"
              onClick={() => setStep(4)}
            >
              Lanjut ke Info &amp; Kirim <ArrowRight className="ml-1 inline h-4 w-4" />
            </button>
          </div>
        </Card>
      )}

      {/* ============ LANGKAH 4 — INFO & KIRIM ============ */}
      {step === 4 && (
        <Card>
          <CardTitle>Periksa lalu kirim</CardTitle>
          <p className="mt-1 text-[13px] text-muted">
            Pastikan nama dan kategorinya sudah benar. Nomor dokumen sudah dibuat otomatis — bisa
            diubah di Pengaturan lanjutan bila perlu.
          </p>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="label">Nama dokumen *</span>
              <input
                className="input"
                value={title}
                onChange={(e) => {
                  titleEditedRef.current = true;
                  setTitle(e.target.value);
                  if (titleError) setTitleError('');
                }}
                placeholder="mis. Kontrak Kerja — Andi Wijaya"
              />
              {titleError && <span className="mt-1 block text-[12px] text-danger">{titleError}</span>}
            </label>

            <div>
              <span className="label">Kategori *</span>
              <div className="flex flex-wrap gap-2">
                {ESIGN_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCategory(c);
                      if (categoryError) setCategoryError('');
                    }}
                    aria-pressed={category === c}
                    className={cn(
                      'rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors',
                      category === c
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-line bg-white text-ink hover:border-brand/50 dark:bg-slate-900'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {categoryError && <span className="mt-1 block text-[12px] text-danger">{categoryError}</span>}
            </div>

            {/* Ringkasan */}
            <div className="rounded-xl border border-line bg-slate-50 p-4 dark:bg-slate-800/60">
              <p className="text-[13px] font-semibold text-ink">Ringkasan</p>
              <dl className="mt-2 space-y-2 text-[13px]">
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-muted">Dokumen</dt>
                  <dd className="min-w-0 font-medium text-ink">
                    <span className="block truncate">{file?.name ?? '—'}</span>
                    <span className="text-[12px] font-normal text-muted">
                      {file ? `${formatBytes(file.size)} · PDF` : ''}
                    </span>
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-muted">Penandatangan</dt>
                  <dd className="min-w-0 text-ink">
                    {signers.map((s, i) => (
                      <span key={s.userId} className="block truncate">
                        {i + 1}. {s.name}
                        {s.position ? <span className="text-muted"> · {s.position}</span> : null}
                        {placements[s.userId] ? (
                          <span className="text-muted"> · Hal. {placements[s.userId].page}</span>
                        ) : (
                          <span className="text-muted"> · posisi otomatis</span>
                        )}
                      </span>
                    ))}
                    <span className="block text-[12px] text-muted">
                      {workflowType === 'SEQUENTIAL' ? 'Berurutan' : 'Bersamaan'}
                    </span>
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-muted">Nomor dokumen</dt>
                  <dd className="font-medium text-ink">{documentNumber || '—'}</dd>
                </div>
              </dl>
            </div>

            {/* Pengaturan lanjutan */}
            <div className="rounded-xl border border-line">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
              >
                <span className="text-[13px] font-semibold text-ink">Pengaturan lanjutan</span>
                <ChevronDown
                  className={cn('h-4 w-4 text-muted transition-transform', advancedOpen && 'rotate-180')}
                />
              </button>
              {advancedOpen && (
                <div className="space-y-4 border-t border-line px-4 py-4">
                  <label className="block">
                    <span className="label">Nomor dokumen</span>
                    <input
                      className="input"
                      value={documentNumber}
                      onChange={(e) => {
                        numberEditedRef.current = true;
                        setDocumentNumber(e.target.value);
                        if (numberError) setNumberError('');
                      }}
                      placeholder="mis. ESIGN/2026/001"
                    />
                    {numberError && (
                      <span className="mt-1 block text-[12px] text-danger">{numberError}</span>
                    )}
                  </label>
                  <label className="block">
                    <span className="label">Deskripsi (opsional)</span>
                    <textarea
                      className="input min-h-[72px]"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Keterangan singkat dokumen (opsional)"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <span className="label">Urutan penandatanganan</span>
                      <Segmented
                        ariaLabel="Urutan penandatanganan"
                        value={workflowType}
                        onChange={setWorkflowType}
                        options={[
                          { value: 'SEQUENTIAL', label: 'Berurutan' },
                          { value: 'PARALLEL', label: 'Bersamaan' },
                        ]}
                      />
                    </div>
                    <label className="block">
                      <span className="label">Tanggal kedaluwarsa (opsional)</span>
                      <input
                        type="date"
                        className="input"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                      />
                    </label>
                  </div>
                  <div>
                    <span className="label">Tampilan tanda tangan di PDF final</span>
                    <p className="mb-2 text-[12px] text-muted">
                      Elemen di bawah gambar tanda tangan. Pilih “Hanya tanda tangan” bila
                      nama/jabatan sudah tercetak di isi kontrak.
                    </p>
                    <Segmented
                      ariaLabel="Tampilan tanda tangan di PDF final"
                      value={displayMode}
                      onChange={setDisplayMode}
                      options={[
                        { value: 'signature', label: 'Hanya tanda tangan' },
                        { value: 'all', label: 'Tampilkan semua' },
                      ]}
                    />
                    <p className="mt-2 text-[12px] text-muted">
                      {displayAll
                        ? 'Yang ditampilkan: nama, jabatan, tanggal tanda tangan, dan nomor referensi dokumen.'
                        : 'Hanya gambar tanda tangan — tanpa nama, jabatan, tanggal, dan nomor referensi.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200">
                <p className="font-semibold">Tidak bisa melanjutkan</p>
                <p className="mt-1">{submitError}</p>
                {createdDocId && (
                  <button
                    type="button"
                    className="btn-secondary mt-3"
                    onClick={() => router.push(`/esign/${createdDocId}`)}
                  >
                    Lihat dokumen (draft sudah tersimpan)
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                className="btn-secondary"
                disabled={submitting}
                onClick={() => setStep(3)}
              >
                <ArrowLeft className="mr-1 inline h-4 w-4" /> Kembali
              </button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="btn-secondary !px-5 !py-3"
                  disabled={submitting}
                  onClick={handleSaveDraft}
                >
                  {submitting && progress ? (
                    <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1 inline h-4 w-4" />
                  )}
                  Simpan sebagai Draft
                </button>
                <button
                  type="button"
                  className="btn-primary !px-5 !py-3 !text-[15px]"
                  disabled={submitting}
                  onClick={handleSend}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
                      {progress ?? 'Memproses…'}
                    </>
                  ) : (
                    <>
                      <Send className="mr-1 inline h-4 w-4" /> Kirim untuk Ditandatangani
                    </>
                  )}
                </button>
              </div>
            </div>
            <p className="text-center text-[12px] text-muted sm:text-right">
              Setelah dikirim, para penandatangan akan diberitahu lewat WhatsApp.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
