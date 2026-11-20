'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, Badge } from '@/components/ui/primitives';
import { ArrowLeft, CheckCircle2, Receipt } from 'lucide-react';
import { formatIDR } from '@/lib/modular';

export function InvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const [inv, setInv] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [paidNote, setPaidNote] = useState('');

  const load = useCallback(async () => {
    const r = await fetch(`/api/super/invoices/${invoiceId}`);
    const j = await r.json();
    if (j.success) setInv(j.data);
    else toast.error(j.message || 'Gagal memuat invoice.');
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function pay() {
    if (!confirm(`Tandai invoice ${inv.number} sebagai LUNAS?\n\nLangganan kantor "${inv.organizationName}" akan diaktifkan untuk periode ${new Date(inv.periodStart).toLocaleDateString('id-ID')} – ${new Date(inv.periodEnd).toLocaleDateString('id-ID')}.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/super/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidNote: paidNote.trim() || undefined }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Invoice ditandai lunas. Langganan kantor diaktifkan.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menandai lunas.');
    } finally {
      setBusy(false);
    }
  }

  if (!inv) {
    return (
      <div className="max-w-[720px] mx-auto">
        <Card><p className="text-sm text-muted text-center py-8">Memuat invoice…</p></Card>
      </div>
    );
  }

  const isPaid = inv.status === 'PAID';
  const isOverdue = inv.isOverdue;

  return (
    <div className="max-w-[720px] mx-auto space-y-5">
      <Link href="/admin/invoices" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Invoice
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink flex items-center gap-2">
            <Receipt className="h-5 w-5 text-muted" /> {inv.number}
          </h1>
          <p className="text-sm text-muted">
            {inv.organizationName} · {inv.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'} · dibuat{' '}
            {new Date(inv.createdAt).toLocaleDateString('id-ID')}
          </p>
        </div>
        <Badge tone={isPaid ? 'green' : isOverdue ? 'red' : 'amber'}>
          {isPaid ? 'Lunas' : isOverdue ? 'Jatuh Tempo' : 'Menunggu Pembayaran'}
        </Badge>
      </div>

      <Card className="!p-6 space-y-4">
        <div className="space-y-1.5 text-[13.5px]">
          <p className="flex justify-between"><span className="text-muted">Periode langganan</span><b>{new Date(inv.periodStart).toLocaleDateString('id-ID')} – {new Date(inv.periodEnd).toLocaleDateString('id-ID')}</b></p>
          <p className="flex justify-between"><span className="text-muted">Jatuh tempo</span><b>{new Date(inv.dueDate).toLocaleDateString('id-ID')}</b></p>
          {inv.paidAt && (
            <p className="flex justify-between"><span className="text-muted">Dibayar</span><b>{new Date(inv.paidAt).toLocaleDateString('id-ID')}</b></p>
          )}
          {inv.paidNote && (
            <p className="flex justify-between"><span className="text-muted">Catatan pembayaran</span><b>{inv.paidNote}</b></p>
          )}
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-[13px] font-semibold text-ink mb-2">Rincian</p>
          <div className="space-y-1.5 text-[13.5px]">
            {(inv.items ?? []).map((it: any) => (
              <p key={it.id} className="flex justify-between gap-3">
                <span className="text-muted">{it.description}</span>
                <b className="whitespace-nowrap">{formatIDR(it.amount)}</b>
              </p>
            ))}
            <p className="flex justify-between border-t border-line pt-2 text-[15px]">
              <span className="font-semibold">Total</span>
              <b className="text-brand">{formatIDR(inv.total)}</b>
            </p>
          </div>
        </div>

        {!isPaid && inv.status !== 'CANCELLED' && (
          <div className="border-t border-line pt-4 space-y-3">
            <label className="block">
              <span className="text-[13px] font-medium text-ink">Catatan pembayaran (opsional)</span>
              <input
                value={paidNote}
                onChange={(e) => setPaidNote(e.target.value)}
                placeholder="mis. Transfer BCA 12 Nov, a.n. …"
                className="input w-full mt-1"
              />
            </label>
            <button onClick={pay} disabled={busy} className="btn-primary !py-2.5 text-[13.5px] w-full">
              <CheckCircle2 className="h-4 w-4" /> {busy ? 'Menyimpan…' : 'Tandai Lunas & Aktifkan Langganan'}
            </button>
            <p className="text-[12px] text-muted text-center">
              Pastikan pembayaran sudah diterima sebelum menandai lunas. Admin kantor baru bisa login setelah ini.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
