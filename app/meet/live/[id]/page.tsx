'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CalendarDays, Clock, Hourglass, LogIn, User, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import MeetingRoom from '@/components/meet/MeetingRoom';
import { formatTanggalJam } from '@/lib/pengumuman/client';
import {
  formatDurasi,
  getGuestMeeting,
  joinMeeting,
  type GuestMeetingInfo,
  type MeetingItem,
} from '@/components/meet/client';

/**
 * Room publik WOORK MEET untuk tamu (DI LUAR (dashboard), TANPA login).
 *
 * - Token diambil dari `?token=`, divalidasi lewat GET /api/meet/guest/[token]
 *   (404 generik / 410 kedaluwarsa — hanya field aman yang dikembalikan API).
 * - Nama tamu dipakai dari validasi token bila sudah ada; bila belum ada,
 *   tamu diminta mengisi nama sebelum masuk.
 * - Join memakai POST /api/meet/[id]/join Fase 2 (catat MeetingSession +
 *   status ATTENDED). Join ulang di sini aman: API memakai kembali sesi aktif
 *   yang sudah dibuat dari halaman undangan (/meet/guest/[token]).
 * - `initialMeeting` (dari lookup token) WAJIB diteruskan ke MeetingRoom:
 *   tanpa itu MeetingRoom memanggil getMeeting yang butuh login dan tamu
 *   akan gagal memuat room.
 * - TIDAK memuat data internal WOORK: tidak ada sidebar/dashboard/menu,
 *   tidak ada pencarian peserta, tidak ada fetch ke /api/meet/[id] atau
 *   /api/meet/search-participants. Satu-satunya fetch: lookup token tamu +
 *   join/leave meeting ini.
 * - Leave: MeetingRoom menerima guestToken lewat identity sehingga dapat
 *   memanggil leave API; sebagai jaring pengaman, menutup tab juga mengirim
 *   leave (pagehide beacon) agar sesi + durasi tercatat.
 */
type Phase = 'loading' | 'invalid' | 'need-name' | 'joining' | 'waiting' | 'ready' | 'error';

