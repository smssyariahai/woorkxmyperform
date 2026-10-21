'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Avatar, Badge, CardTitle } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { ArrowLeft, Plus } from 'lucide-react';

interface Lead {
  id: string;
  value: number | null;
  score: string | null;
  updatedAt: string;
  customer: { id: string; name: string; company: string | null; phone: string | null };
  owner: { id: string; name: string } | null;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  leads: Lead[];
}

function money(v: number | null) {
  if (!v) return null;
  return 'Rp ' + v.toLocaleString('id-ID');
}

export function KanbanClient() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/leads');
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setStages(j.data);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat kanban.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function moveLead(leadId: string, stageId: string) {
    // optimistic update
    const prev = stages;
    setStages((ss) => {
      let moved: Lead | null = null;
      const next = ss.map((s) => {
        const found = s.leads.find((l) => l.id === leadId);
        if (found) moved = found;
        return { ...s, leads: s.leads.filter((l) => l.id !== leadId) };
      });
      if (!moved) return ss;
      return next.map((s) => (s.id === stageId ? { ...s, leads: [moved!, ...s.leads] } : s));
    });
    try {
      const r = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Stage lead diperbarui.');
    } catch (e: any) {
      setStages(prev);
      toast.error(e.message || 'Gagal memindahkan lead.');
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <Link href="/crm" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-brand mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke CRM
          </Link>
          <h1 className="text-[22px] font-bold text-ink">Kanban Lead</h1>
          <p className="text-sm text-muted">Seret kartu antar tahap untuk mengubah stage.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-[280px] shrink-0 space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card"><ErrorState message={error} onRetry={load} /></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {stages.map((s) => (
            <div
              key={s.id}
              className={cn(
                'w-[280px] shrink-0 rounded-card bg-slate-100/80 dark:bg-slate-800/50 border border-line/60 p-3 min-h-[300px] transition-colors',
                dragId && 'border-dashed'
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) moveLead(dragId, s.id);
                setDragId(null);
              }}
            >
              <div className="flex items-center gap-2 px-1 pb-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <CardTitle className="!text-[13px]">{s.name}</CardTitle>
                <Badge tone="gray" className="ml-auto">{s.leads.length}</Badge>
              </div>
              <div className="space-y-2.5">
                {s.leads.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      'card !p-3.5 cursor-grab active:cursor-grabbing hover:shadow-pop transition-shadow',
                      dragId === l.id && 'opacity-50'
                    )}
                  >
                    <Link href={`/crm/customers/${l.customer.id}`} className="flex items-center gap-2.5">
                      <Avatar name={l.customer.name} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-ink hover:text-brand">
                          {l.customer.name}
                        </span>
                        {l.customer.company && (
                          <span className="block truncate text-[12px] text-muted">{l.customer.company}</span>
                        )}
                      </span>
                    </Link>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                      {money(l.value) && <Badge tone="green">{money(l.value)}</Badge>}
                      {l.owner && <span>· {l.owner.name}</span>}
                    </div>
                  </div>
                ))}
                {s.leads.length === 0 && (
                  <p className="text-center text-[12px] text-muted/70 py-6 border border-dashed border-line rounded-xl">
                    Seret ke sini
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && stages.every((s) => s.leads.length === 0) && (
        <div className="card mt-2">
          <EmptyState
            title="Belum ada lead"
            description="Buat lead dari halaman pelanggan untuk mulai mengisi pipeline."
            action={
              <Link href="/crm" className="btn-primary inline-flex">
                <Plus className="h-4 w-4" /> Ke Daftar Pelanggan
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
