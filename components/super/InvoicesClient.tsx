'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, Badge } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { Search, Receipt } from 'lucide-react';
import { formatIDR } from '@/lib/modular';

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = {
  PAID: 'green',
  PENDING: 'amber',
  OVERDUE: 'red',
  CANCELLED: 'gray',
};

const STATUS_LABEL: Record<string, string> = {
  PAID: 'Lunas',
  PENDING: 'Menunggu Pembayaran',
  OVERDUE: 'Jatuh Tempo',
  CANCELLED: 'Dibatalkan',
};

export function InvoicesClient() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    const r = await fetch(`/api/super/invoices?${params.toString()}`);
    const j = await r.json();
    if (j.success) setItems(j.data);
    else toast.error(j.message || 'Gagal memuat invoice.');
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Invoice</h1>
        <p className="text-sm text-muted">Seluruh tagihan langganan kantor. Tandai lunas setelah pembayaran diterima.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor / nama kantor…" className="!pl-9" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
          <option value="">Semua status</option>
          <option value="PENDING">Menunggu Pembayaran</option>
          <option value="PAID">Lunas</option>
          <option value="CANCELLED">Dibatalkan</option>
        </select>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-muted">
                <th className="px-4 py-3 font-semibold">Invoice</th>
                <th className="px-4 py-3 font-semibold">Kantor</th>
                <th className="px-4 py-3 font-semibold">Periode</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => (
                <tr key={inv.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                  <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                    <Link href={`/admin/invoices/${inv.id}`} className="hover:text-brand">{inv.number}</Link>
                    <span className="block text-[12px] text-muted font-normal">
                      {new Date(inv.createdAt).toLocaleDateString('id-ID')} · {inv.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{inv.organizationName}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {new Date(inv.periodStart).toLocaleDateString('id-ID')} – {new Date(inv.periodEnd).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink whitespace-nowrap">{formatIDR(inv.total)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={inv.isOverdue ? 'red' : STATUS_TONE[inv.status] ?? 'gray'}>
                      {inv.isOverdue ? 'Jatuh Tempo' : STATUS_LABEL[inv.status] ?? inv.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/invoices/${inv.id}`} className="btn-ghost !py-1.5 !px-3 text-[12px]">Detail</Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    <Receipt className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    Belum ada invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
