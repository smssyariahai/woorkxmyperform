'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

export function RenewButton({ disabled, reason }: { disabled?: boolean; reason?: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function renew() {
    if (!confirm('Buat invoice perpanjangan untuk periode berikutnya?')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/billing/renew', { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Invoice perpanjangan ${j.data.invoice.number} dibuat. Silakan lakukan pembayaran.`);
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || 'Gagal membuat invoice perpanjangan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={renew} disabled={disabled || busy} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
        <RefreshCw className="h-4 w-4" /> {busy ? 'Membuat…' : 'Perpanjang Langganan'}
      </button>
      {reason && <p className="mt-1.5 text-[12px] text-muted">{reason}</p>}
    </div>
  );
}
