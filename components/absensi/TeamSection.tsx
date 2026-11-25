// Tim hari ini — siapa sedang online / meeting / cuti / off.
// Alasan cuti TIDAK ditampilkan (backend memang tidak mengirimkannya).
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Video, Palmtree, CircleOff, Clock } from 'lucide-react';
import {
  apiJson,
  formatTimeId,
  formatDateLongId,
  type TeamResponse,
  type TeamMember,
} from '@/lib/attendance/client';

function MemberRow({ m }: { m: TeamMember }) {
  return (
    <li className="flex items-start justify-between gap-2 rounded-btn border border-line px-3 py-2">
      <div>
        <p className="text-[13px] font-medium text-ink">{m.name ?? m.email ?? '—'}</p>
        <p className="text-[12px] text-muted">
          {m.position ?? ''}
          {m.position && m.department ? ' · ' : ''}
          {m.department ?? ''}
        </p>
        {m.meeting && (
          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
            <Video className="h-3.5 w-3.5" /> {m.meeting.title}
            {m.meeting.startsAt ? ` · ${formatTimeId(m.meeting.startsAt)}` : ''}
            {m.meeting.endsAt ? `–${formatTimeId(m.meeting.endsAt)}` : ''}
          </p>
        )}
        {m.locationName && <p className="mt-0.5 text-[12px] text-muted">di {m.locationName}</p>}
        {m.note && <p className="mt-0.5 text-[12px] text-muted">{m.note}</p>}
      </div>
      <div className="shrink-0 text-right text-[12px] text-muted">
        {m.checkInAt && <p className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTimeId(m.checkInAt)}</p>}
        {m.checkOutAt && <p>Pulang {formatTimeId(m.checkOutAt)}</p>}
        {m.shiftName && <p>{m.shiftName}</p>}
      </div>
    </li>
  );
}

export function TeamSection() {
  const [data, setData] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<TeamResponse>('/api/absensi/team');
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat status tim.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
        <p className="text-[13px] text-warn">{error ?? 'Status tim tidak tersedia.'}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-btn border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Coba lagi
        </button>
      </section>
    );
  }

  const groups: Array<{ key: string; label: string; icon: typeof Users; members: TeamMember[]; empty: string }> = [
    { key: 'online', label: 'Sedang Online', icon: Users, members: data.online, empty: 'Tidak ada yang sedang online.' },
    { key: 'inMeeting', label: 'Sedang Meeting', icon: Video, members: data.inMeeting, empty: 'Tidak ada yang sedang meeting.' },
    { key: 'onLeave', label: 'Cuti Hari Ini', icon: Palmtree, members: data.onLeave, empty: 'Tidak ada yang cuti hari ini.' },
    { key: 'off', label: 'Off / Belum Check In', icon: CircleOff, members: data.off, empty: 'Semua sudah check in.' },
  ];

  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Users className="h-4 w-4 text-brand" /> Tim Hari Ini
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {formatDateLongId(new Date(`${data.date}T00:00:00Z`))}
            {data.isHoliday ? ` · Libur: ${data.holidayName ?? 'Hari libur'}` : ''}
            {' · '}
            {data.counts.online} online · {data.counts.inMeeting} meeting · {data.counts.onLeave} cuti · {data.counts.off} off
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-btn border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Muat ulang
        </button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const Icon = g.icon;
          return (
            <div key={g.key}>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <Icon className="h-4 w-4 text-brand" /> {g.label}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted dark:bg-slate-800">
                  {g.members.length}
                </span>
              </p>
              {g.members.length === 0 ? (
                <p className="mt-2 rounded-btn bg-slate-50 px-3 py-4 text-center text-[12px] text-muted dark:bg-slate-800/60">
                  {g.empty}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {g.members.map((m) => (
                    <MemberRow key={m.userId} m={m} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
