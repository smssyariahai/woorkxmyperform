'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Badge } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

const PAGE_SIZE = 20;

const STATUS_META: Record<string, { tone: 'green' | 'amber' | 'red' | 'gray'; label: string }> = {
  PENDING_VERIFICATION: { tone: 'amber', label: 'Menunggu Verifikasi' },
  NEEDS_REVISION: { tone: 'amber', label: 'Perlu Perbaikan' },
  APPROVED: { tone: 'green', label: 'Disetujui' },
  REJECTED: { tone: 'red', label: 'Ditolak' },
};

const TABS: { value: string; label: string }[] = [
  { value: '', label: 'Semua' },
  { value: 'PENDING_VERIFICATION', label: 'Menunggu Verifikasi' },
  { value: 'NEEDS_REVISION', label: 'Perlu Perbaikan' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
];

interface PackageSummary {
  userTierName: string | null;
  storageTierName: string | null;
  moduleNames: string[];
  monthlyPrice: number | null;
}

interface RegistrationListItem {
  id: string;
  companyName: string;
  legalEntityType: string;
  city: string;
  picName: string;
  picEmail: string;
  startChoice: string;
  billingCycle: string;
  packageSummary: PackageSummary;
  status: string;
  createdAt: string;
  decidedAt: string | null;
}

interface ListResponse {
  items: RegistrationListItem[];
  counts: Record<string, number>;
  page: number;
  total: number;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatIDR(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'Harga khusus';
  return 'Rp' + n.toLocaleString('id-ID');
}

export function RegistrationsClient() {
  const [items, setItems] = useState<RegistrationListItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (s: string, query: string, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (s) params.set('status', s);
      if (query) params.set('q', query);
      params.set('page', String(p));
      const r = await fetch(`/api/super/registrations?${params.toString()}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Gagal memuat antrean pendaftaran.');
      const data = j.data as ListResponse;
      setItems(data.items ?? []);
      setCounts(data.counts ?? {});
      setTotal(typeof data.total === 'number' ? data.total : (data.items ?? []).length);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Gagal memuat antrean pendaftaran.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(status, debouncedQ, page);
  }, [status, debouncedQ, page, load]);

  const totalPending = counts.PENDING_VERIFICATION ?? 0;
  const hasNext = useMemo(
    () => items.length === PAGE_SIZE && page * PAGE_SIZE < total,
    [items.length, page, total],
  );

  function changeTab(value: string) {
    setStatus(value);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink">Verifikasi Pendaftaran</h1>
        <p className="mt-1 text-sm text-muted">
          Antrean pendaftaran tenant baru (Jalur B). {totalPending > 0 ? `${totalPending} pendaftaran menunggu verifikasi.` : 'Tidak ada pendaftaran yang menunggu verifikasi.'}
        </p>
      </div>

      {/* Filter tab status */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = t.value === '' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[t.value] ?? 0);
          const active = status === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => changeTab(t.value)}
              className={
                'rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ' +
                (active ? 'border-brand bg-brand text-white' : 'border-line bg-white text-muted hover:text-ink')
              }
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Cari */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-9"
          placeholder="Cari nama perusahaan, PIC, atau email…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
      </div>

      {error && (
        <div className="rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Memuat antrean pendaftaran…</p>
      ) : items.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          Tidak ada pendaftaran pada filter ini.
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const meta = STATUS_META[it.status] ?? { tone: 'gray' as const, label: it.status };
            return (
              <Link key={it.id} href={`/admin/verifikasi-pendaftaran/${it.id}`}>
                <Card className="p-4 transition-colors hover:border-brand/60">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">{it.companyName}</p>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {it.legalEntityType} · {it.city} · PIC {it.picName} ({it.picEmail})
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        {it.packageSummary?.userTierName ?? '—'} · {it.packageSummary?.storageTierName ?? '—'}
                        {(it.packageSummary?.moduleNames?.length ?? 0) > 0 && ` · ${it.packageSummary.moduleNames.join(', ')}`}
                        {' · '}
                        {it.packageSummary?.monthlyPrice !== null && it.packageSummary?.monthlyPrice !== undefined
                          ? `${formatIDR(it.packageSummary.monthlyPrice)}/bln`
                          : 'Harga khusus'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-[12px] text-muted">
                        {it.startChoice === 'TRIAL' ? 'Trial 30 hari' : 'Langsung berlangganan'} · {it.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'}
                      </span>
                      <span className="text-[12px] text-muted">Didaftarkan {fmtDate(it.createdAt)}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Paginasi */}
      {!loading && items.length > 0 && (
        <div className="flex items-center justify-between pt-1 text-[13px] text-muted">
          <span>Total {total} pendaftaran</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-input border border-line bg-white px-3 py-1.5 font-semibold text-ink disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <span className="self-center">Halaman {page}</span>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-input border border-line bg-white px-3 py-1.5 font-semibold text-ink disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
