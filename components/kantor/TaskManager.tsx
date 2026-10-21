'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, X, RotateCcw, Terminal } from 'lucide-react';
import { TASK_STATUS_META, friendlyFetchError, timeAgo } from './meta';
import { cn } from '@/lib/utils';

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  progress: number;
  errorMessage: string | null;
  resultPayload: string | null;
  createdAt: string;
  updatedAt: string;
  agent: { id: string; name: string; avatarColor: string } | null;
  inputPayload: string;
  latestEvent: { eventType: string; message: string; createdAt: string } | null;
}

export function TaskManager({ tasks, onRefresh }: { tasks: AgentTask[]; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState('');

  async function openDetail(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    try {
      const r = await fetch(`/api/agent-tasks/${id}`);
      const j = await r.json();
      if (j.success) setDetail(j.data);
    } catch {}
  }

  async function act(id: string, action: 'cancel' | 'retry') {
    setBusy(id + action);
    try {
      const r = await fetch(`/api/agent-tasks/${id}/${action}`, { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(action === 'cancel' ? 'Tugas dibatalkan.' : 'Tugas diulang.');
      onRefresh();
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal.'));
    } finally {
      setBusy('');
    }
  }

  function resultSummary(t: AgentTask) {
    try {
      const p = JSON.parse(t.resultPayload || '{}');
      return p.summary || '';
    } catch {
      return '';
    }
  }

  return (
    <div className="card p-4 sm:p-5">
      <h3 className="text-[14px] font-semibold text-ink mb-3">
        Manajer Tugas {tasks.length > 0 && <span className="text-muted font-normal">({tasks.length})</span>}
      </h3>
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {tasks.length === 0 && (
          <p className="text-[13px] text-muted py-4 text-center">
            Belum ada tugas. Beri perintah lewat Pusat Perintah di atas.
          </p>
        )}
        {tasks.map((t) => {
          const meta = TASK_STATUS_META[t.status] ?? TASK_STATUS_META.QUEUED;
          const active = ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(t.status);
          const retryable = ['FAILED', 'CANCELLED'].includes(t.status);
          return (
            <div key={t.id} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                {t.agent && (
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-[10px] font-bold"
                    style={{ backgroundColor: t.agent.avatarColor }}
                    title={t.agent.name}
                  >
                    {t.agent.name.charAt(0)}
                  </span>
                )}
                <button onClick={() => openDetail(t.id)} className="flex-1 min-w-0 text-left">
                  <span className="block truncate text-[13px] font-semibold text-ink">{t.title}</span>
                  <span className="text-[11px] text-muted">{timeAgo(t.createdAt)} · {t.priority}</span>
                </button>
                <span className={cn('badge !text-[10.5px] shrink-0', meta.cls)}>{meta.label}</span>
                <button onClick={() => openDetail(t.id)} className="btn-ghost !px-1.5 !py-1" aria-label="Detail">
                  <ChevronDown className={cn('h-4 w-4 transition-transform', expanded === t.id && 'rotate-180')} />
                </button>
              </div>
              {(t.status === 'RUNNING' || t.status === 'QUEUED') && (
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-500"
                    style={{ width: `${t.progress}%` }}
                  />
                </div>
              )}
              {expanded === t.id && (
                <div className="mt-2.5 border-t border-line pt-2.5 space-y-2">
                  {t.description && <p className="text-[12.5px] text-muted">{t.description}</p>}
                  {resultSummary(t) && (
                    <p className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-[12.5px] text-ink">
                      {resultSummary(t)}
                    </p>
                  )}
                  {t.errorMessage && (
                    <p className="text-[12.5px] text-red-600">Error: {t.errorMessage}</p>
                  )}
                  {detail?.id === t.id && detail.events?.length > 0 && (
                    <div className="rounded-lg bg-slate-950 px-3 py-2.5 max-h-36 overflow-y-auto">
                      {detail.events.map((e: any) => (
                        <p key={e.id} className="text-[11.5px] font-mono text-slate-300 flex gap-2">
                          <Terminal className="h-3 w-3 mt-0.5 shrink-0 text-slate-500" />
                          <span><span className="text-slate-500">[{e.eventType}]</span> {e.message}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    {active && (
                      <button
                        onClick={() => act(t.id, 'cancel')}
                        disabled={busy === t.id + 'cancel'}
                        className="btn-secondary !py-1.5 !px-3 text-[12px] inline-flex items-center gap-1"
                      >
                        <X className="h-3.5 w-3.5" /> Hentikan
                      </button>
                    )}
                    {retryable && (
                      <button
                        onClick={() => act(t.id, 'retry')}
                        disabled={busy === t.id + 'retry'}
                        className="btn-secondary !py-1.5 !px-3 text-[12px] inline-flex items-center gap-1"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Ulangi
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
