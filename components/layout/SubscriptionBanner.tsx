'use client';

import Link from 'next/link';
import { AlertTriangle, Clock } from 'lucide-react';

export interface SubscriptionNotice {
  status: string;
  endDate: string | null;
  daysLeft: number | null;
}

/** Banner langganan (menggantikan banner trial untuk model modular). */
export function SubscriptionBanner({ notice }: { notice: SubscriptionNotice }) {
  if (notice.status === 'ACTIVE') return null;
  const isPending = notice.status === 'PENDING_PAYMENT';
  const isExpired = notice.status === 'EXPIRED';
  return (
    <div
      className={
        isPending
          ? 'bg-amber-50 border-b border-amber-200 text-amber-900'
          : 'bg-red-50 border-b border-red-200 text-red-800'
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center text-[13px]">
        {isPending ? <Clock className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        <span>
          {isPending
            ? 'Langganan kantor ini menunggu pembayaran — admin kantor belum bisa login dan fitur tulis terkunci.'
            : isExpired
              ? 'Masa langganan kantor telah berakhir — fitur tulis terkunci, hanya baca yang bisa dibuka.'
              : 'Langganan kantor ini tidak aktif — hubungi Administrator Pusat.'}
        </span>
        <Link href="/upgrade" className="font-semibold underline underline-offset-2 hover:opacity-80">
          Lihat Langganan & Tagihan
        </Link>
      </div>
    </div>
  );
}
