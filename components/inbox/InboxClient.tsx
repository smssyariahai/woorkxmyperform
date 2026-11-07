'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn, timeAgo } from '@/lib/utils';
import { channelMeta } from './channel-meta';
import { Avatar, Badge } from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/search';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { ChatThread } from './ChatThread';
import { CustomerPanel } from './CustomerPanel';
import { MessageSquare, Trash2, CheckSquare, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export interface ConversationItem {
  id: string;
  channelType: string;
  status: string;
  assignedTo: string;
  assignee: { id: string; name: string } | null;
  lastMessageAt: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    photoUrl: string | null;
    stage: string;
    unreadCount: number;
    business: string | null;
    interest: string | null;
    budget: string | null;
    score: string | null;
    nextFollowUp: string | null;
  };
  lastMessage: { body: string; senderType: string; createdAt: string } | null;
}

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'unread', label: 'Belum dibaca' },
  { key: 'new', label: 'Baru' },
  { key: 'in_progress', label: 'Proses' },
  { key: 'resolved', label: 'Selesai' },
];

const STATUS_BADGE: Record<string, { label: string; tone: 'blue' | 'amber' | 'green' | 'gray' }> = {
  NEW: { label: 'Baru', tone: 'blue' },
  IN_PROGRESS: { label: 'Proses', tone: 'amber' },
  RESOLVED: { label: 'Selesai', tone: 'green' },
};

