// Meeting Berikutnya — dari WOORK MEET. Tombol Gabung hanya bila ada link.
'use client';

import Link from 'next/link';
import { Video, Clock, MapPin, Users } from 'lucide-react';
import { formatTimeId, formatDateShortId } from '@/lib/calendar/client';
import type { DailyMeeting } from './types';

export function Meetings({ meetings, loading }: { meetings: DailyMeeting[]; loading: boolean }) {
  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Meeting Berikutnya</h2>
        <Link href="/meet" className="text-[12px] font-semibold text-brand hover:underline">
          Lihat Semua
        </Link>
      </div>
      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Tidak ada meeting terjadwal dalam 7 hari ke depan.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {meetings.map((m) => (
            <li key={m.id} className="rounded-btn border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{m.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDateShortId(m.startsAt)} · {formatTimeId(m.startsAt)} – {formatTimeId(m.endsAt)}
                      {` (${m.durationMinutes} mnt)`}
                    </span>
                    {m.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {m.location}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
                    <Users className="h-3.5 w-3.5" />
                    {m.organizer.name ?? '—'}
                    {m.attendees.length > 0 &&
                      ` + ${m.attendees.length} peserta`}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {m.joinActive && m.joinUrl && (
                  <a
                    href={m.joinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-btn bg-brand px-2.5 py-1 text-[12px] font-semibold text-white hover:opacity-90"
                  >
                    <Video className="h-3.5 w-3.5" /> Gabung
                  </a>
                )}
                {m.joinActive && !m.joinUrl && m.roomName && (
                  <Link
                    href={`/meet/room/${m.id}`}
                    className="inline-flex items-center gap-1 rounded-btn bg-brand px-2.5 py-1 text-[12px] font-semibold text-white hover:opacity-90"
                  >
                    <Video className="h-3.5 w-3.5" /> Gabung
                  </Link>
                )}
                <Link
                  href={m.sourceUrl}
                  className="inline-flex items-center gap-1 rounded-btn border border-line px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Lihat Meeting
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
