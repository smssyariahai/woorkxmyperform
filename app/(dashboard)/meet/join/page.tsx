// Gabung meeting via Meeting ID atau tautan — validasi via POST /api/meet/[id]/join.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3, Hourglass, LogIn, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Card } from '@/components/ui/primitives';
import { Input, PasswordInput } from '@/components/ui/input';
import { formatTanggalJam } from '@/lib/pengumuman/client';
import {
  MEETING_STATUS_LABEL,
  formatDurasi,
  getMeeting,
  joinMeeting,
  shortMeetingId,
  type MeetingItem,
} from '@/components/meet/client';
import { MEETING_STATUS_TONE } from '@/components/meet/MeetingCard';

/** Ambil ID meeting / token tamu dari input (ID polos atau tautan). */
function parseJoinInput(raw: string): { id?: string; token?: string } {
  const v = raw.trim();
  if (!v) return {};
  const guest = v.match(/\/meet\/guest\/([A-Za-z0-9-]+)/);
  if (guest) return { token: guest[1] };
  try {
    const url = new URL(v.startsWith('http') ? v : `https://x/${v.replace(/^\/+/, '')}`);
    const qId = url.searchParams.get('id') || url.searchParams.get('meetingId');
    if (qId) return { id: qId };
    const room = url.pathname.match(/\/meet\/(?:room\/)?([A-Za-z0-9_-]+)/);
    if (room && room[1] !== 'join' && room[1] !== 'new' && room[1] !== 'schedule' && room[1] !== 'history') {
      return { id: room[1] };
    }
  } catch {
    // Bukan URL — anggap ID polos.
  }
  return { id: v };
}

export default function MeetJoinPage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [password, setPassword] = useState('');
  const [meeting, setMeeting] = useState<MeetingItem | null>(null);
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [waiting, setWaiting] = useState(false);

  async function handleSearch() {
    const { id, token } = parseJoinInput(input);
    if (token) {
      router.push(`/meet/guest/${token}`);
      return;
    }
    if (!id) {
      toast.error('Masukkan Meeting ID atau tempel tautan meeting.');
      return;
    }
    setLooking(true);
    setWaiting(false);
    try {
      const detail = await getMeeting(id);
      setMeeting(detail.meeting);
    } catch (e: unknown) {
      setMeeting(null);
      toast.error(e instanceof Error ? e.message : 'Meeting tidak ditemukan.');
    } finally {
      setLooking(false);
    }
  }

  async function handleJoin() {
    if (!meeting) return;
    if ((meeting.hasPassword || meeting.passwordProtected) && !password) {
      toast.error('Meeting ini memakai password. Masukkan password-nya.');
      return;
    }
    setJoining(true);
    try {
      const r = await joinMeeting(meeting.id, { password: password || undefined });
      if (r.waiting) {
        setWaiting(true);
        toast.success('Anda masuk waiting room. Host akan mengizinkan Anda masuk.');
        return;
      }
      toast.success('Berhasil bergabung ke meeting.');
      router.push(`/meet/room/${meeting.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal bergabung ke meeting.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-white">
          <LogIn size={22} />
        </span>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Join Meeting</h1>
          <p className="text-xs text-slate-500">
            Gabung dengan Meeting ID atau tempel tautan meeting. Tautan tamu akan membuka halaman tamu.
          </p>
        </div>
      </div>

      <Card>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Meeting ID atau tautan meeting</span>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              placeholder="Contoh: AB12CD34 atau https://…/meet/…"
            />
            <button onClick={handleSearch} disabled={looking || !input.trim()} className="btn-primary inline-flex shrink-0 items-center gap-1.5 disabled:opacity-50">
              <Search size={15} /> {looking ? 'Mencari…' : 'Cari'}
            </button>
          </div>
        </label>

        {meeting && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">{meeting.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  ID: {shortMeetingId(meeting.id)}
                  {meeting.hostName ? ` • Host: ${meeting.hostName}` : ''}
                </p>
                <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={13} /> {formatTanggalJam(meeting.startsAt)} • {formatDurasi(meeting.startsAt, meeting.endsAt)}
                  </span>
                </p>
                {meeting.description && <p className="mt-2 text-xs text-slate-600">{meeting.description}</p>}
              </div>
              <Badge tone={MEETING_STATUS_TONE[meeting.status] ?? 'gray'}>
                {MEETING_STATUS_LABEL[meeting.status] ?? meeting.status}
              </Badge>
            </div>

            {meeting.status === 'CANCELLED' ? (
              <p className="mt-3 text-xs font-medium text-red-600">Meeting ini sudah dibatalkan.</p>
            ) : meeting.status === 'COMPLETED' ? (
              <p className="mt-3 text-xs font-medium text-slate-600">Meeting ini sudah selesai.</p>
            ) : waiting ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                <Hourglass size={15} className="mt-0.5 shrink-0" />
                <span>
                  Anda berada di <strong>waiting room</strong>. Host akan mengizinkan Anda masuk. Mohon tunggu — halaman
                  ini tidak perlu di-refresh.
                </span>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {(meeting.hasPassword || meeting.passwordProtected) && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Password meeting *</span>
                    <PasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan password meeting"
                      autoComplete="off"
                    />
                  </label>
                )}
                <button onClick={handleJoin} disabled={joining} className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50">
                  <LogIn size={15} /> {joining ? 'Bergabung…' : 'Gabung Meeting'}
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
