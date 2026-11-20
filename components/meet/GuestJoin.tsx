'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarDays, Clock, Hourglass, LogIn, User, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { formatTanggalJam } from '@/lib/pengumuman/client';
import {
  formatDurasi,
  getGuestMeeting,
  joinMeeting,
  type GuestMeetingInfo,
} from './client';

/**
 * Halaman tamu PUBLIK (tanpa login, tanpa navigasi dashboard).
 * Hanya menampilkan info meeting yang diundang — TIDAK menampilkan
 * daftar peserta lain, email karyawan, atau data internal apa pun.
 */
export function GuestJoin({ token }: { token: string }) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<GuestMeetingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [joined, setJoined] = useState(false);
  /** true bila navigasi otomatis ke room belum terjadi (tampilkan tombol manual). */
  const [navFailed, setNavFailed] = useState(false);

  /** URL room publik tamu (tanpa login, token di query). */
  const liveUrl = meeting ? `/meet/live/${meeting.id}?token=${encodeURIComponent(token)}` : '';

  // Setelah berhasil bergabung, navigasikan ke room publik. Bila navigasi
  // otomatis gagal/tertahan, tampilkan tombol "Masuk Room" manual.
  useEffect(() => {
    if (!joined || !liveUrl) return;
    const t = window.setTimeout(() => setNavFailed(true), 2500);
    return () => window.clearTimeout(t);
  }, [joined, liveUrl]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await getGuestMeeting(token);
        if (alive) setMeeting(m);
      } catch {
        if (alive) setInvalid(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  async function handleJoin() {
    if (!meeting) return;
    if (!displayName.trim()) {
      toast.error('Masukkan nama tampilan Anda.');
      return;
    }
    setJoining(true);
    try {
      const r = await joinMeeting(meeting.id, { guestToken: token, guestName: displayName.trim() });
      if (r.waiting) {
        setWaiting(true);
        return;
      }
      setJoined(true);
      // Masuk room publik tamu. Bila router.push gagal sinkron, tombol
      // manual "Masuk Room" tampil lewat timer navFailed di bawah.
      try {
        router.push(`/meet/live/${meeting.id}?token=${encodeURIComponent(token)}`);
      } catch {
        setNavFailed(true);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal bergabung ke meeting.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-white">
          <Video size={24} />
        </span>
        <p className="mt-3 text-sm font-bold tracking-wide text-slate-800">WOORK MEET</p>
        <p className="text-xs text-slate-500">Video Conference &amp; Online Collaboration</p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">Memuat undangan meeting…</p>
        </div>
      ) : invalid || !meeting ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertTriangle size={24} />
          </span>
          <h1 className="mt-3 text-base font-bold text-slate-800">Undangan tidak dapat dibuka</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Tautan undangan ini tidak valid atau sudah kedaluwarsa. Silakan minta tautan undangan baru kepada host
            meeting.
          </p>
        </div>
      ) : meeting.status === 'CANCELLED' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-bold text-slate-800">Meeting dibatalkan</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Meeting “{meeting.title}” sudah dibatalkan oleh host.
          </p>
        </div>
      ) : meeting.status === 'COMPLETED' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-bold text-slate-800">Meeting sudah selesai</h1>
          <p className="mt-1.5 text-sm text-slate-500">Meeting “{meeting.title}” sudah berakhir.</p>
        </div>
      ) : waiting ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Hourglass size={24} />
          </span>
          <h1 className="mt-3 text-base font-bold text-slate-800">Anda berada di waiting room</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Host meeting “{meeting.title}” akan mengizinkan Anda masuk. Mohon tunggu — halaman ini tidak perlu
            di-refresh.
          </p>
        </div>
      ) : joined ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-600">
            <LogIn size={24} />
          </span>
          <h1 className="mt-3 text-base font-bold text-slate-800">Berhasil bergabung!</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Selamat datang di “{meeting.title}”, {displayName.trim()}. Kehadiran Anda sudah tercatat — membuka
            ruang meeting…
          </p>
          {navFailed && liveUrl ? (
            <a
              href={liveUrl}
              className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-1.5"
            >
              <Video size={15} /> Masuk Room
            </a>
          ) : (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
              Bila halaman tidak berpindah otomatis, tombol “Masuk Room” akan muncul di sini.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-base font-bold text-slate-800">{meeting.title}</h1>
          {meeting.description && <p className="mt-1 text-sm text-slate-600">{meeting.description}</p>}
          <div className="mt-3 space-y-1.5 text-sm text-slate-600">
            <p className="flex items-center gap-2">
              <User size={15} className="shrink-0 text-slate-400" /> Host: {meeting.hostName ?? '—'}
            </p>
            <p className="flex items-center gap-2">
              <CalendarDays size={15} className="shrink-0 text-slate-400" /> {formatTanggalJam(meeting.startsAt)}
            </p>
            <p className="flex items-center gap-2">
              <Clock size={15} className="shrink-0 text-slate-400" /> Durasi: {formatDurasi(meeting.startsAt, meeting.endsAt)}
              {meeting.timezone ? ` • ${meeting.timezone}` : ''}
            </p>
          </div>

          <label className="mt-5 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Nama tampilan Anda *</span>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nama yang tampil di meeting"
              maxLength={100}
              autoComplete="name"
            />
          </label>
          <button
            onClick={handleJoin}
            disabled={joining || !displayName.trim()}
            className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <LogIn size={15} /> {joining ? 'Bergabung…' : 'Gabung Meeting'}
          </button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
            Dengan bergabung, Anda hanya mengakses meeting ini — Anda tidak dapat melihat data internal WOORK.
          </p>
        </div>
      )}
    </div>
  );
}
