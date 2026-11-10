'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/primitives';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { FileSignature, FileText, Plus, Search, Settings, History, ChevronRight, RefreshCw } from 'lucide-react';
import { ESIGN_STATUS_META, ESIGN_STATUS_FILTERS } from './status';
import { EsignClient } from './EsignClient';
import { cn } from '@/lib/utils';

const tgl = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

async function api(path: string) {
  const r = await fetch(path);
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(j.message || 'Terjadi kesalahan.');
  return j.data;
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'blue' | 'red' | 'gray'> = {
  DRAFT: 'gray',
  PENDING_APPROVAL: 'amber',
  PENDING_SIGNATURE: 'blue',
  PARTIALLY_SIGNED: 'blue',
  SIGNED: 'green',
  COMPLETED: 'green',
  REJECTED: 'red',
  CANCELLED: 'red',
  EXPIRED: 'red',
};

function SignProgress({ signed, total }: { signed: number; total: number }) {
  const pct = total > 0 ? Math.round((signed / total) * 100) : 0;
  const done = total > 0 && signed >= total;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 sm:w-20">
        <span
          className={cn('block h-full rounded-full transition-all', done ? 'bg-emerald-500' : 'bg-brand-600')}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="shrink-0 text-[12.5px] font-medium tabular-nums text-muted">
        {signed}/{total}
      </span>
    </span>
  );
}

