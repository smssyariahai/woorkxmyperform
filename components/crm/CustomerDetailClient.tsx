'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Avatar, Badge, Card, CardTitle } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';
import { Modal } from '@/components/ui/modal';
import { maskPhone, timeAgo, formatDateTime } from '@/lib/utils';
import {
  ArrowLeft, StickyNote, CalendarClock, UserCheck, Flag,
  MessageSquare, Phone, FileText,
} from 'lucide-react';

interface Detail {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  industry: string | null;
  source: string | null;
  business: string | null;
  interest: string | null;
  budget: string | null;
  stage: string;
  score: string | null;
  owner: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
  conversations: Array<{
    id: string;
    channelType: string;
    messages: Array<{ id: string; senderType: string; sender: { name: string } | null; body: string; createdAt: string }>;
  }>;
  notes: Array<{ id: string; body: string; createdAt: string; author: { name: string } }>;
  lead: { stage: { name: string } } | null;
  deals: Array<{ id: string; title: string; value: number | null; stage: { name: string } }>;
  followUps: Array<{ id: string; scheduledAt: string; status: string; notes: string | null; assignedTo: { name: string } | null }>;
  activities: Array<{ id: string; title: string; description: string | null; createdAt: string; actor: { name: string } | null }>;
}

const STAGES = ['Baru', 'Dihubungi', 'Terkualifikasi', 'Proposal', 'Negosiasi', 'Pelanggan'];

