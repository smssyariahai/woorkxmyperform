// Halaman room meeting (Fase 3) — mengambil data meeting + identitas user
// login (useSession, pola halaman lain), lalu me-render <MeetingRoom> yang
// berisi seluruh UI room + WebRTC mesh. Logika media/signaling TIDAK ada di
// sini, supaya komponen yang sama bisa dipakai ulang oleh room tamu.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import MeetingRoom, { type MeetIdentity } from '@/components/meet/MeetingRoom';
import { getMeeting, type MeetingItem } from '@/components/meet/client';

export default function MeetRoomPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const { data: session, status: sessionStatus } = useSession();
  const [meeting, setMeeting] = useState<MeetingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await getMeeting(id);
      setMeeting(r.meeting);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memuat ruang meeting.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="-m-4 flex min-h-[calc(100vh-2rem)] items-center justify-center bg-slate-950 text-sm text-slate-400 sm:-m-6">
        Memuat ruang meeting…
      </div>
    );
  }

  const sessionUser = session?.user as { id?: string; name?: string | null } | undefined;
  if (!sessionUser?.id) {
    return (
      <div className="-m-4 flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center sm:-m-6">
        <p className="text-sm text-slate-300">Anda harus login untuk masuk ke ruang meeting ini.</p>
        <Link href="/login" className="rounded-lg bg-white px-4 py-2 text-xs font-medium text-slate-900">
          Masuk
        </Link>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="-m-4 flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center sm:-m-6">
        <p className="text-sm text-slate-300">{error || 'Meeting tidak ditemukan.'}</p>
        <Link href="/meet" className="rounded-lg bg-white px-4 py-2 text-xs font-medium text-slate-900">
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  const identity: MeetIdentity = {
    kind: 'user',
    peerId: sessionUser.id,
    displayName: sessionUser.name ?? 'Peserta',
    isHost: meeting.hostId === sessionUser.id,
  };

  return <MeetingRoom meetingId={id} identity={identity} initialMeeting={meeting} />;
}