/** Daftar dokumen E-Sign: filter status + pencarian, tautan ke detail & buat dokumen. */
export function EsignList() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (qDebounced.trim()) params.set('q', qDebounced.trim());
    return params.toString();
  }, [status, qDebounced]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const d = await api(`/api/esign/documents?${buildParams()}`);
      setItems(d.items ?? []);
    } catch (e: any) {
      const msg = friendlyFetchError(e, 'Gagal memuat dokumen.');
      setErr(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    api(`/api/esign/documents?${buildParams()}`)
      .then((d) => {
        if (!cancelled) setItems(d.items ?? []);
      })
      .catch((e: any) => {
        if (!cancelled) {
          const msg = friendlyFetchError(e, 'Gagal memuat dokumen.');
          setErr(msg);
          toast.error(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buildParams]);

  // Refetch senyap saat event realtime esign:* diterima (tanpa flash loading).
  const refetch = useCallback(async () => {
    try {
      const d = await api(`/api/esign/documents?${buildParams()}`);
      setItems(d.items ?? []);
    } catch {
      /* biarkan daftar lama — refresh manual tetap tersedia */
    }
  }, [buildParams]);

  const skeleton = (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          </div>
          <div className="h-6 w-20 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  );

  const emptyState = (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100">
        <FileSignature className="h-7 w-7" />
      </span>
      <p className="mt-4 font-semibold text-ink">Belum ada dokumen</p>
      <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted">
        Buat dokumen E-Sign pertama — unggah PDF, atur penandatangan, lalu kirim.
      </p>
      <Link href="/esign/new" className="btn-primary mt-5">
        <Plus className="mr-1 inline h-4 w-4" /> Buat Dokumen
      </Link>
    </div>
  );

  const errorState = (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <p className="font-semibold text-ink">Gagal memuat dokumen</p>
      <p className="mt-1 max-w-xs text-[13px] text-muted">{err}</p>
      <button type="button" onClick={load} className="btn-secondary mt-5">
        <RefreshCw className="mr-1 inline h-4 w-4" /> Coba lagi
      </button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
      <EsignClient onEvent={() => refetch()} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
            <FileSignature className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold leading-tight text-ink sm:text-2xl">E-Sign</h1>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              Tanda tangan elektronik internal — bukan tersertifikasi PSrE.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Link href="/esign/activity" className="btn-secondary" aria-label="Riwayat Aktivitas">
            <History className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Riwayat Aktivitas</span>
          </Link>
          <Link href="/esign/settings" className="btn-secondary" aria-label="Pengaturan">
            <Settings className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Pengaturan</span>
          </Link>
          <Link href="/esign/new" className="btn-primary flex-1 justify-center sm:flex-none">
            <Plus className="mr-1.5 h-4 w-4" /> Buat Dokumen
          </Link>
        </div>
      </div>

      {/* Filter + cari */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="-mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ESIGN_STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatus(f.id)}
              aria-pressed={status === f.id}
              className={cn(
                'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                status === f.id
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-line bg-white text-muted hover:border-brand/50 hover:text-ink dark:bg-slate-900'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="relative w-full sm:ml-auto sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="input !w-full !pl-9"
            placeholder="Cari judul / nomor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Cari dokumen"
          />
        </span>
      </div>

      {/* Daftar — tabel di desktop */}
      <Card className="!p-0 hidden overflow-hidden md:block">
        {loading ? (
          skeleton
        ) : err ? (
          errorState
        ) : items.length === 0 ? (
          emptyState
        ) : (
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line bg-slate-50/70 text-[11.5px] uppercase tracking-wider text-muted dark:bg-slate-800/40">
                <th className="px-5 py-3.5 font-semibold">Dokumen</th>
                <th className="px-4 py-3.5 font-semibold">Kategori</th>
                <th className="px-4 py-3.5 font-semibold">Status</th>
                <th className="px-4 py-3.5 font-semibold">Tanda tangan</th>
                <th className="px-4 py-3.5 font-semibold">Dibuat</th>
                <th className="w-10 px-2 py-3.5" aria-label="" />
              </tr>
            </thead>
            <tbody>
              {items.map((d: any) => {
                const meta = ESIGN_STATUS_META[d.status] ?? { label: d.status };
                const signed = (d.signers ?? []).filter((s: any) => s.signingStatus === 'SIGNED').length;
                const total = (d.signers ?? []).length;
                return (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/esign/${d.id}`)}
                    className="group cursor-pointer border-b border-line/70 last:border-0 transition-colors hover:bg-brand-50/40 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          <FileText className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">{d.title}</span>
                          <span className="block truncate text-[12px] text-muted">{d.documentNumber}</span>
                        </span>
                      </span>
                    </td>
                    <td className="max-w-44 truncate px-4 py-3.5 text-muted">{d.category || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <Badge tone={STATUS_TONE[d.status] ?? 'gray'}>{meta.label}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <SignProgress signed={signed} total={total} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-muted">{tgl(d.createdAt)}</td>
                    <td className="px-2 py-3.5 text-muted">
                      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Daftar — kartu di ponsel */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <Card className="!p-0 overflow-hidden">{skeleton}</Card>
        ) : err ? (
          <Card className="!p-0 overflow-hidden">{errorState}</Card>
        ) : items.length === 0 ? (
          <Card className="!p-0 overflow-hidden">{emptyState}</Card>
        ) : (
          items.map((d: any) => {
            const meta = ESIGN_STATUS_META[d.status] ?? { label: d.status };
            const signed = (d.signers ?? []).filter((s: any) => s.signingStatus === 'SIGNED').length;
            const total = (d.signers ?? []).length;
            return (
              <article
                key={d.id}
                onClick={() => router.push(`/esign/${d.id}`)}
                className="cursor-pointer rounded-2xl border border-line bg-white p-4 shadow-soft transition-colors active:bg-slate-50 dark:bg-slate-900 dark:active:bg-slate-800/60"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') router.push(`/esign/${d.id}`);
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-snug text-ink">{d.title}</p>
                    <p className="mt-0.5 truncate text-[12px] text-muted">{d.documentNumber}</p>
                  </div>
                  <Badge tone={STATUS_TONE[d.status] ?? 'gray'}>{meta.label}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-line/70 pt-3">
                  <SignProgress signed={signed} total={total} />
                  <span className="truncate text-[12px] text-muted">
                    {d.category ? `${d.category} · ` : ''}
                    {tgl(d.createdAt)}
                  </span>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
