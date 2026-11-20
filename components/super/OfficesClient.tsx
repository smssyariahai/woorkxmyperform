'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, Badge } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { Plus, Search, Power, Globe2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfficesClient() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const r = await fetch(`/api/super/offices?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    if (j.success) setItems(j.data);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggleActive(o: any) {
    if (!confirm(`${o.isActive ? 'Nonaktifkan' : 'Aktifkan'} kantor "${o.name}"?`)) return;
    try {
      const r = await fetch(`/api/super/offices/${o.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !o.isActive }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Kantor "${o.name}" ${o.isActive ? 'dinonaktifkan' : 'diaktifkan'}.`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status.');
    }
  }

  async function deleteOffice(o: any) {
    if (!confirm(`HAPUS PERMANEN kantor "${o.name}"?\n\nSemua data (pengguna, pelanggan, percakapan, broadcast, dll) akan hilang dan tidak bisa dikembalikan.`)) return;
    const sure = prompt(`Ketik HAPUS untuk mengonfirmasi penghapusan "${o.name}":`);
    if (sure !== 'HAPUS') { toast.info('Penghapusan dibatalkan.'); return; }
    try {
      const r = await fetch(`/api/super/offices/${o.id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Kantor "${o.name}" dihapus permanen.`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus kantor.');
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Kantor</h1>
          <p className="text-sm text-muted">Kelola seluruh kantor Woork.id beserta adminnya.</p>
        </div>
        <Link href="/admin/offices/new" className="btn-primary !py-2 text-[13px]">
          <Plus className="h-4 w-4" /> Buat Kantor
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kantor…" className="!pl-9" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((o) => (
          <Card key={o.id} className="!p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn bg-brand-900 text-white text-[16px] font-bold">
                  {o.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <Link href={`/admin/offices/${o.id}`} className="block truncate text-[15px] font-bold text-ink hover:text-brand">
                    {o.name}
                  </Link>
                  <p className="text-[12px] text-muted truncate">
                    {o.owners.map((x: any) => x.name).join(', ') || 'Tanpa admin'}
                  </p>
                </div>
              </div>
              <Badge tone={o.isActive ? 'green' : 'gray'}>{o.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
            </div>
            {o.siteUrl && (
              <a
                href={o.siteUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline"
              >
                <Globe2 className="h-3.5 w-3.5" /> {o.siteUrl.replace('https://', '')}
              </a>
            )}
            {o.subscription && (
              <p className="mt-2 text-[12px] text-muted">
                Langganan{' '}
                <b className={o.subscription.status === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600'}>
                  {o.subscription.status === 'ACTIVE' ? 'Aktif' : o.subscription.status === 'PENDING_PAYMENT' ? 'Menunggu Pembayaran' : o.subscription.status}
                </b>
                {' · '}
                {o.subscription.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'} · kuota {o.subscription.userQuota} user
                {o.subscription.endDate ? ` · s.d. ${new Date(o.subscription.endDate).toLocaleDateString('id-ID')}` : ''}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted">
              <span>{o.userCount} pengguna · {o.customerCount} pelanggan</span>
              <span className="inline-flex gap-1">
                <Link href={`/admin/offices/${o.id}`} className="btn-ghost !py-1.5 !px-3 text-[12px]">
                  Kelola
                </Link>
                <button
                  onClick={() => deleteOffice(o)}
                  title="Hapus permanen"
                  className="inline-flex items-center justify-center rounded-btn p-2 text-muted transition-colors hover:bg-red-50 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => toggleActive(o)}
                  title={o.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  className={cn(
                    'inline-flex items-center justify-center rounded-btn p-2 transition-colors',
                    o.isActive ? 'text-muted hover:bg-red-50 hover:text-danger' : 'text-muted hover:bg-emerald-50 hover:text-emerald-600'
                  )}
                >
                  <Power className="h-4 w-4" />
                </button>
              </span>
            </div>
          </Card>
        ))}
      </div>
      {items.length === 0 && (
        <Card><p className="text-sm text-muted text-center py-8">Belum ada kantor. Buat kantor pertama di atas.</p></Card>
      )}

    </div>
  );
}
