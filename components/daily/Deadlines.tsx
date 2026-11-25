// Deadline Mendekat — tugas + jatuh tempo invoice (tanpa nominal).
'use client';

import Link from 'next/link';
import { Clock, FileText, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeadlineItem } from './types';

const SEVERITY_STYLE: Record<string, string> = {
  normal: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  approaching: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const SEVERITY_LABEL: Record<string, string> = {
  normal: 'Normal',
  approaching: 'Mendekat',
  critical: 'Kritis',
  overdue: 'Terlambat',
};

export function Deadlines({
  items,
  loading,
  days,
  onDaysChange,
}: {
  items: DeadlineItem[];
  loading: boolean;
  days: number;
  onDaysChange: (d: number) => void;
}) {
  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Deadline Mendekat</h2>
        <div className="flex gap-1">
          {[3, 7].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDaysChange(d)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
                days === d
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 text-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
              )}
            >
              {d} hari
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Tidak ada deadline dalam {days} hari ke depan.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((it) => (
            <li key={`${it.kind}-${it.id}`} className="flex items-start gap-3 rounded-btn border border-line p-3">
              <span className="mt-0.5 shrink-0 text-muted">
                {it.kind === 'invoice' ? <FileText className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{it.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {it.deadline} · {it.timeLeftLabel}
                  </span>
                  <span>{it.statusLabel}</span>
                  {it.priorityLabel !== '—' && <span>Prioritas: {it.priorityLabel}</span>}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  SEVERITY_STYLE[it.severity]
                )}
              >
                {SEVERITY_LABEL[it.severity]}
              </span>
              {it.sourceUrl && (
                <Link
                  href={it.sourceUrl}
                  className="shrink-0 rounded-btn p-1.5 text-[12px] font-semibold text-brand hover:underline"
                  title="Buka di modul sumber"
                >
                  Buka
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
