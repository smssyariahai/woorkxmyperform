// Detail meeting — info, peserta, agenda, notulen, undang, edit, batalkan.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Clock,
  Link2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Card } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { formatTanggal, formatTanggalJam } from '@/lib/pengumuman/client';
import { CopyLinkButton, InviteLinkBox } from '@/components/meet/CopyLinkButton';
import { ParticipantPicker } from '@/components/meet/ParticipantPicker';
import { MEETING_STATUS_TONE } from '@/components/meet/MeetingCard';
import {
  MEETING_STATUS_LABEL,
  MEETING_TYPE_LABEL,
  PARTICIPANT_ROLE_LABEL,
  PARTICIPANT_STATUS_LABEL,
  addAgenda,
  addNote,
  addParticipants,
  cancelMeeting,
  formatDurasi,
  getMeeting,
  inviteMeeting,
  meetingInviteLink,
  shortMeetingId,
  updateMeeting,
  type MeetingAgendaItem,
  type MeetingItem,
  type MeetingNoteItem,
  type MeetingParticipantItem,
  type SelectedParticipant,
} from '@/components/meet/client';

const PARTICIPANT_STATUS_TONE: Record<string, 'green' | 'amber' | 'blue' | 'red' | 'gray'> = {
  INVITED: 'blue',
  ACCEPTED: 'green',
  DECLINED: 'red',
  TENTATIVE: 'amber',
  ATTENDED: 'green',
  ABSENT: 'gray',
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MeetDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const id = params.id;
  const [meeting, setMeeting] = useState<MeetingItem | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipantItem[]>([]);
  const [agenda, setAgenda] = useState<MeetingAgendaItem[]>([]);
  const [notes, setNotes] = useState<MeetingNoteItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showInvite, setShowInvite] = useState(false);
  const [invitees, setInvitees] = useState<SelectedParticipant[]>([]);
  const [inviting, setInviting] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [agendaTitle, setAgendaTitle] = useState('');
  const [agendaDesc, setAgendaDesc] = useState('');
  const [addingAgenda, setAddingAgenda] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await getMeeting(id);
      setMeeting(r.meeting);
      setParticipants(r.participants);
      setAgenda(r.agenda);
      setNotes(r.notes);
      setCanManage(Boolean(r.canManage || r.canEdit || r.isHost));
      setIsHost(Boolean(r.isHost));
      setEditTitle(r.meeting.title);
      setEditDesc(r.meeting.description ?? '');
      setEditStart(toLocalInput(r.meeting.startsAt));
      setEditEnd(r.meeting.endsAt ? toLocalInput(r.meeting.endsAt) : '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memuat detail meeting.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = canManage || isHost;
  const canJoin = meeting?.status === 'SCHEDULED' || meeting?.status === 'ONGOING';

  async function handleInvite() {
    if (!meeting) return;
    if (invitees.length === 0) {
      toast.error('Pilih dulu peserta yang mau diundang.');
      return;
    }
    setInviting(true);
    try {
      const added = await addParticipants(meeting.id, invitees);
      if (added.length > 0) setParticipants((prev) => [...prev, ...added]);
      // Kirim ulang undangan (fan-out notifikasi + pastikan token tamu) ke
      // peserta yang baru ditambahkan. Link undangan per peserta ada di
      // invitations; kotak tautan halaman tetap memakai link room.
      await inviteMeeting(
        meeting.id,
        added.map((a) => a.id)
      ).catch(() => null);
      toast.success(`${invitees.length} peserta berhasil diundang.`);
      setInvitees([]);
      setShowInvite(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengundang peserta.');
    } finally {
      setInviting(false);
    }
  }

  async function handleSaveEdit() {
    if (!meeting) return;
    if (!editTitle.trim()) {
      toast.error('Nama meeting wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateMeeting(meeting.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || undefined,
        startsAt: editStart ? new Date(editStart).toISOString() : undefined,
        endsAt: editEnd ? new Date(editEnd).toISOString() : undefined,
      });
      setMeeting(updated);
      setShowEdit(false);
      toast.success('Meeting berhasil diperbarui.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui meeting.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!meeting) return;
    setCancelling(true);
    try {
      const updated = await cancelMeeting(meeting.id);
      setMeeting(updated);
      setConfirmCancel(false);
      toast.success('Meeting dibatalkan.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal membatalkan meeting.');
    } finally {
      setCancelling(false);
    }
  }

  async function handleAddAgenda() {
    if (!meeting) return;
    if (!agendaTitle.trim()) {
      toast.error('Judul agenda wajib diisi.');
      return;
    }
    setAddingAgenda(true);
    try {
      const item = await addAgenda(meeting.id, {
        title: agendaTitle.trim(),
        description: agendaDesc.trim() || undefined,
      });
      setAgenda((prev) => [...prev, item]);
      setAgendaTitle('');
      setAgendaDesc('');
      toast.success('Agenda ditambahkan.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menambahkan agenda.');
    } finally {
      setAddingAgenda(false);
    }
  }

  async function handleAddNote() {
    if (!meeting) return;
    if (!noteContent.trim()) {
      toast.error('Isi notulen wajib diisi.');
      return;
    }
    setAddingNote(true);
    try {
      const item = await addNote(meeting.id, noteContent.trim());
      setNotes((prev) => [item, ...prev]);
      setNoteContent('');
      toast.success('Notulen ditambahkan.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menambahkan notulen.');
    } finally {
      setAddingNote(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Detail Meeting</h1>
        </div>
        <ErrorState message={error || 'Meeting tidak ditemukan.'} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <button onClick={() => router.push('/meet')} className="text-xs font-medium text-slate-500 hover:underline">
            ← Kembali ke WOORK MEET
          </button>
          <h1 className="mt-1 text-lg font-bold text-slate-800">{meeting.title}</h1>
          <p className="text-xs text-slate-500">
            ID: {shortMeetingId(meeting.id)} • {MEETING_TYPE_LABEL[meeting.meetingType] ?? meeting.meetingType}
            {meeting.hostName ? ` • Host: ${meeting.hostName}` : ''}
          </p>
        </div>
        <Badge tone={MEETING_STATUS_TONE[meeting.status] ?? 'gray'}>
          {MEETING_STATUS_LABEL[meeting.status] ?? meeting.status}
        </Badge>
      </div>

      <Card>
        <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <p className="flex items-center gap-2">
            <CalendarDays size={15} className="shrink-0 text-slate-400" />
            {formatTanggalJam(meeting.startsAt)}
          </p>
          <p className="flex items-center gap-2">
            <Clock size={15} className="shrink-0 text-slate-400" />
            Durasi: {formatDurasi(meeting.startsAt, meeting.endsAt)}
            {meeting.timezone ? ` • ${meeting.timezone}` : ''}
          </p>
          <p className="flex items-center gap-2">
            <Users size={15} className="shrink-0 text-slate-400" />
            {participants.length} peserta
          </p>
          <p className="flex items-center gap-2">
            <ShieldCheck size={15} className="shrink-0 text-slate-400" />
            {[
              meeting.waitingRoom ? 'Waiting room aktif' : 'Tanpa waiting room',
              meeting.hasPassword || meeting.passwordProtected ? 'Ber-password' : 'Tanpa password',
              meeting.muteOnEntry ? 'Mute saat masuk' : null,
            ]
              .filter(Boolean)
              .join(' • ')}
          </p>
        </div>
        {meeting.description && <p className="mt-3 text-sm text-slate-600">{meeting.description}</p>}

        <div className="mt-4">
          <InviteLinkBox link={meetingInviteLink(meeting.id)} hint="Bagikan tautan ini ke peserta yang diundang." />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canJoin && (
            <Link href={`/meet/room/${meeting.id}`} className="btn-primary inline-flex items-center gap-1.5">
              <Video size={15} /> Join / Masuk Room
            </Link>
          )}
          <CopyLinkButton link={meetingInviteLink(meeting.id)} label="Salin Link Undangan" />
          {canEdit && meeting.status !== 'CANCELLED' && meeting.status !== 'COMPLETED' && (
            <>
              <button onClick={() => setShowEdit((v) => !v)} className="btn-secondary inline-flex items-center gap-1.5">
                <Pencil size={14} /> Edit
              </button>
              {!confirmCancel ? (
                <button onClick={() => setConfirmCancel(true)} className="btn-secondary inline-flex items-center gap-1.5 !text-red-600">
                  <Trash2 size={14} /> Batalkan
                </button>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs">
                  <span className="font-medium text-red-700">Batalkan meeting ini?</span>
                  <button onClick={handleCancel} disabled={cancelling} className="font-bold text-red-700 underline disabled:opacity-50">
                    {cancelling ? 'Membatalkan…' : 'Ya, batalkan'}
                  </button>
                  <button onClick={() => setConfirmCancel(false)} className="font-medium text-slate-600 underline">
                    Tidak
                  </button>
                </span>
              )}
            </>
          )}
        </div>

        {showEdit && canEdit && (
          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Nama meeting *</span>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={200} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Deskripsi</span>
              <textarea className="input w-full resize-y" rows={2} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Mulai</span>
                <Input type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Selesai</span>
                <Input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setShowEdit(false)}>
                Batal
              </button>
              <button onClick={handleSaveEdit} disabled={saving || !editTitle.trim()} className="btn-primary disabled:opacity-50">
                {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Peserta ({participants.length})</h2>
          {canEdit && meeting.status !== 'CANCELLED' && (
            <button onClick={() => setShowInvite((v) => !v)} className="btn-secondary inline-flex items-center gap-1.5 !py-1.5 !px-3 text-xs">
              <Plus size={14} /> Undang Peserta
            </button>
          )}
        </div>

        {showInvite && canEdit && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <ParticipantPicker value={invitees} onChange={setInvitees} />
            <div className="mt-2 flex justify-end gap-2">
              <button className="btn-secondary !py-1.5 !px-3 text-xs" onClick={() => setShowInvite(false)}>
                Batal
              </button>
              <button onClick={handleInvite} disabled={inviting || invitees.length === 0} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50">
                {inviting ? 'Mengundang…' : 'Kirim Undangan'}
              </button>
            </div>
          </div>
        )}

        {participants.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">Belum ada peserta. Undang karyawan atau tamu eksternal.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {participants.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {[p.position, p.department, p.branch].filter(Boolean).join(' • ') || p.email || 'Tamu eksternal'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Badge tone="gray">{PARTICIPANT_ROLE_LABEL[p.role] ?? p.role}</Badge>
                  <Badge tone={PARTICIPANT_STATUS_TONE[p.status] ?? 'gray'}>
                    {PARTICIPANT_STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-bold text-slate-800">Agenda</h2>
          {agenda.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Belum ada agenda. Tambahkan poin agenda di bawah.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {agenda.map((a, i) => (
                <li key={a.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-800">
                    {i + 1}. {a.title}
                    {a.durationMinutes ? <span className="ml-2 text-xs font-normal text-slate-500">({a.durationMinutes} mnt)</span> : null}
                  </p>
                  {a.description && <p className="mt-1 text-xs text-slate-600">{a.description}</p>}
                </li>
              ))}
            </ol>
          )}
          {canEdit && (
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <Input value={agendaTitle} onChange={(e) => setAgendaTitle(e.target.value)} placeholder="Judul agenda baru…" maxLength={200} />
              <Input value={agendaDesc} onChange={(e) => setAgendaDesc(e.target.value)} placeholder="Keterangan (opsional)" maxLength={500} />
              <button onClick={handleAddAgenda} disabled={addingAgenda || !agendaTitle.trim()} className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-50">
                {addingAgenda ? 'Menambahkan…' : '+ Tambah Agenda'}
              </button>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-bold text-slate-800">Notulen</h2>
          {notes.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Belum ada notulen. Tulis hasil dan keputusan meeting di bawah.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm text-slate-700">{n.content}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {n.authorName ?? '—'} • {formatTanggal(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            <textarea
              className="input w-full resize-y"
              rows={3}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Tulis notulen baru…"
            />
            <button onClick={handleAddNote} disabled={addingNote || !noteContent.trim()} className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-50">
              {addingNote ? 'Menyimpan…' : '+ Tambah Notulen'}
            </button>
          </div>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link2 size={13} /> Tautan undangan: {meetingInviteLink(meeting.id)}
      </p>
    </div>
  );
}
