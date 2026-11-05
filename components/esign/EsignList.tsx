'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/primitives';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { FileSignature, Plus, Search, Settings, History } from 'lucide-react';
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (qDebounced.trim()) params.set('q', qDebounced.trim());
    api(`/api/esign/documents?${params.toString()}`)
      .then((d) => {
        if (!cancelled) setItems(d.items ?? []);
      })
      .catch((e: any) => {
        if (!cancelled) {
          setErr(friendlyFetchError(e, 'Gagal memuat dokumen.'));
          toast.error(friendlyFetchError(e, 'Gagal memuat dokumen.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, qDebounced]);

  // Refetch senyap saat event realtime esign:* diterima (tanpa flash loading).
  const refetch = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (qDebounced.trim()) params.set('q', qDebounced.trim());
      const d = await api(`/api/esign/documents?${params.toString()}`);
      setItems(d.items ?? []);
    } catch {
      /* biarkan daftar lama — refresh manual tetap tersedia */
    }
  }, [status, qDebounced]);

  return (
    <div className="space-y-5">
      <EsignClient onEvent={() => refetch()} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
            <FileSignature className="h-5 w-5 text-brand-700" /> E-Sign
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Tanda tangan elektronik internal — bukan tersertifikasi PSrE.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/esign/activity" className="btn-secondary">
            <History className="mr-1 inline h-4 w-4" /> Riwayat Aktivitas
          </Link>
          <Link href="/esign/settings" className="btn-secondary">
            <Settings className="mr-1 inline h-4 w-4" /> Pengaturan
          </Link>
          <Link href="/esign/new" className="btn-primary">
            <Plus className="mr-1 inline h-4 w-4" /> Buat Dokumen
          </Link>
        </div>
      </div>

      {/* Filter + cari */}
      <div className="flex flex-wrap items-center gap-2">
        {ESIGN_STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatus(f.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
              status === f.id
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-line bg-white text-muted hover:border-brand/50 dark:bg-slate-900'
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="input !w-56 !pl-9"
            placeholder="Cari judul / nomor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </span>
      </div>

      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <p className="py-10 text-center text-[13px] text-muted">Memuat dokumen…</p>
        ) : err ? (
          <p className="py-10 text-center text-[13px] text-danger">{err}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileSignature className="h-8 w-8 text-muted" />
            <p className="mt-3 font-semibold text-ink">Belum ada dokumen</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted">
              Buat dokumen E-Sign pertama — unggah PDF, atur penandatangan, lalu kirim.
            </p>
            <Link href="/esign/new" className="btn-primary mt-4">
              <Plus className="mr-1 inline h-4 w-4" /> Buat Dokumen
            </Link>
          </div>
        ) : (
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[12px] uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Dokumen</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Kategori</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Tanda tangan</th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d: any) => {
                const meta = ESIGN_STATUS_META[d.status] ?? { label: d.status };
                const signed = (d.signers ?? []).filter((s: any) => s.signingStatus === 'SIGNED').length;
                return (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/esign/${d.id}`)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3">
                      <span className="block font-medium text-ink">{d.title}</span>
                      <span className="block text-[12px] text-muted">{d.documentNumber}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted md:table-cell">{d.category}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[d.status] ?? 'gray'}>{meta.label}</Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-muted sm:table-cell">
                      {signed}/{(d.signers ?? []).length}
                    </td>
                    <td className="hidden px-4 py-3 text-muted lg:table-cell">{tgl(d.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
