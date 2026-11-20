// Komponen detail tiket — dipakai halaman /tiket (kantor) dan /admin/tiket
// (Administrator Pusat). Semua teks Bahasa Indonesia. Balasan + ubah
// status/prioritas/penugasan lewat callback yang dioper halaman (helper
// lib/tiket/client.ts), bukan fetch mentah.
'use client';

import { useState } from 'react';
import { ArrowLeft, Send, User } from 'lucide-react';
import { Badge, Card } from '@/components/ui/primitives';
import { formatTanggalJam } from '@/lib/pengumuman/client';
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  type MemberItem,
  type TicketItem,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/tiket/client';

const STATUS_TONE: Record<string, 'green' | 'amber' | 'blue' | 'gray'> = {
  TERBUKA: 'blue',
  DIPROSES: 'amber',
  MENUNGGU_BALASAN: 'amber',
  SELESAI: 'green',
  DITUTUP: 'gray',
};

const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'gray'> = {
  mendesak: 'red',
  tinggi: 'amber',
  rendah: 'gray',
  normal: 'gray',
};

export function TicketDetail({
  ticket,
  canManage,
  members,
  onBack,
  onReply,
  onUpdate,
}: {
  ticket: TicketItem;
  canManage: boolean;
  members?: MemberItem[];
  onBack: () => void;
  onReply: (content: string) => Promise<void>;
  onUpdate: (input: { status?: TicketStatus; priority?: TicketPriority; assignedToId?: string | null }) => Promise<void>;
}) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  async function handleReply() {
    const content = reply.trim();
    if (!content) return;
    setSending(true);
    setError('');
    try {
      await onReply(content);
      setReply('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal mengirim balasan.');
    } finally {
      setSending(false);
    }
  }

  async function handleUpdate(input: { status?: TicketStatus; priority?: TicketPriority; assignedToId?: string | null }) {
    setUpdating(true);
    setError('');
    try {
      await onUpdate(input);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah tiket.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="btn-secondary inline-flex items-center gap-1.5">
        <ArrowLeft size={15} /> Kembali ke daftar
      </button>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-800">{ticket.title}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Dibuat oleh {ticket.createdByName}
              {ticket.organizationName ? ` • ${ticket.organizationName}` : ''} •{' '}
              {formatTanggalJam(ticket.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={STATUS_TONE[ticket.status] ?? 'gray'}>
              {TICKET_STATUS_LABEL[ticket.status as TicketStatus] ?? ticket.status}
            </Badge>
            <Badge tone={PRIORITY_TONE[ticket.priority] ?? 'gray'}>
              {TICKET_PRIORITY_LABEL[ticket.priority as TicketPriority] ?? ticket.priority}
            </Badge>
            <Badge tone="gray">{ticket.category}</Badge>
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">
          {ticket.description || '(Tidak ada deskripsi.)'}
        </p>

        <p className="mt-3 text-xs text-slate-500">
          Ditugaskan ke: <span className="font-medium text-slate-700">{ticket.assignedToName ?? 'Belum ditugaskan'}</span>
        </p>

        {canManage && (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
              <select
                className="input w-full"
                value={ticket.status}
                disabled={updating}
                onChange={(e) => handleUpdate({ status: e.target.value as TicketStatus })}
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TICKET_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Prioritas</span>
              <select
                className="input w-full"
                value={ticket.priority}
                disabled={updating}
                onChange={(e) => handleUpdate({ priority: e.target.value as TicketPriority })}
              >
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TICKET_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Ditugaskan ke</span>
              <select
                className="input w-full"
                value={ticket.assignedToId ?? ''}
                disabled={updating}
                onChange={(e) => handleUpdate({ assignedToId: e.target.value === '' ? null : e.target.value })}
              >
                <option value="">Belum ditugaskan</option>
                {(members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
      </Card>

      <Card>
        <h3 className="text-sm font-bold text-slate-800">Balasan ({ticket.replies?.length ?? ticket.replyCount})</h3>
        {(ticket.replies ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Belum ada balasan.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {ticket.replies!.map((r) => (
              <li key={r.id} className="rounded-xl bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <User size={13} className="text-slate-400" /> {r.authorName}
                  <span className="font-normal text-slate-400">• {formatTanggalJam(r.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.content}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="balasan-tiket">
            Tulis balasan
          </label>
          <textarea
            id="balasan-tiket"
            className="input w-full"
            rows={3}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Tulis balasan Anda di sini…"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleReply}
              disabled={sending || !reply.trim()}
              className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send size={15} /> {sending ? 'Mengirim…' : 'Kirim Balasan'}
            </button>
          </div>
          {ticket.status === 'SELESAI' || ticket.status === 'DITUTUP' ? (
            <p className="mt-2 text-xs text-slate-500">
              Tiket ini sudah {ticket.status === 'SELESAI' ? 'selesai' : 'ditutup'} — balasan tidak mengubah statusnya.
              {canManage ? ' Buka kembali lewat pilihan Status di atas bila perlu.' : ''}
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
