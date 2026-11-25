'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Banner status langganan di dashboard (Fase 4 §7).
 * Memanggil GET /api/tenant/subscription/status; tampil hanya bila lifecycle
 * DITANGGUHKAN (oranye), MENUNGGAK (kuning), atau NONAKTIF (abu + tautan
 * ke /langganan). AKTIF/TRIAL → tidak tampil apa-apa. Bukan pengguna tenant
 * (API 404) → tidak tampil apa-apa.
 */
interface StatusData {
  lifecycleStatus: string;
  lifecycleReason?: string | null;
}

export function SubscriptionBanner() {
  const [data, setData] = useState<StatusData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/tenant/subscription/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.success && j.data) setData(j.data as StatusData);
      })
      .catch(() => {
        /* abaikan — banner memang tidak tampil bila status tak bisa dibaca */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;

  if (data.lifecycleStatus === 'DITANGGUHKAN') {
    return (
      <div className="rounded-btn border border-amber-300 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
        <b>Langganan ditangguhkan</b>
        {data.lifecycleReason ? <> — {data.lifecycleReason}</> : null}. Hubungi Administrator Pusat.
      </div>
    );
  }

  if (data.lifecycleStatus === 'MENUNGGAK') {
    return (
      <div className="rounded-btn border border-yellow-300 bg-yellow-50 px-4 py-3 text-[13.5px] text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-100">
        <b>Langganan menunggak</b>
        {data.lifecycleReason ? <> — {data.lifecycleReason}</> : null}. Segera hubungi Administrator Pusat agar akses tidak ditangguhkan.
      </div>
    );
  }

  if (data.lifecycleStatus === 'NONAKTIF') {
    return (
      <div className="rounded-btn border border-line bg-canvas px-4 py-3 text-[13.5px] text-ink">
        <b>Langganan sudah tidak aktif</b>
        {data.lifecycleReason ? <> — {data.lifecycleReason}</> : null}.{' '}
        <Link href="/langganan" className="font-semibold text-brand hover:underline">
          Lihat status langganan &amp; unduh data Anda
        </Link>
        .
      </div>
    );
  }

  return null;
}
