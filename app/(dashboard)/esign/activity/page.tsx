import { Suspense } from 'react';
import { EsignActivity } from '@/components/esign/EsignActivity';

export const metadata = { title: 'Riwayat Aktivitas E-Sign — WOORK' };

export default function EsignActivityPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-[13px] text-muted">Memuat riwayat…</p>}>
      <EsignActivity />
    </Suspense>
  );
}
