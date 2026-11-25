'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle } from '@/components/ui/primitives';
import { Field } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, Network, Users, Bot, X } from 'lucide-react';

const FLOOR_LABEL: Record<string, string> = {
  '1': 'Lantai 1',
  '2': 'Lantai 2',
  '3': 'Lantai 3',
};

export function DepartmentsClient({ perms }: { perms: string[] }) {
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null);
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    floor: '',
    zone: '',
    capacity: '',
    headUserId: '',
    isActive: true,
  });
  const [assignSel, setAssignSel] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const can = (...ks: string[]) => perms.includes('*') || ks.some((k) => perms.includes(k));
  const canManage = can('DEPARTMENTS_MANAGE');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/departments?with=assign');
    const j = await r.json();
    if (j.success) {
      setItems(j.data.items ?? []);
      setMembers(j.data.members ?? []);
      setUnassigned(j.data.unassignedAgents ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setForm({ name: '', description: '', floor: '', zone: '', capacity: '', headUserId: '', isActive: true });
    setModal('add');
  }

  function openEdit(d: any) {
    setSel(d);
    setForm({
      name: d.name,
      description: d.description ?? '',
      floor: d.floor != null ? String(d.floor) : '',
      zone: d.zone ?? '',
      capacity: d.capacity != null ? String(d.capacity) : '',
      headUserId: d.headUserId ?? '',
      isActive: d.isActive !== false,
    });
    setModal('edit');
  }

  async function submit() {
    if (!form.name.trim()) { toast.error('Nama divisi wajib diisi.'); return; }
    setBusy(true);
    try {
      const url = modal === 'add' ? '/api/admin/departments' : `/api/admin/departments/${sel.id}`;
      const r = await fetch(url, {
        method: modal === 'add' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          floor: form.floor === '' ? null : Number(form.floor),
          zone: form.zone.trim(),
          capacity: form.capacity === '' ? null : Number(form.capacity),
          headUserId: form.headUserId === '' ? null : form.headUserId,
          isActive: form.isActive,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(modal === 'add' ? 'Divisi dibuat.' : 'Divisi diperbarui.');
      setModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(d: any) {
    if (!confirm(`Hapus divisi "${d.name}"? ${d.memberCount} anggota dan ${d.agentCount} agent akan dilepas dari divisi.`)) return;
    try {
      const r = await fetch(`/api/admin/departments/${d.id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Divisi dihapus.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus.');
    }
  }

  async function assignAgent(deptId: string) {
    const agentId = assignSel[deptId];
    if (!agentId) return;
    try {
      const r = await fetch(`/api/admin/departments/${deptId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Agent ditempatkan ke divisi.');
      setAssignSel((s) => ({ ...s, [deptId]: '' }));
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menempatkan agent.');
    }
  }

  async function unassignAgent(deptId: string, agent: any) {
    if (!confirm(`Lepas agent "${agent.name}" dari divisi ini?`)) return;
    try {
      const r = await fetch(`/api/admin/departments/${deptId}/agents?agentId=${agent.id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Agent dilepas dari divisi.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal melepas agent.');
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Divisi</h1>
          <p className="text-sm text-muted">Struktur divisi di kantor ini — lantai, ruangan, dan penempatan agent AI.</p>
        </div>
        {canManage && (
          <button onClick={openAdd} className="btn-primary !py-2 text-[13px]">
            <Plus className="h-4 w-4" /> Tambah Divisi
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((d) => (
          <Card key={d.id} className="!p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-violet-50 text-violet-600 dark:bg-violet-900/30">
                  <Network className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[15px] font-bold text-ink">{d.name}</p>
                  <p className="text-[12px] text-muted inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {d.memberCount} anggota
                    <span className="mx-1">·</span>
                    <Bot className="h-3.5 w-3.5" /> {d.agentCount} agent
                  </p>
                </div>
              </div>
              {canManage && (
                <span className="inline-flex gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(d)}
                    title="Edit"
                    className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeItem(d)}
                    title="Hapus"
                    className="rounded-btn p-2 text-muted hover:bg-red-50 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-ink">
                {d.floor != null ? FLOOR_LABEL[String(d.floor)] : 'Belum dipetakan'}
              </span>
              {d.zone && (
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                  {d.zone}
                </span>
              )}
              {d.capacity != null && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-muted">
                  Kapasitas {d.capacity}
                </span>
              )}
              {!d.isActive && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-danger">
                  Nonaktif
                </span>
              )}
            </div>
            {d.headName && (
              <p className="mt-2 text-[12.5px] text-muted">Pimpinan: <span className="font-semibold text-ink">{d.headName}</span></p>
            )}
            {d.description && <p className="mt-2 text-[12.5px] text-muted">{d.description}</p>}

            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Agent di divisi ini</p>
              {d.agents?.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {d.agents.map((a: any) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="inline-flex items-center gap-1.5 text-ink">
                        <Bot className="h-3.5 w-3.5 text-muted" /> {a.name}
                        <span className="text-muted text-[12px]">— {a.role}</span>
                      </span>
                      {canManage && (
                        <button
                          onClick={() => unassignAgent(d.id, a)}
                          title="Lepas agent"
                          className="rounded-btn p-1 text-muted hover:bg-red-50 hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[12.5px] text-muted">Belum ada agent.</p>
              )}
              {canManage && unassigned.length > 0 && (
                <div className="mt-2 flex gap-2">
                  <select
                    value={assignSel[d.id] ?? ''}
                    onChange={(e) => setAssignSel((s) => ({ ...s, [d.id]: e.target.value }))}
                    className="input !py-1.5 text-[12.5px] flex-1 min-w-0"
                  >
                    <option value="">Tempatkan agent…</option>
                    {unassigned.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name} — {a.role}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => assignAgent(d.id)}
                    disabled={!assignSel[d.id]}
                    className="btn-primary !py-1.5 text-[12.5px] shrink-0 disabled:opacity-50"
                  >
                    Tempatkan
                  </button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
      {items.length === 0 && (
        <Card><p className="text-sm text-muted text-center py-8">Belum ada divisi.</p></Card>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-900/45" onClick={() => setModal(null)} />
          <div className="relative card w-full max-w-md p-6 shadow-pop space-y-4 max-h-[90vh] overflow-y-auto">
            <CardTitle>{modal === 'add' ? 'Tambah Divisi' : 'Edit Divisi'}</CardTitle>
            <Field label="Nama divisi *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: HR, Finance, IT" />
            </Field>
            <Field label="Deskripsi">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lantai">
                <select value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} className="input">
                  <option value="">Belum dipetakan</option>
                  <option value="1">Lantai 1</option>
                  <option value="2">Lantai 2</option>
                  <option value="3">Lantai 3</option>
                </select>
              </Field>
              <Field label="Kapasitas">
                <Input
                  type="number"
                  min={0}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                  placeholder="cth: 10"
                />
              </Field>
            </div>
            <Field label="Ruangan / zona">
              <Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="cth: CEO Office, Backend" />
            </Field>
            <Field label="Pimpinan divisi">
              <select value={form.headUserId} onChange={(e) => setForm({ ...form, headUserId: e.target.value })} className="input">
                <option value="">— Tidak ada —</option>
                {members.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              Divisi aktif
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="btn-ghost !py-2 text-[13px]">Batal</button>
              <button onClick={submit} disabled={busy} className="btn-primary !py-2 text-[13px]">
                {busy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
