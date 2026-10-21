'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { AGENT_STATUS_META, TASK_STATUS_META, friendlyFetchError, timeAgo } from './meta';
import { cn } from '@/lib/utils';
import { AgentSprite } from './AgentSprite';

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  avatarColor: string;
  skills: string[];
  tools: string[];
  currentStatus: string;
  currentTaskId: string | null;
  currentTask: { id: string; title: string; status: string; progress: number } | null;
  isEnabled: boolean;
  opStatus?: 'OFFLINE' | 'ERROR' | 'WORKING' | 'IDLE';
}

export function AgentGrid({
  agents,
  onSelect,
}: {
  agents: Agent[];
  onSelect: (a: Agent) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {agents.map((a) => {
        const meta = AGENT_STATUS_META[a.currentStatus] ?? AGENT_STATUS_META.IDLE;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a)}
            className={cn(
              'card p-4 text-left hover:border-brand/50 transition-colors',
              !a.isEnabled && 'opacity-60'
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-[15px] font-bold"
                style={{ backgroundColor: a.avatarColor }}
              >
                {a.name.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-ink truncate">{a.name}</p>
                <p className="text-[11.5px] text-muted truncate">{a.role}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
              <span className={cn('badge !text-[10.5px]', meta.cls)}>{meta.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function AgentDetailModal({
  agent,
  onClose,
  onUpdated,
  isAdmin,
}: {
  agent: Agent | null;
  onClose: () => void;
  onUpdated: () => void;
  isAdmin: boolean;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', description: '', skills: '', isEnabled: true });
  const [saving, setSaving] = useState(false);

  async function open() {
    if (!agent) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/agents/${agent.id}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(
          `Server mengembalikan halaman error (HTTP ${r.status}), bukan data JSON. ` +
          `Coba hentikan dev server (Ctrl+C), hapus folder .next, lalu jalankan lagi npm run dev.`
        );
      }
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setDetail(j.data);
      setForm({
        name: j.data.name, role: j.data.role, description: j.data.description,
        skills: (j.data.skills || []).join(', '), isEnabled: j.data.isEnabled,
      });
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal memuat detail.'));
    } finally {
      setLoading(false);
    }
  }

  // muat saat agent berubah
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (agent && agent.id !== loadedId.current) {
      loadedId.current = agent.id;
      setDetail(null);
      setEditing(false);
      open();
    }
    if (!agent) loadedId.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);

  async function save() {
    if (!agent) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, role: form.role, description: form.description,
          skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
          isEnabled: form.isEnabled,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Konfigurasi agent disimpan.');
      setEditing(false);
      onUpdated();
      open();
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal menyimpan.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!agent} onClose={onClose} title={agent ? `${agent.name} — ${agent.role}` : ''} wide>
      {loading && <p className="text-[13px] text-muted">Memuat…</p>}
      {detail && !editing && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-end justify-center overflow-hidden rounded-2xl bg-slate-100 pt-1">
              <AgentSprite
                agentId={detail.id}
                name={detail.name}
                opStatus={(detail.opStatus ?? 'IDLE') as 'OFFLINE' | 'ERROR' | 'WORKING' | 'IDLE'}
                size={34}
              />
            </span>
            <div>
              <p className="text-[15px] font-bold text-ink">{detail.name}</p>
              <p className="text-[12.5px] text-muted">{detail.role}</p>
              <span className={cn('badge !text-[10.5px] mt-1', (AGENT_STATUS_META[detail.currentStatus] ?? AGENT_STATUS_META.IDLE).cls)}>
                {(AGENT_STATUS_META[detail.currentStatus] ?? AGENT_STATUS_META.IDLE).label}
              </span>
              {detail.opStatus && (
                <span className={cn('badge !text-[10.5px] mt-1 ml-1',
                  detail.opStatus === 'WORKING' && 'badge-blue',
                  detail.opStatus === 'ERROR' && 'badge-red',
                  detail.opStatus === 'OFFLINE' && 'badge',
                  detail.opStatus === 'IDLE' && 'badge-green')}>
                  {detail.opStatus === 'IDLE' ? 'Online' : detail.opStatus === 'WORKING' ? 'Working' : detail.opStatus === 'ERROR' ? 'Error' : 'Offline'}
                </span>
              )}
            </div>
            {isAdmin && (
              <button onClick={() => setEditing(true)} className="btn-secondary !py-1.5 !px-3 text-[12.5px] ml-auto">
                Konfigurasi
              </button>
            )}
          </div>
          <p className="text-[13px] text-muted">{detail.description}</p>
          <div>
            <p className="text-[12.5px] font-semibold text-ink mb-1.5">Keahlian</p>
            <div className="flex flex-wrap gap-1.5">
              {detail.skills.map((s: string) => (
                <span key={s} className="badge !text-[11px]">{s}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-ink mb-1.5">Tugas terakhir</p>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {detail.tasks.length === 0 && <p className="text-[12.5px] text-muted">Belum ada tugas.</p>}
              {detail.tasks.map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="text-ink truncate flex-1">{t.title}</span>
                  <span className={cn('badge !text-[10px] shrink-0', (TASK_STATUS_META[t.status] ?? TASK_STATUS_META.QUEUED).cls)}>
                    {(TASK_STATUS_META[t.status] ?? TASK_STATUS_META.QUEUED).label}
                  </span>
                  <span className="text-muted shrink-0">{timeAgo(t.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-ink mb-1.5">Aktivitas terbaru</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {(detail.activities ?? []).length === 0 && <p className="text-[12.5px] text-muted">Belum ada aktivitas tercatat.</p>}
              {(detail.activities ?? []).slice(0, 8).map((a: any) => (
                <div key={a.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="text-ink truncate flex-1">{a.description || a.activityType}</span>
                  <span className="text-muted shrink-0">{timeAgo(a.startedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {detail && editing && (
        <div className="space-y-3">
          <div>
            <label className="text-[12.5px] font-medium text-ink">Nama</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input mt-1 w-full" />
          </div>
          <div>
            <label className="text-[12.5px] font-medium text-ink">Jabatan</label>
            <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input mt-1 w-full" />
          </div>
          <div>
            <label className="text-[12.5px] font-medium text-ink">Deskripsi</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="input mt-1 w-full" />
          </div>
          <div>
            <label className="text-[12.5px] font-medium text-ink">Keahlian (pisahkan koma)</label>
            <input value={form.skills} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))} className="input mt-1 w-full" />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={form.isEnabled} onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))} />
            Agent aktif
          </label>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn-primary !py-2 text-[13px]">
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-secondary !py-2 text-[13px]">Batal</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
