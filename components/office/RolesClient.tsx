'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Field } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoleItem {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  permissions: string[];
}

export function RolesClient({ perms }: { perms: string[] }) {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [modules, setModules] = useState<Record<string, { key: string; module: string; description: string }[]>>({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [selPerms, setSelPerms] = useState<string[]>([]);
  const [form, setForm] = useState({ name: '', description: '' });
  const [busy, setBusy] = useState(false);

  const can = (...ks: string[]) => perms.includes('*') || ks.some((k) => perms.includes(k));
  const canEditPerms = can('PERMISSIONS_MANAGE');

  const load = useCallback(async () => {
    const [rr, pp, tt] = await Promise.all([
      fetch('/api/admin/roles').then((r) => r.json()).catch(() => null),
      fetch('/api/admin/permissions').then((r) => r.json()).catch(() => null),
      fetch('/api/admin/roles/templates').then((r) => r.json()).catch(() => null),
    ]);
    if (rr?.success) setRoles(rr.data);
    if (pp?.success) setModules(pp.data.modules);
    if (tt?.success) setTemplates(tt.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startCreate(template?: any) {
    setForm({ name: template?.name ?? '', description: template?.description ?? '' });
    setSelPerms(template?.permissions ?? []);
    setCreating(true);
    setEditing(null);
  }

  function startEdit(r: RoleItem) {
    setForm({ name: r.name, description: r.description ?? '' });
    setSelPerms(r.permissions);
    setEditing(r);
    setCreating(false);
  }

  function togglePerm(key: string) {
    setSelPerms((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function submitCreate() {
    if (!form.name.trim()) { toast.error('Nama role wajib diisi.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), description: form.description.trim(), permissions: selPerms }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Role "${form.name}" dibuat.`);
      setCreating(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal membuat role.');
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    if (!editing) return;
    if (!confirm(`Simpan perubahan role "${editing.name}"? Perubahan permission berlaku segera.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/roles/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), description: form.description.trim(), permissions: selPerms }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Role diperbarui.');
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  async function removeRole(r: RoleItem) {
    if (!confirm(`Hapus role "${r.name}"? Tindakan ini permanen.`)) return;
    try {
      const res = await fetch(`/api/admin/roles/${r.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Role dihapus.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus role.');
    }
  }

  const editor = creating || editing;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Role & Permission</h1>
          <p className="text-sm text-muted">Buat role, atur permission per modul, atau mulai dari template divisi.</p>
        </div>
        {can('ROLES_CREATE') && (
          <button onClick={() => startCreate()} className="btn-primary !py-2 text-[13px]">
            <Plus className="h-4 w-4" /> Buat Role
          </button>
        )}
      </div>

      {can('ROLES_CREATE') && !editor && (
        <Card>
          <CardTitle><span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" /> Template Role Divisi</span></CardTitle>
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {templates.map((t) => (
              <button
                key={t.name}
                onClick={() => startCreate(t)}
                className="rounded-btn border border-line p-4 text-left hover:border-brand/50 hover:bg-brand-50/50 dark:hover:bg-brand-900/20 transition-colors"
              >
                <p className="text-[14px] font-bold text-ink">{t.name}</p>
                <p className="text-[12px] text-muted mt-1 line-clamp-2">{t.description}</p>
                <p className="text-[11.5px] text-brand mt-2 font-medium">{t.permissions.length} permission</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {editor ? (
        <Card>
          <CardTitle>{creating ? 'Buat Role Baru' : `Edit Role — ${editing?.name}`}</CardTitle>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <Field label="Nama role *">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!!editing?.isSystem && ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT', 'VIEWER'].includes(editing.name)}
              />
            </Field>
            <Field label="Deskripsi">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <div className="mt-5">
            <p className="text-[13px] font-semibold text-ink mb-1">Permission per modul</p>
            {!canEditPerms && (
              <p className="text-[12.5px] text-amber-600 mb-3">Anda tidak memiliki PERMISSIONS_MANAGE — daftar permission hanya tampil baca.</p>
            )}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
              {Object.entries(modules).map(([mod, list]) => (
                <div key={mod} className="rounded-btn border border-line p-4">
                  <p className="text-[13px] font-bold text-ink mb-2">{mod}</p>
                  <div className="space-y-1.5">
                    {list.map((p) => (
                      <label key={p.key} className={cn('flex items-start gap-2 text-[12.5px]', canEditPerms ? 'cursor-pointer' : 'cursor-default opacity-70')}>
                        <input
                          type="checkbox"
                          checked={selPerms.includes(p.key)}
                          onChange={() => togglePerm(p.key)}
                          disabled={!canEditPerms}
                          className="mt-0.5 accent-brand-600"
                        />
                        <span>
                          <span className="font-medium text-ink">{p.key}</span>
                          <span className="block text-muted">{p.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => { setCreating(false); setEditing(null); }} className="btn-ghost !py-2 text-[13px]">Batal</button>
            <button onClick={creating ? submitCreate : submitEdit} disabled={busy || (!canEditPerms && !creating)} className="btn-primary !py-2 text-[13px]">
              {busy ? 'Menyimpan…' : creating ? 'Buat Role' : 'Simpan Perubahan'}
            </button>
          </div>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((r) => (
            <Card key={r.id} className="!p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-bold text-ink inline-flex items-center gap-2">
                    {r.name}
                    {r.isSystem && <Badge tone="gray">Sistem</Badge>}
                  </p>
                  <p className="text-[12.5px] text-muted mt-0.5">{r.description ?? '—'}</p>
                </div>
                <span className="inline-flex gap-1 shrink-0">
                  {(can('ROLES_UPDATE') || can('PERMISSIONS_MANAGE')) && (
                    <button onClick={() => startEdit(r)} title="Edit" className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {can('ROLES_DELETE') && !r.isSystem && (
                    <button onClick={() => removeRole(r)} title="Hapus" className="rounded-btn p-2 text-muted hover:bg-red-50 hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted">
                <span>{r.memberCount} pengguna</span>
                <span>{r.permissions.length} permission</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
