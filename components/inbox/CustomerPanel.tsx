'use client';

import { useEffect, useState } from 'react';
import { Avatar, Badge, CardTitle } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/states';
import { maskPhone, timeAgo } from '@/lib/utils';
import { channelMeta } from './channel-meta';
import { Plus } from 'lucide-react';

interface PanelData {
  customer: {
    id: string;
    name: string;
    phone: string | null;
    business: string | null;
    interest: string | null;
    budget: string | null;
    stage: string;
    score: string | null;
    nextFollowUp: string | null;
    lastPurchase: string | null;
    tags: Array<{ id: string; name: string; color: string }>;
  };
  channelType: string;
}

export function CustomerPanel({ conversationId }: { conversationId: string }) {
  const [data, setData] = useState<PanelData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/conversations/${conversationId}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.success) setData({ customer: j.data.customer, channelType: j.data.channelType });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [conversationId]);

  if (!data) {
    return (
      <div className="p-5 space-y-4">
        <Skeleton className="h-16 w-16 !rounded-full mx-auto" />
        <Skeleton className="h-4 w-2/3 mx-auto" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const c = data.customer;
  const meta = channelMeta(data.channelType);
  const kv: Array<[string, string]> = [
    ['Usaha', c.business ?? '-'],
    ['Minat', c.interest ?? '-'],
    ['Anggaran', c.budget ?? '-'],
    ['Tahap', c.stage],
    ['Follow up', c.nextFollowUp ? timeAgo(c.nextFollowUp) : '-'],
  ];

  return (
    <div className="p-5 space-y-5">
      <div className="flex flex-col items-center text-center">
        <Avatar name={c.name} size={64} />
        <h3 className="mt-3 text-[15px] font-bold text-ink">{c.name}</h3>
        <p className="text-[12.5px] text-muted">{maskPhone(c.phone)}</p>
        <Badge tone="blue" className="mt-2">{meta.label}</Badge>
      </div>

      <section>
        <CardTitle className="!text-[13px] mb-2.5">Dicatat Woo dari percakapan</CardTitle>
        <dl className="grid grid-cols-[86px_1fr] gap-y-2 text-[12.5px]">
          {kv.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2.5">
          <CardTitle className="!text-[13px]">Label</CardTitle>
          <button className="text-muted hover:text-brand" aria-label="Tambah label" title="Tambah label">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(c.tags ?? []).length === 0 && <span className="text-[12px] text-muted">Belum ada label.</span>}
          {(c.tags ?? []).map((t) => (
            <Badge key={t.id} tone="blue">{t.name}</Badge>
          ))}
          {c.score && <Badge tone={c.score === 'Tinggi' ? 'green' : 'amber'}>Skor {c.score}</Badge>}
        </div>
      </section>

      <section>
        <CardTitle className="!text-[13px] mb-2">Riwayat pembelian</CardTitle>
        <p className="text-[12.5px] text-muted">{c.lastPurchase ?? 'Belum ada'}</p>
      </section>

      <section className="rounded-card bg-brand-50 dark:bg-brand-900/25 p-4">
        <p className="text-[13px] font-semibold text-ink mb-1">Saran Woo</p>
        <p className="text-[12.5px] text-muted leading-relaxed">
          Lanjutkan sesuai jadwal. Tidak perlu campur tangan tim.
        </p>
      </section>
    </div>
  );
}
