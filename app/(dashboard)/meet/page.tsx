// Dashboard WOORK MEET — header, quick action, kartu info, upcoming & recent.
// Data dari GET /api/meet?filter=today|upcoming|ongoing|history|mine.
// Semua teks Bahasa Indonesia; pola visual mengikuti halaman /tiket.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, History, LogIn, Video, VideoIcon } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { MeetingCard } from '@/components/meet/MeetingCard';
import { listMeetings, type MeetingItem } from '@/components/meet/client';

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="!p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </Card>
  );
}

export default function MeetDashboardPage() {
  const [today, setToday] = useState<MeetingItem[]>([]);
  const [upcoming, setUpcoming] = useState<MeetingItem[]>([]);
  const [ongoing, setOngoing] = useState<MeetingItem[]>([]);
  const [history, setHistory] = useState<MeetingItem[]>([]);
  const [mineCount, setMineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [t, u, o, h, m] = await Promise.all([
        listMeetings({ filter: 'today' }).catch(() => ({ meetings: [] as MeetingItem[] })),
        listMeetings({ filter: 'upcoming' }).catch(() => ({ meetings: [] as MeetingItem[] })),
        listMeetings({ filter: 'ongoing' }).catch(() => ({ meetings: [] as MeetingItem[] })),
        listMeetings({ filter: 'history' }).catch(() => ({ meetings: [] as MeetingItem[] })),
        listMeetings({ filter: 'mine' }).catch(() => ({ meetings: [] as MeetingItem[] })),
      ]);
      setToday(t.meetings);
      setUpcoming(u.meetings);
      setOngoing(o.meetings);
      setHistory(h.meetings);
      setMineCount(m.meetings.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memuat dashboard WOORK MEET.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const seen = new Set<string>();
  const thisMonth = [...today, ...upcoming, ...history].filter((mt) => {
    if (seen.has(mt.id)) return false;
    seen.add(mt.id);
    return new Date(mt.startsAt).getTime() >= monthStart.getTime();
  }).length;
  const recent = [...history]
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-white">
            <Video size={22} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-slate-800">WOORK MEET</h1>
            <p className="text-xs text-slate-500">Video Conference &amp; Online Collaboration</p>
          </div>
        </div>
        <Link href="/meet/history" className="btn-secondary inline-flex items-center gap-1.5">
          <History size={15} /> Riwayat
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/meet/new"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white">
            <Video size={20} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-800">New Meeting</span>
            <span className="block text-xs text-slate-500">Buat meeting dan mulai sekarang</span>
          </span>
        </Link>
        <Link
          href="/meet/join"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white">
            <LogIn size={20} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-800">Join Meeting</span>
            <span className="block text-xs text-slate-500">Gabung dengan Meeting ID atau tautan</span>
          </span>
        </Link>
        <Link
          href="/meet/schedule"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white">
            <CalendarPlus size={20} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-800">Schedule Meeting</span>
            <span className="block text-xs text-slate-500">Jadwalkan meeting untuk nanti</span>
          </span>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Meeting Hari Ini" value={today.length} tone="text-slate-800" />
          <StatCard label="Mendatang" value={upcoming.length} tone="text-slate-800" />
          <StatCard label="Sedang Berlangsung" value={ongoing.length} tone="text-green-700" />
          <StatCard label="Total Bulan Ini" value={thisMonth} tone="text-slate-800" />
          <StatCard label="Yang Saya Buat" value={mineCount} tone="text-slate-800" />
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Upcoming Meetings</h2>
          <Link href="/meet/schedule" className="text-xs font-medium text-slate-600 hover:underline">
            + Jadwalkan
          </Link>
        </div>
        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : upcoming.length === 0 && ongoing.length === 0 ? (
          <EmptyState
            icon={<VideoIcon className="h-7 w-7" />}
            title="Belum ada meeting mendatang"
            description="Belum ada meeting yang dijadwalkan. Buat meeting baru atau jadwalkan meeting untuk nanti."
            action={
              <Link href="/meet/new" className="btn-primary">
                Buat Meeting
              </Link>
            }
          />
        ) : (
          <div className="mt-4 space-y-2">
            {[...ongoing, ...upcoming]
              .filter((mt, i, arr) => arr.findIndex((x) => x.id === mt.id) === i)
              .slice(0, 10)
              .map((mt) => (
                <MeetingCard key={mt.id} meeting={mt} />
              ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Recent Meetings</h2>
          <Link href="/meet/history" className="text-xs font-medium text-slate-600 hover:underline">
            Lihat semua
          </Link>
        </div>
        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<History className="h-7 w-7" />}
            title="Belum ada riwayat meeting"
            description="Meeting yang sudah selesai atau dibatalkan akan tampil di sini."
          />
        ) : (
          <div className="mt-4 space-y-2">
            {recent.map((mt) => (
              <MeetingCard key={mt.id} meeting={mt} showJoin={false} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
