'use client';

import { useCallback, useEffect, useState } from 'react';
import { Avatar, Badge } from '@/components/ui/primitives';
import { SearchInput, Pagination } from '@/components/ui/search';
import { Skeleton, ErrorState, NoResults } from '@/components/ui/states';
import { formatDateTime } from '@/lib/utils';
import { ShieldCheck } from 'lucide-react';

interface Log {
  id: string;
  action: string;
  module: string;
  description: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

const MODULES = ['AUTH', 'CRM', 'INBOX', 'BROADCAST', 'BOT', 'TEAM', 'CHANNELS', 'SETTINGS', 'SECURITY', 'WORKSPACE'];

export function AuditClient() {
  const [items, setItems] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), perPage: '15' });
      if (module) params.set('module', module);
      if (action.trim()) params.set('action', action.trim().toUpperCase());
      if (date) params.set('date', date);
      const r = await fetch(`/api/audit?${params}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setItems(j.data.items);
      setTotalPages(j.data.totalPages);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat audit log.');
    } finally {
      setLoading(false);
    }
  }, [page, module, action, date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [module, action, date]);

  const hasFilter = module !== '' || action.trim() !== '' || date !== '';

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Audit Log</h1>
        <p className="text-sm text-muted">Seluruh aktivitas penting sistem tercatat di sini.</p>
      </div>

      <div className="card !p-4">
        <div className="flex flex-wrap gap-3">
          <select value={module} onChange={(e) => setModule(e.target.value)} className="input !w-auto" aria-label="Filter modul">
            <option value="">Semua modul</option>
            {MODULES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Filter aksi (mis. LOGIN)"
            className="input !w-auto"
            aria-label="Filter aksi"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input !w-auto"
            aria-label="Filter tanggal"
          />
          {hasFilter && (
            <button
              className="btn-secondary !py-2 text-[13px]"
              onClick={() => { setModule(''); setAction(''); setDate(''); }}
            >
              Bersihkan
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="table-wrap p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="card"><ErrorState message={error} onRetry={load} /></div>
      ) : items.length === 0 ? (
        <div className="card">
          <NoResults onClear={hasFilter ? () => { setModule(''); setAction(''); setDate(''); } : undefined} />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>User</th>
                <th>Aksi</th>
                <th>Modul</th>
                <th>Deskripsi</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td className="text-[12.5px] text-muted whitespace-nowrap">{formatDateTime(l.createdAt)}</td>
                  <td>
                    {l.user ? (
                      <span className="flex items-center gap-2">
                        <Avatar name={l.user.name} size={28} />
                        <span className="text-[13px] font-medium text-ink">{l.user.name}</span>
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted">Sistem</span>
                    )}
                  </td>
                  <td>
                    <Badge tone="blue">{l.action.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="text-[13px] text-muted">{l.module}</td>
                  <td className="text-[13px] text-ink max-w-[380px]">{l.description ?? '-'}</td>
                  <td className="text-[12.5px] text-muted">{l.ipAddress ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
