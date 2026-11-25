// Prioritas Saya — 5 kelompok tugas (hanya pengelompokan tampilan).
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PriorityGroup } from './types';

export function Priorities({ groups, loading }: { groups: PriorityGroup[]; loading: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    mustDoToday: true,
    overdue: true,
  });
  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <h2 className="text-[15px] font-semibold text-ink">Prioritas Saya</h2>
      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {groups.map((g) => {
            const isOpen = open[g.key] ?? false;
            return (
              <div key={g.key} className="rounded-btn border border-line">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span>
                    <span className="text-[13px] font-semibold text-ink">{g.label}</span>
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted dark:bg-slate-800">
                      {g.tasks.length}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted">{g.reason}</span>
                  </span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <ul className="border-t border-line px-3 py-2">
                    {g.tasks.length === 0 ? (
                      <li className="py-2 text-[12px] text-muted">Tidak ada tugas di kelompok ini.</li>
                    ) : (
                      g.tasks.slice(0, 8).map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] text-ink">{t.title}</span>
                            <span className="text-[11px] text-muted">
                              {t.priorityLabel} · {t.statusLabel}
                              {t.taskDate ? ` · ${t.taskDate}` : ''}
                            </span>
                          </span>
                          <Link href="/tal/tasks" className="shrink-0 text-[12px] font-semibold text-brand hover:underline">
                            Buka
                          </Link>
                        </li>
                      ))
                    )}
                    {g.tasks.length > 8 && (
                      <li className="py-1 text-[12px] text-muted">
                        +{g.tasks.length - 8} tugas lainnya — lihat di{' '}
                        <Link href="/tal/tasks" className="font-semibold text-brand hover:underline">TAL</Link>.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
