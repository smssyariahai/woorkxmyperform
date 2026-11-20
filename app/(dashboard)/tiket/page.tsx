// Halaman Tiket (kantor) — daftar tiket saya (+ semua tiket kantor bagi
// admin), buat tiket baru, detail + balasan. User biasa hanya melihat
// tiket buatannya + yang ditugaskan ke dia (ditegakkan API); admin kantor
// (TIKET_MANAGE) melihat semua tiket kantor + mengubah status/prioritas/
// penugasan. Semua teks Bahasa Indonesia. Tanpa lampiran file di v1.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Ticket as TicketIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Card } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { TicketDetail } from '@/components/tiket/TicketDetail';
import { formatTanggalJam } from '@/lib/pengumuman/client';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  createTicket,
  getTicket,
  listTickets,
  replyTicket,
  updateTicket,
  type MemberItem,
  type TicketCategory,
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

const EMPTY_FORM = {
  title: '',
  category: 'Umum' as TicketCategory,
  priority: 'normal' as TicketPriority,
  description: '',
};

export default function TiketPage() {
  const [items, setItems] = useState<TicketItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<TicketItem | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await listTickets({ status: statusFilter || undefined, q: q || undefined });
      setItems(r.tickets);
      setCanManage(r.canManage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memuat tiket.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const r = await getTicket(id);
      setSelected(r.ticket);
      setMembers(r.members ?? []);
      setCanManage(r.canManage);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat tiket.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.title.trim()) {
      toast.error('Judul tiket wajib diisi.');
      return;
    }
    setCreating(true);
    try {
      const t = await createTicket({
        title: form.title.trim(),
        category: form.category,
        priority: form.priority,
        description: form.description.trim(),
      });
      toast.success('Tiket berhasil dibuat. Admin kantor akan menindaklanjutinya.');
      setForm(EMPTY_FORM);
      setShowForm(false);
      setItems((prev) => [t, ...prev]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuat tiket.');
    } finally {
      setCreating(false);
    }
  }

  async function handleReply(content: string) {
    if (!selected) return;
    const r = await replyTicket(selected.id, content);
    setSelected(r.ticket);
    setItems((prev) => prev.map((t) => (t.id === r.ticket.id ? r.ticket : t)));
    toast.success('Balasan terkirim.');
  }

  async function handleUpdate(input: { status?: TicketStatus; priority?: TicketPriority; assignedToId?: string | null }) {
    if (!selected) return;
    const t = await updateTicket(selected.id, input);
    const detail = await getTicket(selected.id);
    setSelected(detail.ticket);
    setMembers(detail.members ?? []);
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: t.status, priority: t.priority, assignedToId: t.assignedToId, assignedToName: t.assignedToName } : x)));
    toast.success('Tiket diperbarui.');
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Tiket</h1>
          <p className="text-xs text-slate-500">Detail tiket & balasan.</p>
        </div>
        {detailLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <TicketDetail
            ticket={selected}
            canManage={canManage}
            members={members}
            onBack={() => {
              setSelected(null);
              load();
            }}
            onReply={handleReply}
            onUpdate={handleUpdate}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Tiket</h1>
          <p className="text-xs text-slate-500">
            {canManage
              ? 'Semua tiket kantor — buat, balas, dan tangani tiket di sini.'
              : 'Tiket Anda — buat tiket baru bila butuh bantuan, dan pantau balasannya di sini.'}
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={15} /> Buat Tiket
        </button>
      </div>

      {showForm && (
        <Card>
          <h2 className="text-sm font-bold text-slate-800">Buat Tiket Baru</h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Judul *</span>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Contoh: Printer lantai 2 tidak mau menyala"
                maxLength={200}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Kategori</span>
                <select
                  className="input w-full"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as TicketCategory })}
                >
                  {TICKET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Prioritas</span>
                <select
                  className="input w-full"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}
                >
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {TICKET_PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Deskripsi</span>
              <textarea
                className="input w-full resize-y"
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Jelaskan masalahnya sedetail mungkin: apa yang terjadi, sejak kapan, dan langkah yang sudah dicoba."
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setShowForm(false);
                }}
              >
                Batal
              </button>
              <button onClick={handleCreate} disabled={creating || !form.title.trim()} className="btn-primary disabled:opacity-50">
                {creating ? 'Menyimpan…' : 'Kirim Tiket'}
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari judul atau deskripsi tiket…"
            />
          </div>
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua status</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<TicketIcon className="h-7 w-7" />}
            title="Belum ada tiket"
            description="Belum ada tiket yang cocok. Klik “Buat Tiket” untuk membuat tiket pertama."
            action={
              <button className="btn-primary" onClick={() => setShowForm(true)}>
                Buat Tiket
              </button>
            }
          />
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => openDetail(t.id)}
                  className="block w-full rounded-xl border border-slate-200 p-4 text-left hover:border-slate-300 hover:shadow-sm"
                >
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">{t.title}</span>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={STATUS_TONE[t.status] ?? 'gray'}>
                        {TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status}
                      </Badge>
                      <Badge tone={PRIORITY_TONE[t.priority] ?? 'gray'}>
                        {TICKET_PRIORITY_LABEL[t.priority as TicketPriority] ?? t.priority}
                      </Badge>
                      <Badge tone="gray">{t.category}</Badge>
                    </span>
                  </span>
                  <span className="mt-1.5 block text-xs text-slate-500">
                    {t.createdByName}
                    {t.assignedToName ? ` • Ditugaskan ke ${t.assignedToName}` : ' • Belum ditugaskan'} •{' '}
                    {t.replyCount} balasan • {formatTanggalJam(t.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
