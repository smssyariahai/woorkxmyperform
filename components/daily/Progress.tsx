// Progres Harian — Task Completion dan Calendar Activity dipisah.
'use client';

import { cn } from '@/lib/utils';
import type { ProgressResponse } from './types';

function Bar({ percent, tone }: { percent: number; tone: 'brand' | 'emerald' }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className={cn('h-full rounded-full transition-all', tone === 'brand' ? 'bg-brand' : 'bg-emerald-500')}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export function Progress({
  data,
  loading,
  range,
  onRangeChange,
}: {
  data: ProgressResponse | null;
  loading: boolean;
  range: string;
  onRangeChange: (r: string) => void;
}) {
  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Progres Harian</h2>
        <div className="flex gap-1">
          {[
            { value: 'today', label: 'Hari Ini' },
            { value: 'week', label: 'Minggu Ini' },
            { value: 'month', label: 'Bulan Ini' },
          ].map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => onRangeChange(r.value)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
                range === r.value
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 text-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {loading || !data ? (
        <div className="mt-4 space-y-3">
          <div className="h-16 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          <div className="h-16 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-semibold text-ink">Penyelesaian Tugas</p>
              <p className="text-[13px] font-bold text-ink">{data.task.percent}%</p>
            </div>
            <div className="mt-2"><Bar percent={data.task.percent} tone="brand" /></div>
            <p className="mt-1.5 text-[12px] text-muted">
              Selesai: {data.task.completed} · Dalam proses: {data.task.inProgress} · Belum dimulai: {data.task.todo} · Terlambat: {data.task.overdue} · Total: {data.task.total}
            </p>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-semibold text-ink">Aktivitas Kalender</p>
              <p className="text-[13px] font-bold text-ink">{data.calendar.percent}%</p>
            </div>
            <div className="mt-2"><Bar percent={data.calendar.percent} tone="emerald" /></div>
            <p className="mt-1.5 text-[12px] text-muted">
              Terlaksana: {data.calendar.completed} · Terjadwal: {data.calendar.scheduled} · Total: {data.calendar.total}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
