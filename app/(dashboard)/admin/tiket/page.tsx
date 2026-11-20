// Halaman Tiket — Administrator Pusat. Semua tiket semua kantor, filter
// per kantor / status, balas + ubah status/prioritas/penugasan.
// Dijaga layout app/(dashboard)/admin/layout.tsx (Administrator Pusat /
// pemegang permission platform). Semua teks Bahasa Indonesia.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Ticket as TicketIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Card } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { TicketDetail } from '@/components/tiket/TicketDetail';
import { formatTanggalJam } from '@/lib/pengumuman/client';
import {
  TICKET_PRIORITY_LABEL,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  getAdminTicket,
  listAdminTickets,
  replyAdminTicket,
  updateAdminTicket,
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

export default function AdminTiketPage() {
  const [items, setItems] = useState<TicketItem[]>([]);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<TicketItem | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await listAdminTickets({
        organizationId: orgFilter || undefined,
        status: statusFilter || undefined,
        q: q || undefined,
      });
      setItems(r.tickets);
      setOrganizations(r.organizations);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memuat tiket.');
    } finally {
      setLoading(false);
    }
  }, [orgFilter, statusFilter, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const r = await getAdminTicket(id);
      setSelected(r.ticket);
      setMembers(r.members ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat tiket.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleReply(content: string) {
    if (!selected) return;
    const r = await replyAdminTicket(selected.id, content);
    setSelected(r.ticket);
    setItems((prev) => prev.map((t) => (t.id === r.ticket.id ? r.ticket : t)));
    toast.success('Balasan terkirim.');
  }

  async function handleUpdate(input: { status?: TicketStatus; priority?: TicketPriority; assignedToId?: string | null }) {
    if (!selected) return;
    const t = await updateAdminTicket(selected.id, input);
    const detail = await getAdminTicket(selected.id);
    setSelected(detail.ticket);
    setMembers(detail.members ?? []);
    setItems((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? { ...x, status: t.status, priority: t.priority, assignedToId: t.assignedToId, assignedToName: t.assignedToName }
          : x
      )
    );
    toast.success('Tiket diperbarui.');
  }

  const openCount = items.filter((t) => t.status === 'TERBUKA' || t.status === 'DIPROSES' || t.status === 'MENUNGGU_BALASAN').length;

  if (selected) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Tiket — Administrator Pusat</h1>
          <p className="text-xs text-slate-500">
            {selected.organizationName ?? ''} • Detail tiket & balasan.
          </p>
        </div>
        {detailLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <TicketDetail
            ticket={selected}
            canManage
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
      <div>
        <h1 className="text-lg font-bold text-slate-800">Tiket — Administrator Pusat</h1>
        <p className="text-xs text-slate-500">
          Semua tiket semua kantor. {openCount > 0 ? `${openCount} tiket masih terbuka.` : 'Tidak ada tiket yang masih terbuka.'}
        </p>
      </div>

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
          <select className="input" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
            <option value="">Semua kantor</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
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
            description="Belum ada tiket yang cocok dengan filter ini."
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
                    {t.organizationName} • {t.createdByName}
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
