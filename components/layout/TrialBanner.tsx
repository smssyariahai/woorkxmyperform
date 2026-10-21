'use client';

import Link from 'next/link';
import { Clock, Lock, ArrowRight } from 'lucide-react';
import type { TrialStatus } from '@/lib/trial';

/** Banner status trial: sisa hari / sudah habis (read-only). */
export function TrialBanner({ trial }: { trial: TrialStatus }) {
  if (!trial.isTrial && !trial.trialExpired) return null;

  if (trial.trialExpired) {
    return (
      <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-center gap-3 text-[13px]">
        <Lock className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          Masa trial 14 hari telah berakhir — akun dalam mode baca-saja.
        </span>
        <Link
          href="/upgrade"
          className="inline-flex items-center gap-1 font-bold underline underline-offset-2 hover:opacity-90"
        >
          Upgrade sekarang <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-3 text-[13px]">
      <Clock className="h-4 w-4 shrink-0" />
      <span className="font-medium">
        Paket Trial — tersisa {trial.daysLeft} hari. Fitur dibatasi.
      </span>
      <Link
        href="/upgrade"
        className="inline-flex items-center gap-1 font-bold underline underline-offset-2 hover:opacity-90"
      >
        Upgrade <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
