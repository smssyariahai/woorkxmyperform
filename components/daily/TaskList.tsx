// Tugas Saya Hari Ini — daftar TalTask + aksi ubah status (lewat API daily).
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyTask } from './types';

const PRIORITY_STYLE: Record<string, string> = {
  Urgent: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  High: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  Medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'on_progress', label: 'In Progress' },
  { value: 'pending', label: 'Waiting' },
  { value: 'done', label: 'Completed' },
];

export function TaskList({
  tasks,
  loading,
  filter,
  onFilterChange,
  onStatusChange,
  changingId,
}: {
  tasks: DailyTask[];
  loading: boolean;
  filter: string;
  onFilterChange: (f: string) => void;
  onStatusChange: (task: DailyTask, status: string, blockerCategory?: string) => void;
  changingId: string | null;
}) {
  const [blockerFor, setBlockerFor] = useState<string | null>(null);
  const [blockerText, setBlockerText] = useState('');

  const handleStatus = (task: DailyTask, status: string) => {
    if (status === 'pending') {
      setBlockerFor(task.id);
      setBlockerText(task.blockerCategory ?? '');
      return;
    }
    onStatusChange(task, status);
  };

  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Tugas Saya</h2>
        <div className="flex gap-1">
          {[
            { value: 'today', label: 'Hari Ini' },
            { value: 'overdue', label: 'Terlambat' },
            { value: 'upcoming', label: 'Mendatang' },
            { value: 'all', label: 'Semua' },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onFilterChange(f.value)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
                filter === f.value
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 text-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          {filter === 'today'
            ? 'Tidak ada tugas untuk hari ini. Nikmati harimu!'
            : 'Tidak ada tugas pada filter ini.'}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {tasks.map((t) => (
            <li key={t.id} className="py-3 first:pt-1 last:pb-1">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={changingId === t.id || t.status === 'done'}
                  onClick={() => onStatusChange(t, 'done')}
                  title={t.status === 'done' ? 'Sudah selesai' : 'Tandai selesai'}
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    t.status === 'done'
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-line hover:border-emerald-500 hover:text-emerald-500'
                  )}
                >
                  {t.status === 'done' && <Check className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[13px] font-medium text-ink', t.status === 'done' && 'line-through opacity-60')}>
                    {t.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        PRIORITY_STYLE[t.priorityLabel] ?? PRIORITY_STYLE.Medium
                      )}
                    >
                      {t.priorityLabel}
                    </span>
                    <span>{t.statusLabel}</span>
                    {t.taskDate && (
                      <span className={cn('inline-flex items-center gap-1', t.isOverdue && 'font-semibold text-red-600 dark:text-red-400')}>
                        <Clock className="h-3.5 w-3.5" />
                        {t.taskDate}
                        {t.taskTime ? ` ${t.taskTime}` : ''}
                        {t.daysLeft !== null && t.status !== 'done' && (
                          <span>({t.daysLeft < 0 ? `${-t.daysLeft} hari terlambat` : t.daysLeft === 0 ? 'hari ini' : `${t.daysLeft} hari lagi`})</span>
                        )}
                      </span>
                    )}
                    <span>Proyek: {t.projectLabel}</span>
                  </p>
                  {t.isBlocked && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-btn bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Blocker: {t.blockerCategory ?? '—'}
                      {t.blockerDescription ? ` — ${t.blockerDescription}` : ''}
                    </p>
                  )}
                  {blockerFor === t.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        value={blockerText}
                        onChange={(e) => setBlockerText(e.target.value)}
                        placeholder="Kategori blocker (wajib)"
                        className="min-w-[200px] flex-1 rounded-btn border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand dark:bg-slate-800"
                      />
                      <button
                        type="button"
                        disabled={!blockerText.trim() || changingId === t.id}
                        onClick={() => {
                          onStatusChange(t, 'pending', blockerText.trim());
                          setBlockerFor(null);
                        }}
                        className="rounded-btn bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setBlockerFor(null)}
                        className="rounded-btn border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <select
                    value={t.status}
                    disabled={changingId === t.id}
                    onChange={(e) => handleStatus(t, e.target.value)}
                    aria-label="Ubah status tugas"
                    className="rounded-btn border border-line bg-white px-2 py-1.5 text-[12px] text-ink outline-none focus:border-brand dark:bg-slate-800"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <Link
                    href="/tal/tasks"
                    title="Buka di TAL"
                    className="rounded-btn p-1.5 text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