export function CustomerDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [fuOpen, setFuOpen] = useState(false);
  const [fuDate, setFuDate] = useState('');
  const [fuNotes, setFuNotes] = useState('');
  const [fuBusy, setFuBusy] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/customers/${id}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setData(j.data);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat detail.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addNote() {
    if (!noteBody.trim() || noteBusy) return;
    setNoteBusy(true);
    try {
      const r = await fetch(`/api/customers/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Catatan ditambahkan.');
      setNoteBody('');
      setNoteOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menambah catatan.');
    } finally {
      setNoteBusy(false);
    }
  }

  async function addFollowUp() {
    if (!fuDate || fuBusy) return;
    setFuBusy(true);
    try {
      const r = await fetch('/api/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: id, scheduledAt: fuDate, notes: fuNotes || null }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Follow up dijadwalkan.');
      setFuDate('');
      setFuNotes('');
      setFuOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menjadwalkan.');
    } finally {
      setFuBusy(false);
    }
  }

  async function changeStage(stage: string) {
    setStageBusy(true);
    try {
      const r = await fetch(`/api/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Tahap diubah ke ${stage}.`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah tahap.');
    } finally {
      setStageBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 grid lg:grid-cols-[280px_minmax(0,1fr)_300px] gap-4 max-w-[1500px] mx-auto min-w-0">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-8 max-w-[1500px] mx-auto">
        <div className="card"><ErrorState message={error} onRetry={load} /></div>
      </div>
    );
  }

  const info: Array<[string, string]> = [
    ['Nama', data.name],
    ['Telepon', data.phone ?? '-'],
    ['Email', data.email ?? '-'],
    ['Perusahaan', data.company ?? '-'],
    ['Industri', data.industry ?? '-'],
    ['Sumber', data.source ?? '-'],
    ['Pemilik', data.owner?.name ?? '-'],
    ['Tahap', data.stage],
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1500px] mx-auto">
      <Link href="/crm" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-brand mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke CRM
      </Link>

      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)_300px] gap-4 items-start min-w-0">
        {/* Kiri: profil */}
        <Card className="space-y-4">
          <div className="flex flex-col items-center text-center">
            <Avatar name={data.name} size={72} />
            <h2 className="mt-3 text-[17px] font-bold text-ink">{data.name}</h2>
            <p className="text-[13px] text-muted">{maskPhone(data.phone)}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <Badge tone="blue">{data.stage}</Badge>
              {data.score && <Badge tone={data.score === 'Tinggi' ? 'green' : 'amber'}>{data.score}</Badge>}
              {data.tags.map((t) => (
                <Badge key={t.id} tone="gray">{t.name}</Badge>
              ))}
            </div>
          </div>
          <dl className="grid grid-cols-[92px_1fr] gap-y-2 text-[12.5px] border-t border-line pt-4">
            {info.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="font-medium text-ink break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Tengah: timeline */}
        <div className="space-y-4 min-w-0">
          <Card>
            <CardTitle className="mb-4">Riwayat Percakapan</CardTitle>
            {data.conversations.length === 0 && (
              <p className="text-[13px] text-muted py-4 text-center">Belum ada percakapan.</p>
            )}
            {data.conversations.map((c) => (
              <div key={c.id} className="mb-4 last:mb-0 border-b border-line/60 last:border-0 pb-4">
                <Link
                  href={`/inbox?c=${c.id}`}
                  className="text-[13px] font-semibold text-brand hover:underline inline-flex items-center gap-1.5 mb-2"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> {c.channelType} — buka di Inbox
                </Link>
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {c.messages.slice(-12).map((m) => (
                    <div key={m.id} className={`flex ${m.senderType === 'CUSTOMER' ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] ${
                          m.senderType === 'CUSTOMER'
                            ? 'bg-slate-100 dark:bg-slate-800 text-ink'
                            : m.senderType === 'SYSTEM'
                              ? 'bg-emerald-50 text-emerald-700 text-[12px]'
                              : 'bg-brand-50 dark:bg-brand-900/30 text-ink'
                        }`}
                      >
                        {m.body}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <CardTitle className="mb-4">Catatan</CardTitle>
            {data.notes.length === 0 && (
              <p className="text-[13px] text-muted py-2">Belum ada catatan.</p>
            )}
            <div className="space-y-3">
              {data.notes.map((n) => (
                <div key={n.id} className="rounded-xl bg-canvas border border-line/60 p-3.5">
                  <p className="text-[13px] text-ink whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1.5 text-[11.5px] text-muted">
                    {n.author.name} · {timeAgo(n.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-4">Aktivitas</CardTitle>
            <div className="space-y-1">
              {data.activities.length === 0 && (
                <p className="text-[13px] text-muted py-2">Belum ada aktivitas.</p>
              )}
              {data.activities.map((a) => (
                <div key={a.id} className="flex gap-3 py-2 border-b border-line/60 last:border-0">
                  <span className="mt-1 h-2 w-2 rounded-full bg-brand shrink-0" />
                  <div>
                    <p className="text-[13px] font-medium text-ink">{a.title}</p>
                    {a.description && <p className="text-[12px] text-muted">{a.description}</p>}
                    <p className="text-[11px] text-muted">{timeAgo(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Kanan: aksi & metadata */}
        <div className="space-y-4">
          <Card>
            <CardTitle className="!text-[13px] mb-3">Aksi Cepat</CardTitle>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary !py-2 !px-2 text-[12.5px]" onClick={() => setNoteOpen(true)}>
                <StickyNote className="h-4 w-4" /> Catatan
              </button>
              <button className="btn-secondary !py-2 !px-2 text-[12.5px]" onClick={() => setFuOpen(true)}>
                <CalendarClock className="h-4 w-4" /> Follow Up
              </button>
              <Link href="/settings/team" className="btn-secondary !py-2 !px-2 text-[12.5px] inline-flex">
                <UserCheck className="h-4 w-4" /> Assign Tim
              </Link>
              <div className="relative">
                <select
                  className="input !py-2 !text-[12.5px]"
                  value={data.stage}
                  disabled={stageBusy}
                  onChange={(e) => changeStage(e.target.value)}
                  aria-label="Ubah tahap"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle className="!text-[13px] mb-3">Insight Woo</CardTitle>
            <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-[12.5px]">
              <dt className="text-muted">Usaha</dt><dd className="font-medium text-ink">{data.business ?? '-'}</dd>
              <dt className="text-muted">Minat</dt><dd className="font-medium text-ink">{data.interest ?? '-'}</dd>
              <dt className="text-muted">Anggaran</dt><dd className="font-medium text-ink">{data.budget ?? '-'}</dd>
              <dt className="text-muted">Lead</dt><dd className="font-medium text-ink">{data.lead?.stage.name ?? 'Belum ada'}</dd>
            </dl>
          </Card>

          <Card>
            <CardTitle className="!text-[13px] mb-3">Follow Up</CardTitle>
            {data.followUps.length === 0 && (
              <p className="text-[12.5px] text-muted">Belum ada follow up terjadwal.</p>
            )}
            <div className="space-y-2.5">
              {data.followUps.map((f) => (
                <div key={f.id} className="rounded-xl border border-line/70 p-3">
                  <p className="text-[13px] font-semibold text-ink">{formatDateTime(f.scheduledAt)}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge tone={f.status === 'PENDING' ? 'amber' : f.status === 'DONE' ? 'green' : 'gray'}>
                      {f.status === 'PENDING' ? 'Menunggu' : f.status === 'DONE' ? 'Selesai' : 'Batal'}
                    </Badge>
                    {f.assignedTo && <span className="text-[11.5px] text-muted">{f.assignedTo.name}</span>}
                  </div>
                  {f.notes && <p className="mt-1 text-[12px] text-muted">{f.notes}</p>}
                </div>
              ))}
            </div>
          </Card>

          {data.deals.length > 0 && (
            <Card>
              <CardTitle className="!text-[13px] mb-3">Deals</CardTitle>
              <div className="space-y-2">
                {data.deals.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-[12.5px]">
                    <span className="font-medium text-ink">{d.title}</span>
                    <Badge tone="blue">{d.stage.name}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Tambah Catatan">
        <Field label="Catatan">
          <textarea
            className="input min-h-[120px]"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Tulis catatan tentang pelanggan ini…"
          />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setNoteOpen(false)}>Batal</button>
          <Button onClick={addNote} loading={noteBusy}>Simpan Catatan</Button>
        </div>
      </Modal>

      <Modal open={fuOpen} onClose={() => setFuOpen(false)} title="Jadwalkan Follow Up">
        <div className="space-y-4">
          <Field label="Jadwal">
            <Input type="datetime-local" value={fuDate} onChange={(e) => setFuDate(e.target.value)} />
          </Field>
          <Field label="Catatan" optional>
            <textarea
              className="input min-h-[90px]"
              value={fuNotes}
              onChange={(e) => setFuNotes(e.target.value)}
              placeholder="Contoh: tanyakan keputusan paket Pro"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setFuOpen(false)}>Batal</button>
            <Button onClick={addFollowUp} loading={fuBusy}>Jadwalkan</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
