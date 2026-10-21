'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { Bot, MessagesSquare, Zap, ArrowUpRight, Plus, Trash2, GitBranch } from 'lucide-react';

interface BotNode {
  id?: string;
  type: 'TRIGGER' | 'CONDITION' | 'ACTION';
  name: string;
  config: any;
}
interface Flow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  nodes: BotNode[];
}

const NODE_TONE = {
  TRIGGER: 'bg-brand-50 text-brand-700 border-brand/30 dark:bg-brand-900/30 dark:text-brand-100',
  CONDITION: 'bg-amber-50 text-amber-700 border-amber/30 dark:bg-amber-900/30 dark:text-amber-200',
  ACTION: 'bg-emerald-50 text-emerald-700 border-emerald-500/30 dark:bg-emerald-900/30 dark:text-emerald-200',
};

export function BotClient() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [keyword, setKeyword] = useState('harga');
  const [reply, setReply] = useState('Halo! Berikut info paket kami: Basic, Pro, dan Enterprise. Boleh tahu kebutuhan Anda?');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/bot/flows');
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || !ct.includes('application/json')) {
        throw new Error(`Server mengembalikan status ${r.status}. Coba lagi.`);
      }
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setFlows(j.data.map((f: any) => ({ ...f, nodes: f.nodes.map((n: any) => ({ ...n, config: JSON.parse(n.config || '{}') })) })));
    } catch (e: any) {
      setError(e.message || 'Gagal memuat bot.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(flow: Flow) {
    try {
      const r = await fetch(`/api/bot/flows/${flow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !flow.isActive }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setFlows((fs) => fs.map((f) => (f.id === flow.id ? { ...f, isActive: !f.isActive } : f)));
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status.');
    }
  }

  async function remove(id: string) {
    if (!confirm('Hapus automation ini?')) return;
    try {
      const r = await fetch(`/api/bot/flows/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Automation dihapus.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus.');
    }
  }

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const nodes: BotNode[] = [
        { type: 'TRIGGER', name: 'Pelanggan mengirim pesan', config: {} },
        { type: 'CONDITION', name: `Berisi kata "${keyword}"`, config: { keyword } },
        { type: 'ACTION', name: 'Kirim info paket', config: { reply } },
        { type: 'ACTION', name: 'Teruskan ke tim (jika tidak cocok)', config: { fallback: true } },
      ];
      const r = await fetch('/api/bot/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: `Otomatis membalas pesan berisi "${keyword}"`, nodes }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Automation dibuat.');
      setName('');
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal membuat automation.');
    } finally {
      setBusy(false);
    }
  }

  const stats = [
    { label: 'Bot Aktif', value: flows.filter((f) => f.isActive).length, icon: Bot, tone: 'bg-brand-50 text-brand dark:bg-brand-900/30' },
    { label: 'Automation', value: flows.length, icon: Zap, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30' },
    { label: 'Node Terkonfigurasi', value: flows.reduce((a, f) => a + f.nodes.length, 0), icon: GitBranch, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30' },
    { label: 'Eskalasi ke Tim', value: flows.reduce((a, f) => a + f.nodes.filter((n) => n.config?.fallback).length, 0), icon: ArrowUpRight, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Bot & Automation</h1>
          <p className="text-sm text-muted">Biarkan Woo menangani pesan repetitif secara otomatis.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Buat Automation
        </Button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="!p-5">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[28px] font-bold text-ink leading-none">{s.value}</p>
            <p className="mt-1.5 text-[13px] text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error ? (
        <div className="card"><ErrorState message={error} onRetry={load} /></div>
      ) : flows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Bot className="h-7 w-7" />}
            title="Belum ada automation"
            description="Buat automation pertama: contohnya auto-balas saat pelanggan menanyakan harga."
            action={<Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Buat Automation</Button>}
          />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {flows.map((f) => (
            <Card key={f.id}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>{f.name}</CardTitle>
                    <Badge tone={f.isActive ? 'green' : 'gray'}>{f.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
                  </div>
                  {f.description && <p className="mt-1 text-[13px] text-muted">{f.description}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => toggle(f)}
                    className="btn-secondary !py-1.5 !px-3 text-[12.5px]"
                    aria-label={f.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  >
                    {f.isActive ? 'Matikan' : 'Nyalakan'}
                  </button>
                  <button
                    onClick={() => remove(f.id)}
                    className="btn-ghost !px-2 !text-danger"
                    aria-label="Hapus"
                    title="Hapus"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {/* Visual workflow */}
              <div className="space-y-0" aria-label={`Alur ${f.name}`}>
                {f.nodes.map((n, i) => (
                  <div key={n.id ?? i}>
                    <div className={cn('rounded-xl border px-4 py-3', NODE_TONE[n.type])}>
                      <p className="text-[10.5px] font-bold uppercase tracking-wider opacity-70">
                        {n.type === 'TRIGGER' ? 'Ketika' : n.type === 'CONDITION' ? 'Jika' : 'Maka'}
                      </p>
                      <p className="text-[13.5px] font-semibold mt-0.5">{n.name}</p>
                      {n.config?.reply && (
                        <p className="mt-1 text-[12px] opacity-80 line-clamp-2">“{n.config.reply}”</p>
                      )}
                    </div>
                    {i < f.nodes.length - 1 && (
                      <div className="flex justify-center py-0.5" aria-hidden>
                        <span className="text-muted text-lg leading-none">↓</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Buat Automation Baru">
        <div className="space-y-4">
          <Field label="Nama automation">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Auto-balas info harga" />
          </Field>
          <div className="rounded-card border border-line bg-canvas p-4 space-y-3 text-[13px]">
            <p><b className="text-brand-700">KETIKA</b> pelanggan mengirim pesan</p>
            <div className="flex items-center gap-2">
              <b className="text-amber-700">JIKA</b> pesan berisi kata
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} className="!w-40 !py-1.5" />
            </div>
            <div>
              <b className="text-emerald-700">MAKA</b> kirim balasan:
              <textarea
                className="input mt-1.5 min-h-[80px]"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
            </div>
            <p><b className="text-muted">JIKA TIDAK</b> → teruskan ke tim</p>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Batal</button>
            <Button onClick={create} loading={busy}>Simpan Automation</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
