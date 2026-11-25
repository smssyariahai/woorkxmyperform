// Team Workspace — hanya untuk pemegang DAILY_MANAGE yang punya departemen.
'use client';

import Link from 'next/link';
import { Users, Video, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimeId } from '@/lib/calendar/client';
import type { TeamResponse } from './types';

const AVAIL_STYLE: Record<string, string> = {
  Available: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'In Meeting': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'On Leave': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Busy: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Off Hours': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export function TeamSection({ team, loading }: { team: TeamResponse | null; loading: boolean }) {
  if (loading) {
    return (
      <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
        <div className="h-40 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
      </section>
    );
  }
  if (!team || !team.available) {
    return (
      <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Users className="h-4 w-4 text-muted" /> Team Workspace
        </h2>
        <p className="mt-3 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          {team?.reason ?? 'Team Workspace tidak tersedia untuk akun Anda.'}
        </p>
      </section>
    );
  }
  const o = team.overview!;
  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Users className="h-4 w-4 text-muted" /> Team Workspace — {team.departmentName}
        </h2>
        <Link href="/kalender" className="text-[12px] font-semibold text-brand hover:underline">
          Buka Kalender Tim
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Anggota Tim', value: o.totalMembers },
          { label: 'Tugas Aktif', value: o.activeTasks },
          { label: 'Tugas Selesai', value: o.completedTasks },
          { label: 'Tugas Terlambat', value: o.overdueTasks },
          { label: 'Meeting Terjadwal', value: o.scheduledMeetings },
          { label: 'Menunggu Persetujuan', value: o.pendingApprovals },
        ].map((c) => (
          <div key={c.label} className="rounded-btn bg-slate-50 p-3 text-center dark:bg-slate-800/60">
            <p className="text-[20px] font-bold text-ink">{c.value}</p>
            <p className="text-[11px] text-muted">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Progres Tugas Tim</h3>
          <ul className="mt-2 space-y-2.5">
            {(team.taskProgress ?? []).map((m) => (
              <li key={m.userId} className="rounded-btn border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[13px] font-medium text-ink">
                    {m.name ?? m.email}
                    {m.jobTitle && <span className="ml-1 text-[12px] font-normal text-muted">· {m.jobTitle}</span>}
                  </p>
                  <span className="shrink-0 text-[13px] font-bold text-ink">{m.percent}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${m.percent}%` }} />
                </div>
                <p className="mt-1 text-[12px] text-muted">
                  Aktif: {m.active} · Selesai: {m.completed} · Terlambat: {m.overdue}
                </p>
              </li>
            ))}
            {(team.taskProgress ?? []).length === 0 && (
              <li className="py-3 text-[13px] text-muted">Belum ada tugas anggota tim bulan ini.</li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold text-ink">Ketersediaan Tim</h3>
          <ul className="mt-2 space-y-2">
            {(team.availability ?? []).map((a) => (
              <li key={a.userId} className="flex items-center justify-between gap-2 rounded-btn border border-line px-3 py-2">
                <span className="min-w-0 truncate text-[13px] text-ink">{a.name ?? '—'}</span>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', AVAIL_STYLE[a.status] ?? AVAIL_STYLE.Available)}>
                  {a.status === 'On Leave' ? 'Cuti' : a.status === 'In Meeting' ? 'Sedang Meeting' : a.status === 'Busy' ? 'Sibuk' : a.status === 'Off Hours' ? 'Di Luar Jam Kerja' : 'Tersedia'}
                </span>
              </li>
            ))}
          </ul>

          <h3 className="mt-5 text-[13px] font-semibold text-ink">Agenda Tim Hari Ini</h3>
          {(team.schedule ?? []).length === 0 ? (
            <p className="mt-2 rounded-btn bg-slate-50 px-3 py-4 text-center text-[12px] text-muted dark:bg-slate-800/60">
              Tidak ada agenda tim hari ini.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {(team.schedule ?? []).slice(0, 6).map((it) => (
                <li key={it.id} className="flex items-center gap-2 rounded-btn border border-line px-3 py-2 text-[13px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: it.categoryColor }} />
                  <span className="shrink-0 font-medium text-muted">
                    {it.isAllDay ? 'Sehari' : formatTimeId(it.startAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">{it.title}</span>
                  <span className="shrink-0 text-[12px] text-muted">{it.ownerName ?? ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <Link href="/meet/new" className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90">
          <Video className="h-4 w-4" /> Jadwalkan Meeting Tim
        </Link>
        <Link href="/kantor" className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800">
          <ClipboardCheck className="h-4 w-4" /> Tinjau Persetujuan
        </Link>
      </div>
    </section>
  );
}
