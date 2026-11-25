// Kartu ringkasan Daily Workspace — klik menuju modul sumber.
'use client';

import Link from 'next/link';
import {
  ListChecks, CheckCircle2, Video, AlertTriangle, CalendarDays, ClipboardCheck,
} from 'lucide-react';
import type { OverviewCard } from './types';

const ICONS: Record<string, typeof ListChecks> = {
  myTasks: ListChecks,
  completedTasks: CheckCircle2,
  upcomingMeetings: Video,
  overdueTasks: AlertTriangle,
  todaysEvents: CalendarDays,
  pendingApprovals: ClipboardCheck,
};

export function OverviewCards({ cards }: { cards: OverviewCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => {
        const Icon = ICONS[c.key] ?? ListChecks;
        return (
          <Link
            key={c.key}
            href={c.href}
            className="rounded-btn border border-line bg-white p-4 transition-colors hover:border-brand hover:bg-brand-50/50 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted">{c.label}</span>
              <Icon className="h-4 w-4 text-brand" />
            </div>
            <p className="mt-2 text-[28px] font-bold leading-none text-ink">{c.value}</p>
          </Link>
        );
      })}
    </div>
  );
}
