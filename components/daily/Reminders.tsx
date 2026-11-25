// Pengingat Saya — notifikasi belum dibaca + pengingat kalender hari ini.
'use client';

import Link from 'next/link';
import { Bell, Check, Clock } from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import { formatTimeId } from '@/lib/calendar/client';
import type { ReminderNotification, CalendarReminderItem } from './types';

export function Reminders({
  notifications,
  calendarReminders,
  loading,
  onMarkRead,
  markingId,
}: {
  notifications: ReminderNotification[];
  calendarReminders: CalendarReminderItem[];
  loading: boolean;
  onMarkRead: (id: string) => void;
  markingId: string | null;
}) {
  const empty = notifications.length === 0 && calendarReminders.length === 0;
  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Pengingat Saya</h2>
        <Bell className="h-4 w-4 text-muted" />
      </div>
      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : empty ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Tidak ada pengingat yang belum dibaca.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {calendarReminders.map((r) => (
            <li key={r.id} className="flex items-start gap-3 rounded-btn border border-line p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{r.eventTitle}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  Pengingat {r.minutesBefore === 0 ? 'saat acara dimulai' : `${r.minutesBefore} menit sebelumnya`}
                  {r.eventStartAt ? ` · mulai ${formatTimeId(r.eventStartAt)}` : ''}
                </p>
              </div>
              <Link
                href={r.sourceUrl}
                className="shrink-0 text-[12px] font-semibold text-brand hover:underline"
              >
                Buka
              </Link>
            </li>
          ))}
          {notifications.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-btn border border-line p-3">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{n.title}</p>
                {n.body && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-muted">{timeAgo(n.createdAt)}</p>
              </div>
              <button
                type="button"
                disabled={markingId === n.id}
                onClick={() => onMarkRead(n.id)}
                title="Tandai sudah dibaca"
                className="inline-flex shrink-0 items-center gap-1 rounded-btn border border-line px-2 py-1 text-[12px] font-medium text-ink hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
              >
                <Check className="h-3.5 w-3.5" /> Dibaca
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
