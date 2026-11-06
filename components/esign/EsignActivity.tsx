'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/primitives';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { History, Search } from 'lucide-react';

const jam = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

import { ESIGN_ACTION_LABELS, auditSummary } from './audit-label';

const ACTION_OPTIONS = Object.entries(ESIGN_ACTION_LABELS).map(([value, label]) => ({ value, label }));

async function api(path: string) {
  const r = await fetch(path);
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(j.message || 'Terjadi kesalahan.');
  return j.data;
}

/** Halaman Riwayat Aktivitas E-Sign: semua audit log dalam satu org, terbaru dulu. */
export function EsignActivity() {
  const searchParams = useSearchParams();
  const initialDoc = searchParams.get('documentId') ?? '';
  const [items, setItems] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [documentId, setDocumentId] = useState(initialDoc);
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (documentId) q.set('documentId', documentId);
      if (action) q.set('action', action);
      q.set('page', String(page));
      q.set('limit', '20');
      const data = await api(`/api/esign/activity?${q.toString()}`);
      setItems(data.items ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal memuat riwayat aktivitas.'));
    } finally {
      setLoading(false);
    }
  }, [documentId, action, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api('/api/esign/documents')
      .then((d) => setDocs(d.items ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
          <History className="h-5 w-5 text-brand-700" /> Riwayat Aktivitas E-Sign
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Audit trail append-only — semua aksi pada dokumen E-Sign tercatat dan tidak dapat diubah.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          <select
            className="input"
            value={documentId}
            onChange={(e) => {
              setDocumentId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua dokumen</option>
            {docs.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.documentNumber} — {d.title}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua aksi</option>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="py-10 text-center text-[13px] text-muted">Memuat riwayat…</p>
        ) : items.length ? (
          <>
            <ul className="mt-4 space-y-3">
              {items.map((a: any) => (
                <li key={a.id} className="border-b border-line pb-3 text-[13px] last:border-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span>
                      <b>{ESIGN_ACTION_LABELS[a.action] ?? a.action}</b>
                      {a.document ? (
                        <>
                          {' — '}
                          <Link href={`/esign/${a.document.id}`} className="text-brand-700 hover:underline">
                            {a.document.documentNumber} · {a.document.title}
                          </Link>
                        </>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-muted">{jam(a.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-muted">
                    {a.user?.name ?? 'Sistem'}
                    {auditSummary(a.metadata) ? ` · ${auditSummary(a.metadata)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between text-[13px] text-muted">
              <span>
                Halaman {page} dari {totalPages} · {total} aktivitas
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </button>
              </span>
            </div>
          </>
        ) : (
          <p className="py-10 text-center text-[13px] text-muted">
            <Search className="mx-auto mb-2 h-5 w-5" />
            Belum ada aktivitas untuk filter ini.
          </p>
        )}
      </Card>
    </div>
  );
}
