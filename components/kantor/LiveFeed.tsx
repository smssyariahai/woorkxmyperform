'use client';

import { Activity } from 'lucide-react';
import { timeAgo, TASK_STATUS_META } from './meta';
import type { AgentTask } from './TaskManager';

/** Strip aktivitas live: siapa sedang mengerjakan apa, terurut dari yang terbaru. */
export function LiveFeed({ tasks }: { tasks: AgentTask[] }) {
  const items = [...tasks]
    .sort((a, b) => {
      const ta = a.latestEvent?.createdAt || a.updatedAt || a.createdAt;
      const tb = b.latestEvent?.createdAt || b.updatedAt || b.createdAt;
      return +new Date(tb) - +new Date(ta);
    })
    .slice(0, 4);

  return (
    <div className="card !py-3">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <h3 className="text-[12.5px] font-bold text-ink flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-muted" /> Aktivitas live
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted px-1">Belum ada aktivitas. Beri perintah lewat Pusat Perintah di bawah.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t) => {
            const msg = t.latestEvent?.message?.trim()
              || `${TASK_STATUS_META[t.status]?.label ?? t.status}: ${t.title}`;
            const when = t.latestEvent?.createdAt || t.updatedAt || t.createdAt;
            const active = ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(t.status);
            return (
              <li key={t.id} className="flex items-start gap-2 px-1 text-[12px] leading-snug">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: t.agent?.avatarColor || '#94a3b8' }}
                  title={t.agent?.name}
                />
                <p className="min-w-0 flex-1 text-ink">
                  <span className="font-semibold">{t.agent?.name ?? 'Agent'}</span>
                  <span className="text-muted"> — </span>
                  <span className={active ? 'font-medium' : 'text-muted'}>{msg}</span>
                </p>
                <span className="shrink-0 text-[10.5px] text-muted">{timeAgo(when)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
