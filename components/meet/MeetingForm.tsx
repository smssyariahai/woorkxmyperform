'use client';

import { useMemo, useState } from 'react';
import { Video } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Input, PasswordInput } from '@/components/ui/input';
import { Card } from '@/components/ui/primitives';
import { ParticipantPicker } from './ParticipantPicker';
import { CopyLinkButton, InviteLinkBox } from './CopyLinkButton';
import {
  MEETING_TYPES,
  MEETING_TYPE_LABEL,
  TIMEZONES,
  meetingInviteLink,
  shortMeetingId,
  type MeetingInput,
  type MeetingItem,
  type MeetingType,
  type SelectedParticipant,
} from './client';

function toLocalInput(iso: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${iso.getFullYear()}-${pad(iso.getMonth() + 1)}-${pad(iso.getDate())}T${pad(iso.getHours())}:${pad(iso.getMinutes())}`;
}

function defaultStart(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
      <span>
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-slate-800"
      />
    </label>
  );
}

/**
 * Form bersama untuk /meet/new (mode 'now' — mulai langsung) dan
 * /meet/schedule (mode 'scheduled' — jadwalkan). Parent menangani
 * pemanggilan API via onSubmit dan menampilkan hasilnya sendiri.
 */
export function MeetingForm({
  mode,
  submitting,
  onSubmit,
}: {
  mode: 'now' | 'scheduled';
  submitting: boolean;
  onSubmit: (input: MeetingInput) => Promise<void> | void;
}) {
  const now = useMemo(() => defaultStart(), []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingType>('INTERNAL');
  const [startLocal, setStartLocal] = useState(() => toLocalInput(now));
  const [endLocal, setEndLocal] = useState(() => toLocalInput(new Date(now.getTime() + 60 * 60000)));
  const [timezone, setTimezone] = useState<string>('Asia/Jakarta');
  const [password, setPassword] = useState('');
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [muteOnEntry, setMuteOnEntry] = useState(false);
  const [allowScreenShare, setAllowScreenShare] = useState(true);
  const [allowChat, setAllowChat] = useState(true);
  const [allowRecording, setAllowRecording] = useState(false);
  const [participants, setParticipants] = useState<SelectedParticipant[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Nama meeting wajib diisi.');
      return;
    }
    const start = new Date(startLocal);
    const end = new Date(endLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('Tanggal dan jam mulai/selesai tidak valid.');
      return;
    }
    if (end <= start) {
      toast.error('Jam selesai harus setelah jam mulai.');
      return;
    }
    await onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      timezone,
      meetingType,
      password: password || undefined,
      waitingRoom,
      muteOnEntry,
      allowScreenShare,
      allowChat,
      allowRecording,
      participants,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <h2 className="text-sm font-bold text-slate-800">Detail Meeting</h2>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Nama meeting *</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Rapat Koordinasi Mingguan" maxLength={200} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Deskripsi</span>
            <textarea
              className="input w-full resize-y"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda atau catatan singkat tentang meeting ini (opsional)."
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Tipe meeting</span>
              <select className="input w-full" value={meetingType} onChange={(e) => setMeetingType(e.target.value as MeetingType)}>
                {MEETING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MEETING_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Zona waktu</span>
              <select className="input w-full" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                {mode === 'now' ? 'Tanggal & jam mulai' : 'Tanggal & jam mulai *'}
              </span>
              <Input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
              {mode === 'now' && <span className="mt-1 block text-xs text-slate-500">Default: satu jam ke depan, durasi 60 menit.</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Tanggal & jam selesai *</span>
              <Input type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} />
            </label>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-slate-800">Peserta</h2>
        <p className="mt-1 text-xs text-slate-500">
          Undang karyawan dari HRIS, atau tambah tamu eksternal dengan nama dan email. Peserta yang diundang mendapat
          notifikasi di WOORK.
        </p>
        <div className="mt-3">
          <ParticipantPicker value={participants} onChange={setParticipants} />
        </div>
        {participants.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">Belum ada peserta — Anda tetap bisa membuat meeting dan mengundang nanti.</p>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-slate-800">Pengaturan Meeting</h2>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Password meeting (opsional)</span>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kosongkan bila meeting terbuka untuk yang diundang"
              maxLength={64}
              autoComplete="new-password"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Bila diisi, peserta wajib memasukkan password saat gabung.
            </span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle label="Waiting room" hint="Peserta menunggu persetujuan host sebelum masuk." checked={waitingRoom} onChange={setWaitingRoom} />
            <Toggle label="Mute saat masuk" hint="Mikrofon peserta dimatikan saat pertama masuk." checked={muteOnEntry} onChange={setMuteOnEntry} />
            <Toggle label="Izinkan screen sharing" hint="Peserta boleh membagikan layar mereka." checked={allowScreenShare} onChange={setAllowScreenShare} />
            <Toggle label="Izinkan chat" hint="Peserta boleh mengirim pesan chat di dalam meeting." checked={allowChat} onChange={setAllowChat} />
            <Toggle label="Izinkan recording" hint="Host boleh merekam meeting bila fitur rekaman tersedia." checked={allowRecording} onChange={setAllowRecording} />
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/meet" className="btn-secondary">
          Batal
        </Link>
        <button type="submit" disabled={submitting || !title.trim()} className="btn-primary disabled:opacity-50">
          {submitting ? 'Menyimpan…' : mode === 'now' ? 'Buat Meeting' : 'Jadwalkan Meeting'}
        </button>
      </div>
    </form>
  );
}

/** Kartu hasil setelah meeting berhasil dibuat/dijadwalkan. */
export function CreatedMeetingCard({ meeting, mode }: { meeting: MeetingItem; mode: 'now' | 'scheduled' }) {
  const inviteLink = meetingInviteLink(meeting.id);
  return (
    <Card className="border-green-200 bg-green-50/50">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Video size={16} className="text-green-600" />
        {mode === 'now' ? 'Meeting berhasil dibuat!' : 'Meeting berhasil dijadwalkan!'}
      </h2>
      <p className="mt-1 text-xs text-slate-600">
        {meeting.title} • Meeting ID: <span className="font-mono font-semibold">{shortMeetingId(meeting.id)}</span>
      </p>
      <div className="mt-3">
        <InviteLinkBox link={inviteLink} hint="Bagikan tautan ini ke peserta. Tamu eksternal mendapat tautan tamu dari halaman detail." />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/meet/room/${meeting.id}`} className="btn-primary inline-flex items-center gap-1.5">
          <Video size={15} /> Masuk Room
        </Link>
        <Link href={`/meet/${meeting.id}`} className="btn-secondary">
          Lihat Detail
        </Link>
        <CopyLinkButton link={inviteLink} />
      </div>
    </Card>
  );
}
