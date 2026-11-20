'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/primitives';
import { Skeleton, ErrorState } from '@/components/ui/states';
import { channelMeta } from './channel-meta';
import { TemplatePicker } from './TemplatePicker';
import { TemplateManager } from './TemplateManager';
import { ArrowLeft, Send, Settings2, Sparkles, AlertTriangle, RotateCcw, Bot } from 'lucide-react';

interface Message {
  id: string;
  senderType: string;
  sender: { name: string } | null;
  body: string;
  createdAt: string;
  messageType?: string | null;
  metadata?: string | null;
  waSent?: boolean;
  waError?: string | null;
}

function waFailed(m: Message): boolean {
  if (m.waSent === false) return true;
  try {
    const meta = m.metadata ? JSON.parse(m.metadata) : null;
    return meta?.sentVia === 'whatsapp_failed';
  } catch { return false; }
}

interface Detail {
  id: string;
  assignedTo: string;
  status: string;
  botEnabled: boolean;
  assignee: { name: string } | null;
  channelType: string;
  customer: { name: string; stage: string };
}

export function ChatThread({
  conversationId,
  realtimeEvent,
  onBack,
  onChanged,
}: {
  conversationId: string;
  realtimeEvent: { type: string; conversationId: string; message?: Message } | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError('');
      }
      try {
        const r = await fetch(`/api/conversations/${conversationId}`);
        const j = await r.json();
        if (!j.success) throw new Error(j.message);
        setDetail({
          id: j.data.id,
          assignedTo: j.data.assignedTo,
          status: j.data.status,
          botEnabled: j.data.botEnabled ?? true,
          assignee: j.data.assignee,
          channelType: j.data.channelType,
          customer: j.data.customer,
        });
        setMessages(Array.isArray(j.data.messages) ? j.data.messages : []);
      } catch (e: any) {
        if (!silent) setError(e.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [conversationId]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // pesan baru via SSE langsung ditambahkan ke room chat (anti-duplikat)
  useEffect(() => {
    if (!realtimeEvent || realtimeEvent.type !== 'message:new' || !realtimeEvent.message) return;
    const msg = realtimeEvent.message;
    setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
  }, [realtimeEvent]);

  const [botBusy, setBotBusy] = useState(false);
  async function toggleBot() {
    if (botBusy || !detail) return;
    setBotBusy(true);
    try {
      const r = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botEnabled: !detail.botEnabled }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setDetail({ ...detail, botEnabled: j.data.botEnabled });
      toast.success(`Bot ${j.data.botEnabled ? 'diaktifkan' : 'dinonaktifkan'} untuk percakapan ini.`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah bot.');
    } finally {
      setBotBusy(false);
    }
  }

  const sendingRef = useRef(false);
  async function send(asWoo = false) {
    const body = draft.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, asWoo }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      // anti-duplikat: event SSE message:new bisa tiba sebelum respons ini
      setMessages((m) => (m.some((x) => x.id === j.data.id) ? m : [...m, j.data]));
      setDraft('');
      onChanged();
      if (j.data.waSent === false) {
        toast.warning(j.data.waError || 'Pesan tersimpan, tetapi GAGAL terkirim ke WhatsApp. Coba kirim ulang.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengirim pesan.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  /** Kirim ulang pesan yang gagal terkirim ke WhatsApp. */
  async function retrySend(m: Message) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/messages/${m.id}/retry`, { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setMessages((msgs) => msgs.map((x) => (x.id === m.id ? { ...x, ...j.data } : x)));
      if (j.data.waSent === false) {
        toast.warning(j.data.waError || 'Masih gagal terkirim ke WhatsApp.');
      } else {
        toast.success('Pesan berhasil dikirim ke WhatsApp.');
      }
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengirim ulang.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function setStatus(status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED') {
    if (!detail) return;
    try {
      const r = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      const label = status === 'NEW' ? 'Baru' : status === 'IN_PROGRESS' ? 'Proses' : 'Selesai';
      toast.success(`Status diubah menjadi ${label}.`);
      await load(true);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status.');
    }
  }

  async function toggleAssign() {
    if (!detail || takingOver) return;
    setTakingOver(true);
    try {
      const to = detail.assignedTo === 'WOO' ? 'team' : 'woo';
      const r = await fetch(`/api/conversations/${conversationId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(to === 'team' ? 'Anda mengambil alih percakapan.' : 'Dikembalikan ke Woo.');
      await load(true);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah assignment.');
    } finally {
      setTakingOver(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-20 w-2/3" />
        <Skeleton className="h-16 w-1/2 self-end" />
        <Skeleton className="h-20 w-2/3" />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ErrorState message={error} onRetry={() => load()} />
      </div>
    );
  }

  const meta = channelMeta(detail.channelType);
  const isWoo = detail.assignedTo === 'WOO';

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line bg-white dark:bg-slate-900 px-4 py-3 shrink-0">
        <button className="btn-ghost !px-2 sm:hidden" onClick={onBack} aria-label="Kembali ke daftar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate text-[15px] font-bold text-ink">{detail.customer.name}</h2>
            {isWoo && (
              <span
                className="shrink-0"
                title="Woo AI-Agent adalah asisten AI WOORK yang ditugaskan menangani percakapan ini."
              >
                <Badge tone="green" className="shrink-0 whitespace-nowrap">
                  Woo AI-Agent
                </Badge>
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted">
            {meta.label}, tahap {detail.customer.stage}
            {detail.assignee ? ` · ditangani ${detail.assignee.name}` : ''}
          </p>
        </div>
        <button
          onClick={toggleBot}
          disabled={botBusy}
          title={detail.botEnabled ? 'Nonaktifkan bot di percakapan ini' : 'Aktifkan bot di percakapan ini'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-btn border px-3 py-2 text-[13px] font-semibold transition-colors',
            detail.botEnabled
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20'
              : 'border-line text-muted hover:border-brand/40'
          )}
        >
          <Bot className="h-4 w-4" />
          <span className="hidden sm:inline">Bot {detail.botEnabled ? 'ON' : 'OFF'}</span>
        </button>
        <select
          value={detail.status}
          onChange={(e) => setStatus(e.target.value as 'NEW' | 'IN_PROGRESS' | 'RESOLVED')}
          className="input !w-auto !py-2 text-[13px] font-medium"
          title="Ubah status percakapan"
        >
          <option value="NEW">Baru</option>
          <option value="IN_PROGRESS">Proses</option>
          <option value="RESOLVED">Selesai</option>
        </select>
        <button
          className={isWoo ? 'btn-secondary !py-2 text-[13px]' : 'btn-primary !py-2 text-[13px]'}
          onClick={toggleAssign}
          disabled={takingOver}
        >
          {takingOver ? 'Memproses…' : isWoo ? 'Ambil alih' : 'Kembalikan ke Woo'}
        </button>
      </div>

      {/* Pesan */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 space-y-3" aria-live="polite">
        {messages.map((m) => {
          if (m.senderType === 'SYSTEM') {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="badge-green !py-1 !px-3.5 !text-[12px]">{m.body}</span>
              </div>
            );
          }
          const mine = m.senderType === 'AGENT' || m.senderType === 'WOO';
          return (
            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[78%] sm:max-w-[68%] rounded-2xl px-4 py-2.5 shadow-sm',
                  mine
                    ? 'bg-brand-50 dark:bg-brand-900/30 rounded-br-md'
                    : 'bg-white dark:bg-slate-800 rounded-bl-md border border-line/60'
                )}
              >
                {(() => {
                  try {
                    const meta = m.metadata ? JSON.parse(m.metadata) : null;
                    if (m.messageType === 'IMAGE' && meta?.imageUrl) {
                      return (
                        <a href={meta.imageUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={meta.imageUrl}
                            alt="Gambar"
                            className="max-w-full rounded-xl mb-1.5 cursor-zoom-in"
                            style={{ maxHeight: 280 }}
                            loading="lazy"
                          />
                        </a>
                      );
                    }
                  } catch {}
                  return null;
                })()}
                {m.body ? (
                  <p className="text-[13.5px] text-ink whitespace-pre-wrap break-words">{m.body}</p>
                ) : null}
                <p className="mt-1 text-[10.5px] text-muted text-right">
                  {mine ? ((m.senderType === 'WOO' ? 'Woo AI-Agent' : m.sender?.name) ?? 'Tim') + ', ' : ''}
                  {new Date(m.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}
                </p>
                {mine && waFailed(m) && (
                  <div className="mt-1.5 flex items-center justify-end gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-danger">
                      <AlertTriangle className="h-3 w-3" /> Tidak terkirim ke WhatsApp
                    </span>
                    <button
                      onClick={() => retrySend(m)}
                      disabled={sending}
                      className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-semibold text-danger hover:bg-danger/20 transition-colors disabled:opacity-40"
                    >
                      <RotateCcw className="h-3 w-3" /> Kirim ulang
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-line bg-white dark:bg-slate-900 px-4 py-3 shrink-0">
        <div className="flex flex-wrap gap-2 mb-2.5">
          <TemplatePicker
            customerName={detail.customer.name}
            onPick={(body) => setDraft((d) => (d ? d.replace(/\s+$/, '') + '\n' : '') + body)}
          />
          <button
            onClick={() => setManageOpen(true)}
            className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-muted hover:text-brand hover:border-brand/40 transition-colors inline-flex items-center gap-1.5"
            title="Kelola template balasan"
          >
            <Settings2 className="h-3.5 w-3.5" /> Kelola template
          </button>
          {isWoo && (
            <button
              onClick={() => send(true)}
              disabled={!draft.trim() || sending}
              className="rounded-full border border-dashed border-muted/50 px-3.5 py-1.5 text-[12.5px] font-medium text-muted hover:text-brand hover:border-brand/40 transition-colors inline-flex items-center gap-1.5"
              title="Kirim sebagai Woo (AI)"
            >
              <Sparkles className="h-3.5 w-3.5" /> Balas sebagai Woo
            </button>
          )}
        </div>
        <div className="flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(false);
              }
            }}
            placeholder={isWoo ? 'Woo yang membalas. Pilih "Ambil alih" untuk membalas sendiri.' : 'Tulis pesan… (Shift+Enter baris baru)'}
            className="input flex-1 resize-none"
            rows={1}
            aria-label="Tulis pesan"
            disabled={sending}
          />
          <button
            onClick={() => send(false)}
            disabled={!draft.trim() || sending}
            className="btn-primary shrink-0"
            aria-label="Kirim pesan"
          >
            {sending ? '…' : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Kirim</span>
          </button>
        </div>
      </div>

      <TemplateManager open={manageOpen} onClose={() => setManageOpen(false)} />
    </>
  );
}
