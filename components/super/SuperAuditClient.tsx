'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, CardTitle } from '@/components/ui/primitives';
import { SearchInput, Pagination } from '@/components/ui/search';
import { Skeleton } from '@/components/ui/states';
import { formatDateTime } from '@/lib/utils';
import { ShieldCheck } from 'lucide-react';

interface Log {
  id: string;
  action: string;
  module: string;
  description: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
  organization: { name: string };
}

export function SuperAuditClient() {
  const [items, setItems] = useState<Log[]>([]);
  const [offices, setOffices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), perPage: '20' });
      if (q.trim()) params.set('q', q.trim());
      if (officeId) params.set('organizationId', officeId);
      const r = await fetch(`/api/super/audit?${params}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setItems(j.data.items);
      setTotalPages(j.data.totalPages);
      setOffices(j.data.offices);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, q, officeId]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-brand" /> Audit Global
        </h1>
        <p className="text-sm text-muted">Seluruh aktivitas penting di semua kantor. Log bersifat immutable.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-64">
          <SearchInput value={q} onChange={setQ} placeholder="Cari aksi / deskripsi…" />
        </div>
        <select
          value={officeId}
          onChange={(e) => { setOfficeId(e.target.value); setPage(1); }}
          className="input !w-auto"
        >
          <option value="">Semua kantor</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted text-center py-10">Tidak ada aktivitas tercatat.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Waktu</th><th>Kantor</th><th>Pelaku</th><th>Aksi</th><th>Deskripsi</th></tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(l.createdAt)}</td>
                  <td className="font-medium">{l.organization.name}</td>
                  <td className="text-muted">{l.user ? `${l.user.name}` : 'Sistem'}</td>
                  <td><Badge tone="blue">{l.action}</Badge></td>
                  <td className="text-muted max-w-md">{l.description ?? '—'}</td>
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
