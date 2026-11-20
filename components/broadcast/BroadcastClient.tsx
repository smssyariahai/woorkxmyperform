'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';
import { Modal } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/search';
import { formatDateTime, cn } from '@/lib/utils';
import { Plus, Megaphone, Send, Check, Trash2, X, ImagePlus, Eye } from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  channelType: string;
  message: string;
  status: string;
  scheduledAt: string | null;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  createdBy: { name: string };
  createdAt: string;
  _count: { recipients: number };
}

const STEPS = ['Info campaign', 'Channel', 'Audience', 'Pesan', 'Jadwal', 'Review'];

const STATUS_TONE: Record<string, 'gray' | 'amber' | 'blue' | 'green'> = {
  DRAFT: 'gray',
  SCHEDULED: 'amber',
  SENDING: 'blue',
  SENT: 'green',
};

export function BroadcastClient() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [channelType, setChannelType] = useState('WHATSAPP');
  const [audience, setAudience] = useState('inbox_all');
  const [contacts, setContacts] = useState<{ id: string; name: string; phone: string | null; lastChat: string | null }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactQ, setContactQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/campaigns?page=${page}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setItems(j.data.items);
      setTotalPages(j.data.totalPages);
    } catch (e: any) {
      if (!silent) setError(e.message || 'Gagal memuat campaign.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  // Polling otomatis tanpa refresh manual:
  // - SENDING/SCHEDULED: tiap 4 detik (status pengiriman)
  // - SENT dengan bacaan belum lengkap: tiap 10 detik (angka "dibaca")
  const hasSending = items.some((c) => c.status === 'SENDING' || c.status === 'SCHEDULED');
  const hasPendingReads = items.some(
    (c) => c.status === 'SENT' && c.sentCount > 0 && c.readCount < c.sentCount
  );
  useEffect(() => {
    if (!hasSending && !hasPendingReads) return;
    const t = setInterval(() => load(true), hasSending ? 4000 : 10000);
    return () => clearInterval(t);
  }, [hasSending, hasPendingReads, load]);

  function validStep(): boolean {
    if (step === 0) return name.trim().length >= 3;
    if (step === 2 && audience === 'inbox_selected') return picked.size > 0;
    if (step === 3) return message.trim().length > 0;
    return true;
  }

  async function submit() {
    setBusy(true);
    try {
      const r = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          channelType,
          message: message.trim(),
          scheduledAt: scheduledAt || null,
          audience, customerIds: audience === 'inbox_selected' ? [...picked] : undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      // Upload poster bila ada
      if (imageFile) {
        const fd = new FormData();
        fd.append('image', imageFile);
        const ru = await fetch(`/api/campaigns/${j.data.id}/image`, { method: 'POST', body: fd });
        const ju = await ru.json();
        if (!ju.success) toast.warning(`Campaign dibuat, tetapi poster gagal diunggah: ${ju.message}`);
      }
      toast.success(`Campaign dibuat (${j.data._count.recipients} penerima).`);
      setWizard(false);
      setStep(0);
      setName(''); setMessage(''); setScheduledAt(''); setAudience('inbox_all'); setPicked(new Set()); setContacts([]); setContactQ('');
      setImageFile(null); setImagePreview(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal membuat campaign.');
    } finally {
      setBusy(false);
    }
  }

  async function loadContacts(q = '') {
    setContactsLoading(true);
    try {
      const r = await fetch(`/api/campaigns/audience-contacts?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (j.success) setContacts(j.data);
    } finally {
      setContactsLoading(false);
    }
  }

  function pickAudience(key: string) {
    setAudience(key);
    if (key === 'inbox_selected' && contacts.length === 0) loadContacts();
  }

  /** Variabel {{...}} yang tidak dikenali (selain {{nama}}) */
  function unknownVars(text: string): string[] {
    const found = [...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1].toLowerCase());
    return [...new Set(found)].filter((v) => v !== 'nama');
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendNow(c: Campaign) {
    if (!confirm(`Kirim "${c.name}" ke ${c._count.recipients} penerima sekarang?`)) return;
    setSendingId(c.id);
    try {
      const r = await fetch(`/api/campaigns/${c.id}/send`, { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Pengiriman dimulai — pesan dikirim satu per satu via WhatsApp.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengirim.');
    } finally {
      setSendingId(null);
    }
  }

  async function openDetail(c: Campaign) {
    setDetailLoading(true);
    setDetail({ ...c, _loading: true });
    try {
      const r = await fetch(`/api/campaigns/${c.id}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setDetail(j.data);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat detail.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function removeCampaign(c: Campaign) {
    if (!confirm(`Hapus broadcast "${c.name}"? Data campaign dan daftar penerimanya akan dihapus permanen.`)) return;
    try {
      const r = await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Broadcast dihapus.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus.');
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Broadcast</h1>
          <p className="text-sm text-muted">Kirim pesan massal ke pelanggan via WhatsApp & channel lainnya.</p>
        </div>
        <Button onClick={() => { setWizard(true); setStep(0); }}>
          <Plus className="h-4 w-4" /> Buat Broadcast
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <div className="card"><ErrorState message={error} onRetry={load} /></div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Megaphone className="h-7 w-7" />}
            title="Belum ada campaign"
            description="Buat campaign broadcast pertama Anda untuk menjangkau banyak pelanggan sekaligus."
            action={<Button onClick={() => { setWizard(true); setStep(0); }}><Plus className="h-4 w-4" /> Buat Broadcast</Button>}
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nama Campaign</th>
                <th>Channel</th>
                <th>Audience</th>
                <th>Status</th>
                <th>Terkirim</th>
                <th>Dibuat</th>
                <th className="!text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button onClick={() => openDetail(c)} className="block font-semibold text-ink hover:text-brand text-left">
                      {c.name}
                    </button>
                    <span className="block text-[12px] text-muted">oleh {c.createdBy.name}</span>
                  </td>
                  <td><Badge tone="blue">{c.channelType}</Badge></td>
                  <td className="text-[13px]">{c._count.recipients} penerima</td>
                  <td>
                    <Badge tone={STATUS_TONE[c.status] ?? 'gray'}>
                      {c.status === 'DRAFT' ? 'Draft' : c.status === 'SCHEDULED' ? 'Terjadwal' : c.status === 'SENDING' ? 'Mengirim…' : c.status === 'SENT' ? 'Terkirim' : c.status}
                    </Badge>
                    {c.scheduledAt && c.status === 'SCHEDULED' && (
                      <span className="block text-[11.5px] text-muted mt-0.5">{formatDateTime(c.scheduledAt)}</span>
                    )}
                  </td>
                  <td className="text-[13px]">
                    {c.sentCount} <span className="text-muted">/ dibaca {c.readCount}</span>
                  </td>
                  <td className="text-[13px] text-muted">{formatDateTime(c.createdAt)}</td>
                  <td className="!text-right">
                    <span className="inline-flex items-center gap-2">
                      {['DRAFT', 'SCHEDULED'].includes(c.status) ? (
                        <button
                          className="btn-primary !py-1.5 !px-3 text-[12.5px]"
                          onClick={() => sendNow(c)}
                          disabled={sendingId === c.id}
                        >
                          <Send className="h-3.5 w-3.5" />
                          {sendingId === c.id ? 'Mengirim…' : 'Kirim'}
                        </button>
                      ) : c.status === 'SENDING' ? (
                        <span className="text-[12px] font-medium text-blue-600">Mengirim…</span>
                      ) : (
                        <span className="text-[12px] text-muted">Selesai</span>
                      )}
                      {c.status !== 'SENDING' && (
                        <button
                          className="inline-flex items-center justify-center rounded-btn p-2 text-muted transition-colors hover:bg-red-50 hover:text-danger"
                          onClick={() => removeCampaign(c)}
                          title="Hapus broadcast"
                          aria-label={`Hapus ${c.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </div>
      )}

      <Modal open={wizard} onClose={() => setWizard(false)} title="Buat Broadcast Baru" wide>
        {/* Stepper */}
        <div className="flex items-center gap-1.5 mb-6 overflow-x-auto" aria-label="Langkah wizard">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 shrink-0">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold',
                  i < step ? 'bg-wa text-white' : i === step ? 'bg-brand text-white' : 'bg-slate-200 dark:bg-slate-700 text-muted'
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn('text-[12px] font-medium whitespace-nowrap', i === step ? 'text-ink' : 'text-muted')}>
                {s}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <Field label="Nama campaign">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Promo Paket Pro Oktober" />
          </Field>
        )}
        {step === 1 && (
          <div className="grid sm:grid-cols-3 gap-3">
            {['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelType(ch)}
                aria-pressed={channelType === ch}
                className={cn(
                  'rounded-card border p-4 text-center font-semibold text-[14px] transition-all',
                  channelType === ch ? 'border-brand ring-2 ring-brand/15 bg-brand-50/60 dark:bg-brand-900/20 text-brand-700' : 'border-line text-ink hover:border-brand/40'
                )}
              >
                {ch === 'WHATSAPP' ? 'WhatsApp' : ch === 'INSTAGRAM' ? 'Instagram' : 'Facebook'}
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-[13.5px] font-medium text-ink">Target audience</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { key: 'inbox_all', label: 'Semua Kontak Inbox', desc: 'Seluruh kontak yang ada di inbox' },
                { key: 'inbox_selected', label: 'Pilih Beberapa Kontak', desc: 'Pilih manual dari inbox' },
              ].map((a) => (
                <button
                  key={a.key}
                  onClick={() => pickAudience(a.key)}
                  aria-pressed={audience === a.key}
                  className={cn(
                    'rounded-card border p-4 text-left transition-all',
                    audience === a.key
                      ? 'border-brand ring-2 ring-brand/15 bg-brand-50/60 dark:bg-brand-900/20'
                      : 'border-line hover:border-brand/40'
                  )}
                >
                  <span className="block font-semibold text-[14px] text-ink">{a.label}</span>
                  <span className="block mt-0.5 text-[12px] text-muted">{a.desc}</span>
                </button>
              ))}
            </div>
            {audience === 'inbox_selected' && (
              <div className="rounded-card border border-line p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    className="input !py-2 text-[13px]"
                    placeholder="Cari nama / nomor…"
                    value={contactQ}
                    onChange={(e) => {
                      setContactQ(e.target.value);
                      loadContacts(e.target.value);
                    }}
                  />
                  <span className="shrink-0 text-[12px] font-medium text-ink whitespace-nowrap">
                    {picked.size} dipilih
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-line/60">
                  {contactsLoading && <p className="py-4 text-center text-[12.5px] text-muted">Memuat kontak…</p>}
                  {!contactsLoading && contacts.length === 0 && (
                    <p className="py-4 text-center text-[12.5px] text-muted">Tidak ada kontak di inbox.</p>
                  )}
                  {contacts.map((c) => (
                    <label key={c.id} className="flex items-center gap-2.5 py-2 px-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded accent-brand shrink-0"
                        checked={picked.has(c.id)}
                        onChange={() => togglePick(c.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{c.name}</span>
                        <span className="block text-[11.5px] text-muted">{c.phone}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {picked.size > 0 && (
                  <button
                    onClick={() => setPicked(new Set())}
                    className="text-[12px] font-medium text-muted hover:text-danger"
                  >
                    Hapus pilihan ({picked.size})
                  </button>
                )}
              </div>
            )}
            <p className="text-[12.5px] text-muted">
              Hanya kontak yang memiliki nomor telepon yang akan dimasukkan sebagai penerima.
            </p>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <Field label="Isi pesan">
              <textarea
                className="input min-h-[140px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Halo {{nama}}, ada promo khusus Paket Pro bulan ini…"
              />
              <p className="mt-1.5 text-[12px] text-muted text-right">{message.length}/4000</p>
            </Field>
            {message.includes('{{') && (
              <div className="rounded-card border border-line bg-canvas p-3.5 space-y-2">
                <p className="text-[12px] font-medium text-muted">Pratinjau (nama diganti otomatis):</p>
                <p className="whitespace-pre-wrap text-[13.5px] text-ink">
                  {message.replace(/\{\{\s*nama\s*\}\}/gi, 'Budi Santoso')}
                </p>
                {unknownVars(message).length > 0 && (
                  <p className="text-[12.5px] font-medium text-danger">
                    Peringatan: {'{{' + unknownVars(message).join('}}, {{') + '}}'} tidak dikenali dan akan terkirim apa adanya. Gunakan {'{{nama}}'} untuk nama penerima.
                  </p>
                )}
              </div>
            )}
            <Field label="Poster / gambar (opsional)" optional>
              {imagePreview ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Pratinjau poster" className="max-h-48 rounded-card border border-line" />
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null); }}
                    className="absolute -top-2 -right-2 rounded-full bg-danger text-white p-1.5 shadow"
                    title="Hapus gambar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line hover:border-brand/50 cursor-pointer p-6 text-center transition-colors">
                  <ImagePlus className="h-8 w-8 text-muted" />
                  <span className="text-[13px] text-muted">Klik untuk unggah poster promosi<br />(PNG/JPG/WEBP, maks 5MB)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 5 * 1024 * 1024) { toast.error('Ukuran maksimal 5MB.'); return; }
                      setImageFile(f);
                      setImagePreview(URL.createObjectURL(f));
                    }}
                  />
                </label>
              )}
              <p className="mt-1.5 text-[12px] text-muted">Gambar dikirim sebagai foto WhatsApp dengan teks di atas sebagai caption.</p>
            </Field>
          </div>
        )}
        {step === 4 && (
          <Field label="Jadwal kirim" optional>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            <p className="mt-2 text-[12.5px] text-muted">Kosongkan untuk menyimpan sebagai draft.</p>
          </Field>
        )}
        {step === 5 && (
          <div className="rounded-card border border-line bg-canvas p-5 space-y-2.5 text-[13.5px]">
            <div className="flex justify-between"><span className="text-muted">Nama</span><b className="text-ink">{name}</b></div>
            <div className="flex justify-between"><span className="text-muted">Channel</span><b className="text-ink">{channelType}</b></div>
            <div className="flex justify-between"><span className="text-muted">Audience</span><b className="text-ink">{audience === 'inbox_selected' ? `Pilih manual (${picked.size} kontak)` : 'Semua kontak inbox'}</b></div>
            <div className="flex justify-between"><span className="text-muted">Jadwal</span><b className="text-ink">{scheduledAt ? formatDateTime(scheduledAt) : 'Draft (kirim manual)'}</b></div>
            <div className="border-t border-line pt-2.5">
              <span className="text-muted">Pesan:</span>
              <p className="mt-1 whitespace-pre-wrap text-ink">{message}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button className="btn-secondary" onClick={() => (step === 0 ? setWizard(false) : setStep(step - 1))}>
            {step === 0 ? 'Batal' : 'Kembali'}
          </button>
          {step < 5 ? (
            <Button onClick={() => validStep() && setStep(step + 1)} disabled={!validStep()}>
              Lanjut
            </Button>
          ) : (
            <Button onClick={submit} loading={busy}>
              Buat Campaign
            </Button>
          )}
        </div>
      </Modal>

      {/* Modal detail broadcast */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Detail: ${detail.name}` : ''} wide>
        {detailLoading || detail?._loading ? (
          <p className="text-[13.5px] text-muted py-8 text-center">Memuat detail…</p>
        ) : detail && (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4 text-[13.5px]">
              <div><p className="text-muted text-[12px]">Channel</p><p className="font-semibold text-ink">{detail.channelType}</p></div>
              <div><p className="text-muted text-[12px]">Status</p><Badge tone={STATUS_TONE[detail.status] ?? 'gray'}>{detail.status}</Badge></div>
              <div><p className="text-muted text-[12px]">Dibuat oleh</p><p className="font-medium text-ink">{detail.createdBy?.name}</p></div>
              <div><p className="text-muted text-[12px]">Dibuat</p><p className="font-medium text-ink">{formatDateTime(detail.createdAt)}</p></div>
              <div><p className="text-muted text-[12px]">Terkirim</p><p className="font-medium text-ink">{detail.sentCount} / {detail._count?.recipients ?? detail.recipients?.length ?? 0}</p></div>
              <div><p className="text-muted text-[12px]">Dibaca</p><p className="font-medium text-ink">{detail.readCount}</p></div>
            </div>
            <div>
              <p className="text-muted text-[12px] mb-1.5">Isi pesan</p>
              <p className="whitespace-pre-wrap text-[13.5px] text-ink rounded-card bg-canvas border border-line p-4">{detail.message}</p>
            </div>
            {detail.imageUrl && (
              <div>
                <p className="text-muted text-[12px] mb-1.5">Poster</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detail.imageUrl} alt="Poster broadcast" className="max-h-64 rounded-card border border-line" />
              </div>
            )}
            <div>
              <p className="text-muted text-[12px] mb-2">Penerima ({detail.recipients?.length ?? 0})</p>
              <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-card border border-line">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-canvas">
                    <tr className="text-left text-muted">
                      <th className="p-2.5 font-medium">Nama</th>
                      <th className="p-2.5 font-medium">Telepon</th>
                      <th className="p-2.5 font-medium">Status</th>
                      <th className="p-2.5 font-medium">Dibaca</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.recipients ?? []).map((r: any) => (
                      <tr key={r.id} className="border-t border-line/60">
                        <td className="p-2.5 text-ink">{r.customer?.name || '—'}</td>
                        <td className="p-2.5 text-muted">{r.phone}</td>
                        <td className="p-2.5">
                          <Badge tone={r.status === 'SENT' ? 'green' : r.status === 'FAILED' ? 'red' : 'gray'}>
                            {r.status === 'SENT' ? 'Terkirim' : r.status === 'FAILED' ? 'Gagal' : r.status}
                          </Badge>
                        </td>
                        <td className="p-2.5">
                          {r.readAt ? (
                            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-600">
                              <Eye className="h-3.5 w-3.5" /> {formatDateTime(r.readAt)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