function LiveGuestRoom({ meetingId }: { meetingId: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [meeting, setMeeting] = useState<(GuestMeetingInfo & { guestName?: string | null }) | null>(null);
  /** MeetingItem untuk prop `initialMeeting` MeetingRoom (dari lookup token). */
  const [initialMeeting, setInitialMeeting] = useState<MeetingItem | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Validasi token tamu (sekali saat mount / token berubah).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) {
        setErrorMsg('Tautan room ini tidak menyertakan token undangan. Silakan buka tautan undangan dari host meeting.');
        setPhase('invalid');
        return;
      }
      setPhase('loading');
      try {
        const m = await getGuestMeeting(token);
        if (!alive) return;
        setMeeting(m);
        // Petakan info tamu (field aman) ke MeetingItem agar MeetingRoom
        // tidak perlu memanggil getMeeting (butuh login).
        setInitialMeeting({
          id: m.id,
          title: m.title,
          description: m.description ?? null,
          startsAt: m.startsAt,
          endsAt: m.endsAt ?? null,
          timezone: m.timezone ?? 'Asia/Jakarta',
          meetingType: m.meetingType ?? 'INTERNAL',
          status: m.status ?? 'SCHEDULED',
          hostName: m.hostName,
          waitingRoom: m.waitingRoom,
        });
        const name = (m.guestName ?? '').trim();
        if (name) {
          setDisplayName(name);
          await doJoin(m, name);
        } else {
          setPhase('need-name');
        }
      } catch (e: unknown) {
        if (!alive) return;
        setErrorMsg(
          e instanceof Error ? e.message : 'Tautan undangan tidak valid atau sudah kedaluwarsa.'
        );
        setPhase('invalid');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, meetingId]);

  const doJoin = useCallback(
    async (m: GuestMeetingInfo, name: string) => {
      setJoining(true);
      setPhase('joining');
      try {
        const r = await joinMeeting(m.id, { guestToken: token, guestName: name });
        if (r.waiting) {
          setPhase('waiting');
          return;
        }
        setParticipantId(r.participantId ?? null);
        setSessionId(r.sessionId ?? null);
        setDisplayName(name);
        setPhase('ready');
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : 'Gagal masuk ke ruang meeting.');
        setPhase('error');
      } finally {
        setJoining(false);
      }
    },
    [token]
  );

  // Jaring pengaman: tamu menutup tab/aplikasi tanpa menekan Keluar —
  // tutup sesi kehadiran (leftAt + durationSeconds) lewat beacon.
  useEffect(() => {
    if (phase !== 'ready') return;
    const onPageHide = () => {
      try {
        const payload = new Blob([JSON.stringify({ guestToken: token, sessionId })], {
          type: 'application/json',
        });
        navigator.sendBeacon(`/api/meet/${meetingId}/leave`, payload);
      } catch {
        // best-effort saja; leave eksplisit dari MeetingRoom tetap utama.
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [phase, meetingId, token, sessionId]);

  function handleEnterWithName() {
    if (!meeting) return;
    if (!displayName.trim()) {
      toast.error('Masukkan nama tampilan Anda.');
      return;
    }
    void doJoin(meeting, displayName.trim());
  }

  // --- Tampilan gelap yang sama dengan room login (tanpa AppShell/sidebar) ---
  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-white">
          <Video size={18} />
        </span>
        <div>
          <p className="text-sm font-bold leading-tight">{meeting?.title ?? 'WOORK MEET'}</p>
          <p className="text-xs text-slate-400">Ruang meeting tamu • tanpa login</p>
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center p-4">{children}</div>
    </div>
  );

  if (phase === 'ready' && meeting) {
    // peerId stabil per peserta tamu; fallback ke sessionId bila API tak
    // mengembalikan participantId (tidak terjadi di jalur tamu normal).
    const peerId = participantId ? `guest:${participantId}` : `guest:${sessionId ?? 'unknown'}`;
    return (
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
        <MeetingRoom
          meetingId={meeting.id}
          identity={{
            kind: 'guest',
            peerId,
            displayName: displayName.trim(),
            guestToken: token,
            isHost: false,
          }}
          initialMeeting={initialMeeting}
        />
      </div>
    );
  }

  if (phase === 'loading' || phase === 'joining') {
    return shell(
      <p className="text-sm text-slate-400">
        {phase === 'loading' ? 'Memeriksa undangan meeting…' : 'Masuk ke ruang meeting…'}
      </p>
    );
  }

  if (phase === 'invalid' || phase === 'error') {
    return shell(
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
          <AlertTriangle size={24} />
        </span>
        <h1 className="mt-3 text-base font-bold">
          {phase === 'invalid' ? 'Undangan tidak dapat dibuka' : 'Gagal masuk ruang meeting'}
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">{errorMsg}</p>
        {phase === 'invalid' ? (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Tautan ini mungkin sudah kedaluwarsa atau dicabut. Silakan minta tautan undangan baru kepada host
            meeting.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() => meeting && void doJoin(meeting, displayName.trim() || meeting.guestName || '')}
              disabled={joining || !meeting}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            >
              <LogIn size={15} /> Coba Lagi
            </button>
            <a
              href={`/meet/guest/${encodeURIComponent(token)}`}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Kembali ke Halaman Undangan
            </a>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'waiting' && meeting) {
    return shell(
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
          <Hourglass size={24} />
        </span>
        <h1 className="mt-3 text-base font-bold">Anda berada di waiting room</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Host meeting “{meeting.title}” akan mengizinkan Anda masuk. Kehadiran Anda sudah tercatat.
        </p>
        <button
          onClick={() => void doJoin(meeting, displayName.trim())}
          disabled={joining}
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
        >
          <LogIn size={15} /> {joining ? 'Memeriksa…' : 'Coba Masuk Lagi'}
        </button>
      </div>
    );
  }

  // need-name: token valid tapi belum ada nama tamu tersimpan.
  return shell(
    <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
      <h1 className="text-base font-bold">{meeting?.title ?? 'Meeting'}</h1>
      {meeting?.description && <p className="mt-1 text-sm text-slate-400">{meeting.description}</p>}
      <div className="mt-3 space-y-1.5 text-sm text-slate-300">
        <p className="flex items-center gap-2">
          <User size={15} className="shrink-0 text-slate-500" /> Host: {meeting?.hostName ?? '—'}
        </p>
        {meeting?.startsAt && (
          <p className="flex items-center gap-2">
            <CalendarDays size={15} className="shrink-0 text-slate-500" /> {formatTanggalJam(meeting.startsAt)}
          </p>
        )}
        {meeting?.startsAt && (
          <p className="flex items-center gap-2">
            <Clock size={15} className="shrink-0 text-slate-500" /> Durasi:{' '}
            {formatDurasi(meeting.startsAt, meeting.endsAt)}
            {meeting?.timezone ? ` • ${meeting.timezone}` : ''}
          </p>
        )}
      </div>
      <label className="mt-5 block">
        <span className="mb-1 block text-xs font-medium text-slate-400">Nama tampilan Anda *</span>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nama yang tampil di meeting"
          maxLength={100}
          autoComplete="name"
          className="border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500"
        />
      </label>
      <button
        onClick={handleEnterWithName}
        disabled={joining || !displayName.trim()}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
      >
        <LogIn size={15} /> {joining ? 'Masuk…' : 'Masuk Room'}
      </button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
        Dengan bergabung, Anda hanya mengakses meeting ini — Anda tidak dapat melihat data internal WOORK.
      </p>
    </div>
  );
}

export default function MeetLiveGuestPage({ params }: { params: { id: string } }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
          Memuat ruang meeting…
        </div>
      }
    >
      <LiveGuestRoom meetingId={params.id} />
    </Suspense>
  );
}
