// Riwayat meeting — filter semua / selesai / dibatalkan, klik ke detail.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { MeetingCard } from '@/components/meet/MeetingCard';
import { listMeetings, type MeetingItem } from '@/components/meet/client';

type HistoryFilter = 'semua' | 'selesai' | 'dibatalkan';

const FILTER_TABS: Array<{ key: HistoryFilter; label: string }> = [
  { key: 'semua', label: 'Semua' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'dibatalkan', label: 'Dibatalkan' },
];

export default function MeetHistoryPage() {
  const [items, setItems] = useState<MeetingItem[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('semua');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await listMeetings({ filter: 'history' });
      setItems(r.meetings);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memuat riwayat meeting.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((m) => {
    if (filter === 'selesai') return m.status === 'COMPLETED';
    if (filter === 'dibatalkan') return m.status === 'CANCELLED';
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-white">
          <History size={22} />
        </span>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Riwayat Meeting</h1>
          <p className="text-xs text-slate-500">Meeting yang sudah selesai atau dibatalkan.</p>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={
                filter === t.key
                  ? 'rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-white'
                  : 'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300'
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<History className="h-7 w-7" />}
            title="Belum ada riwayat meeting"
            description={
              filter === 'semua'
                ? 'Belum ada meeting yang selesai atau dibatalkan.'
                : filter === 'selesai'
                  ? 'Belum ada meeting yang selesai.'
                  : 'Belum ada meeting yang dibatalkan.'
            }
          />
        ) : (
          <div className="mt-4 space-y-2">
            {filtered.map((m) => (
              <MeetingCard key={m.id} meeting={m} showJoin={false} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