export function InboxClient() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('c'));
  const [mobileView, setMobileView] = useState<'list' | 'thread'>(searchParams.get('c') ? 'thread' : 'list');
  const [rtEvent, setRtEvent] = useState<{ type: string; conversationId: string; message?: any } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [refreshingPhotos, setRefreshingPhotos] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('filter', filter);
      if (q.trim()) params.set('q', q.trim());
      const r = await fetch(`/api/conversations?${params}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setItems(j.data);
    } catch (e: any) {
      if (!silent) setError(e.message || 'Gagal memuat percakapan.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => {
    load();
  }, [load]);

  // Tarik foto profil WA pelanggan yang belum ada / sudah lewat 7 hari.
  const refreshPhotos = useCallback(async () => {
    if (refreshingPhotos) return;
    setRefreshingPhotos(true);
    try {
      const r = await fetch('/api/conversations/refresh-photos', { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      const d = j.data;
      if (d.checked === 0) toast.success('Semua foto profil sudah terbaru.');
      else if (d.updated === 0) toast.success(`${d.unavailable} pelanggan tidak punya foto yang bisa diambil (privasi).`);
      else toast.success(`${d.updated} foto diperbarui${d.unavailable ? `, ${d.unavailable} tidak ada foto (privasi)` : ''}.`);
      load(true);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memperbarui foto profil.');
    } finally {
      setRefreshingPhotos(false);
    }
  }, [refreshingPhotos, load]);

  // polling ringan sebagai cadangan bila SSE terputus
  useEffect(() => {
    timer.current = setInterval(() => load(true), 15000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  // real-time via SSE — pesan baru langsung muncul tanpa refresh
  useEffect(() => {
    const es = new EventSource('/api/realtime');
    const onMessage = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        setRtEvent({ type: 'message:new', conversationId: d.conversationId, message: d.message });
        load(true); // segarkan daftar (urutan + unread)
      } catch {}
    };
    const onConv = () => load(true);
    es.addEventListener('message:new', onMessage as EventListener);
    es.addEventListener('conversation:update', onConv);
    // EventSource otomatis reconnect bila koneksi putus
    return () => es.close();
  }, [load]);

  function select(id: string) {
    setSelectedId(id);
    setMobileView('thread');
  }

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (checked.size === items.length && items.length > 0) {
      setChecked(new Set());
    } else {
      setChecked(new Set(items.map((i) => i.id)));
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setChecked(new Set());
  }

  async function deleteOne(id: string, name: string) {
    if (!confirm(`Hapus percakapan dengan ${name}? Semua pesan di dalamnya ikut terhapus.`)) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      if (selectedId === id) setSelectedId(null);
      setChecked((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      load(true);
    } catch (e: any) {
      alert(e.message || 'Gagal menghapus percakapan.');
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelected() {
    if (checked.size === 0) return;
    if (!confirm(`Hapus ${checked.size} percakapan yang dipilih? Semua pesan di dalamnya ikut terhapus.`)) return;
    setDeleting(true);
    try {
      const r = await fetch('/api/conversations/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...checked] }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      if (selectedId && checked.has(selectedId)) setSelectedId(null);
      exitSelectMode();
      load(true);
    } catch (e: any) {
      alert(e.message || 'Gagal menghapus percakapan.');
    } finally {
      setDeleting(false);
    }
  }

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Kolom daftar percakapan */}
      <div
        className={cn(
          'w-full sm:w-[320px] lg:w-[340px] shrink-0 flex-col border-r border-line bg-white dark:bg-slate-900',
          mobileView === 'list' ? 'flex' : 'hidden sm:flex'
        )}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-[15px] font-bold text-ink">Inbox</span>
          <span className="flex items-center gap-2">
            <button
              onClick={refreshPhotos}
              disabled={refreshingPhotos}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="Perbarui foto profil WA pelanggan yang belum ada"
            >
              <RefreshCw className={cn('h-4 w-4', refreshingPhotos && 'animate-spin')} /> Foto
            </button>
            {!selectMode ? (
              <button
                onClick={() => setSelectMode(true)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Pilih percakapan"
              >
                <CheckSquare className="h-4 w-4" /> Pilih
              </button>
            ) : (
              <button
                onClick={exitSelectMode}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" /> Batal
              </button>
            )}
            <Badge tone="green">Woo aktif</Badge>
          </span>
        </div>
        {selectMode && (
          <div className="flex items-center gap-3 px-4 pb-2">
            <label className="inline-flex items-center gap-2 text-[12.5px] font-medium text-ink cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-brand"
                checked={items.length > 0 && checked.size === items.length}
                onChange={toggleSelectAll}
              />
              Pilih semua
            </label>
            <span className="text-[12px] text-muted">{checked.size} dipilih</span>
            <button
              onClick={deleteSelected}
              disabled={checked.size === 0 || deleting}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-danger px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40 transition-opacity"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? 'Menghapus…' : 'Hapus'}
            </button>
          </div>
        )}
        <div className="px-4 pb-2">
          <SearchInput placeholder="Cari nama atau pesan" onChange={setQ} />
        </div>
        <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto" role="tablist" aria-label="Filter percakapan">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors',
                filter === f.key
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-muted hover:text-ink'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading && (
            <div className="space-y-2 px-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3">
                  <Skeleton className="h-10 w-10 !rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && <ErrorState message={error} onRetry={() => load()} />}
          {!loading && !error && items.length === 0 && (
            <EmptyState
              icon={<MessageSquare className="h-7 w-7" />}
              title="Belum ada percakapan"
              description="Percakapan baru dari pelanggan akan muncul di sini."
            />
          )}
          {!loading &&
            !error &&
            items.map((c) => {
              const meta = channelMeta(c.channelType);
              const isWoo = c.assignedTo === 'WOO';
              return (
                <div
                  key={c.id}
                  className={cn(
                    'group flex items-center gap-1 rounded-xl transition-colors',
                    c.id === selectedId
                      ? 'bg-brand-50 dark:bg-brand-900/25'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  )}
                >
                  {selectMode && (
                    <input
                      type="checkbox"
                      className="ml-2 h-4 w-4 shrink-0 rounded accent-brand"
                      checked={checked.has(c.id)}
                      onChange={() => toggleCheck(c.id)}
                      aria-label={`Pilih ${c.customer.name}`}
                    />
                  )}
                  <button
                    onClick={() => select(c.id)}
                    aria-current={c.id === selectedId}
                    className="min-w-0 flex-1 flex gap-3 p-3 text-left"
                  >
                    <span className="relative shrink-0">
                      <Avatar name={c.customer.name} size={42} src={c.customer.photoUrl} />
                      <span
                        className="absolute -bottom-0.5 -right-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded px-0.5 text-[8.5px] font-bold text-white"
                        style={{ background: meta.color, height: 18 }}
                        title={meta.label}
                      >
                        {meta.short}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-ink">{c.customer.name}</span>
                        <span className="shrink-0 text-[11px] text-muted">{timeAgo(c.lastMessageAt)}</span>
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 block truncate text-[12.5px]',
                          c.customer.unreadCount > 0 ? 'font-semibold text-ink' : 'text-muted'
                        )}
                      >
                        {c.lastMessage?.body ?? 'Belum ada pesan'}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1.5">
                        <Badge tone={STATUS_BADGE[c.status]?.tone ?? 'gray'}>
                          {STATUS_BADGE[c.status]?.label ?? c.status}
                        </Badge>
                        <span className="text-[11px] text-muted">
                          {isWoo ? '· Ai-Agent Woork' : c.assignee ? `· ${c.assignee.name}` : '· Tim'}
                        </span>
                        {c.customer.unreadCount > 0 && (
                          <span className="badge-red !px-1.5">{c.customer.unreadCount}</span>
                        )}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => deleteOne(c.id, c.customer.name)}
                    title={`Hapus percakapan dengan ${c.customer.name}`}
                    aria-label={`Hapus ${c.customer.name}`}
                    className="mr-1 shrink-0 rounded-lg p-2 text-muted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 hover:bg-red-50 hover:text-danger dark:hover:bg-red-950/40 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      {/* Kolom chat */}
      <div
        className={cn(
          'min-w-0 flex-1 flex-col bg-canvas',
          mobileView === 'thread' ? 'flex' : 'hidden sm:flex'
        )}
      >
        {selected ? (
          <ChatThread
            key={`thread-${selected.id}`}
            conversationId={selected.id}
            realtimeEvent={rtEvent?.conversationId === selected.id ? rtEvent : null}
            onBack={() => setMobileView('list')}
            onChanged={() => load(true)}
          />
        ) : (
          <div className="hidden sm:flex flex-1 items-center justify-center">
            <EmptyState
              title="Pilih percakapan"
              description="Pilih percakapan dari daftar di sebelah kiri untuk mulai membalas."
            />
          </div>
        )}
      </div>

      {/* Panel kanan */}
      {selected && (
        <div
          className={cn(
            'w-[300px] shrink-0 flex-col border-l border-line bg-white dark:bg-slate-900 overflow-y-auto',
            'hidden xl:flex'
          )}
        >
          <CustomerPanel key={`panel-${selected.id}`} conversationId={selected.id} />
        </div>
      )}
    </div>
  );
}