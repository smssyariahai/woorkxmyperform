'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle } from '@/components/ui/primitives';
import { Field } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, Network, Users } from 'lucide-react';

export function DepartmentsClient({ perms }: { perms: string[] }) {
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null);
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [busy, setBusy] = useState(false);

  const can = (...ks: string[]) => perms.includes('*') || ks.some((k) => perms.includes(k));
  const canManage = can('DEPARTMENTS_MANAGE');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/departments');
    const j = await r.json();
    if (j.success) setItems(j.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!form.name.trim()) { toast.error('Nama divisi wajib diisi.'); return; }
    setBusy(true);
    try {
      const url = modal === 'add' ? '/api/admin/departments' : `/api/admin/departments/${sel.id}`;
      const r = await fetch(url, {
        method: modal === 'add' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() }),
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
    if (!confirm(`Hapus divisi "${d.name}"? ${d.memberCount} anggota akan dilepas dari divisi.`)) return;
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Divisi</h1>
          <p className="text-sm text-muted">Struktur divisi di kantor ini.</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setForm({ name: '', description: '' }); setModal('add'); }}
            className="btn-primary !py-2 text-[13px]"
          >
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
                  </p>
                </div>
              </div>
              {canManage && (
                <span className="inline-flex gap-1 shrink-0">
                  <button
                    onClick={() => { setSel(d); setForm({ name: d.name, description: d.description ?? '' }); setModal('edit'); }}
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
            {d.description && <p className="mt-2 text-[12.5px] text-muted">{d.description}</p>}
          </Card>
        ))}
      </div>
      {items.length === 0 && (
        <Card><p className="text-sm text-muted text-center py-8">Belum ada divisi.</p></Card>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-900/45" onClick={() => setModal(null)} />
          <div className="relative card w-full max-w-md p-6 shadow-pop space-y-4">
            <CardTitle>{modal === 'add' ? 'Tambah Divisi' : 'Edit Divisi'}</CardTitle>
            <Field label="Nama divisi *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: HR, Finance, IT" />
            </Field>
            <Field label="Deskripsi">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
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
