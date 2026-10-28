'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Field } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, UserPlus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlatformRole {
  id: string;
  name: string;
  description: string | null;
  adminCount: number;
  permissions: string[];
}

interface PlatformAdmin {
  userId: string;
  userName: string;
  userEmail: string;
  userStatus: string;
  roleId: string;
  roleName: string;
  createdAt: string;
}

interface SearchUser {
  id: string;
  name: string;
  email: string;
  status: string;
  isSuperAdmin: boolean;
  platformRoles: { id: string; name: string }[];
}

interface PermDef {
  key: string;
  module: string;
  description: string;
}

export function PlatformAdminClient() {
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [modules, setModules] = useState<Record<string, PermDef[]>>({});
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [editing, setEditing] = useState<PlatformRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [selPerms, setSelPerms] = useState<string[]>([]);
  const [form, setForm] = useState({ name: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickRole, setPickRole] = useState<Record<string, string>>({});
  const [roleQuery, setRoleQuery] = useState('');
  const [adminRoleFilter, setAdminRoleFilter] = useState('');
  const [adminPage, setAdminPage] = useState(1);
  const ADMIN_PAGE_SIZE = 10;

  const load = useCallback(async () => {
    const [rr, pp, aa] = await Promise.all([
      fetch('/api/super/platform-roles').then((r) => r.json()).catch(() => null),
      fetch('/api/super/platform-permissions').then((r) => r.json()).catch(() => null),
      fetch('/api/super/platform-admins').then((r) => r.json()).catch(() => null),
    ]);
    if (rr?.success) setRoles(rr.data);
    if (pp?.success) setModules(pp.data.modules);
    if (aa?.success) setAdmins(aa.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/super/platform-admins/users?q=${encodeURIComponent(query.trim())}`);
        const j = await r.json();
        if (j.success) setResults(j.data);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  function togglePerm(key: string) {
    setSelPerms((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function startCreate() {
    setForm({ name: '', description: '' });
    setSelPerms([]);
    setCreating(true);
    setEditing(null);
  }

  function startEdit(r: PlatformRole) {
    setForm({ name: r.name, description: r.description ?? '' });
    setSelPerms(r.permissions);
    setEditing(r);
    setCreating(false);
  }

  async function submitRole() {
    if (!form.name.trim()) { toast.error('Nama role wajib diisi.'); return; }
    setBusy(true);
    try {
      const url = creating ? '/api/super/platform-roles' : `/api/super/platform-roles/${editing!.id}`;
      const r = await fetch(url, {
        method: creating ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), description: form.description.trim(), permissions: selPerms }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(creating ? `Role platform "${form.name}" dibuat.` : 'Role platform diperbarui.');
      setCreating(false);
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan role.');
    } finally {
      setBusy(false);
    }
  }

  async function removeRole(r: PlatformRole) {
    if (!confirm(`Hapus role platform "${r.name}"? Tindakan ini permanen.`)) return;
    try {
      const res = await fetch(`/api/super/platform-roles/${r.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Role platform dihapus.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus role.');
    }
  }

  async function assignRole(u: SearchUser) {
    const roleId = pickRole[u.id];
    if (!roleId) { toast.error('Pilih role platform dulu.'); return; }
    const role = roles.find((r) => r.id === roleId);
    if (!confirm(`Tugaskan role "${role?.name}" ke ${u.email}? Berlaku segera.`)) return;
    try {
      const r = await fetch('/api/super/platform-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, roleId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Role "${role?.name}" ditugaskan ke ${u.email}.`);
      setQuery('');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menugaskan role.');
    }
  }

  async function revoke(a: PlatformAdmin) {
    if (!confirm(`Cabut role "${a.roleName}" dari ${a.userEmail}? Berlaku segera.`)) return;
    try {
      const r = await fetch(`/api/super/platform-admins?userId=${a.userId}&roleId=${a.roleId}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Penugasan dicabut.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mencabut penugasan.');
    }
  }

  const editor = creating || editing;
  const visibleRoles = roles.filter((r) => r.name.toLowerCase().includes(roleQuery.trim().toLowerCase()));
  const filteredAdmins = admins.filter((a) => !adminRoleFilter || a.roleId === adminRoleFilter);
  const adminPages = Math.max(1, Math.ceil(filteredAdmins.length / ADMIN_PAGE_SIZE));
  const safeAdminPage = Math.min(adminPage, adminPages);
  const pagedAdmins = filteredAdmins.slice((safeAdminPage - 1) * ADMIN_PAGE_SIZE, safeAdminPage * ADMIN_PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Admin WOORK</h1>
          <p className="text-sm text-muted">Role platform & penugasan Admin WOORK. Hanya Administrator Pusat yang dapat mengelola halaman ini.</p>
        </div>
        {!editor && (
          <button onClick={startCreate} className="btn-primary !py-2 text-[13px]">
            <Plus className="h-4 w-4" /> Buat Role Platform
          </button>
        )}
      </div>

      <Card>
        <p className="text-[12.5px] text-muted leading-relaxed">
          Admin WOORK bekerja lintas tenant sesuai permission platform yang diberikan — terpisah dari role tenant mereka.
          Penugasan & pencabutan berlaku segera (permission dibaca dari database tiap request).
          Admin WOORK <b className="text-ink">tidak dapat</b> memberi/mencabut status Administrator Pusat, mengelola role platform lain,
          atau mengubah Pengaturan Sistem — semua itu tetap khusus Administrator Pusat.
        </p>
      </Card>

      {editor ? (
        <Card>
          <CardTitle>{creating ? 'Buat Role Platform' : `Edit Role Platform — ${editing?.name}`}</CardTitle>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <Field label="Nama role *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Deskripsi">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <div className="mt-5">
            <p className="text-[13px] font-semibold text-ink mb-1">Permission platform</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
              {Object.entries(modules).map(([mod, list]) => (
                <div key={mod} className="rounded-btn border border-line p-4">
                  <p className="text-[13px] font-bold text-ink mb-2">{mod}</p>
                  <div className="space-y-1.5">
                    {list.map((p) => (
                      <label key={p.key} className="flex items-start gap-2 text-[12.5px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selPerms.includes(p.key)}
                          onChange={() => togglePerm(p.key)}
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
            <button onClick={submitRole} disabled={busy} className="btn-primary !py-2 text-[13px]">
              {busy ? 'Menyimpan…' : creating ? 'Buat Role' : 'Simpan Perubahan'}
            </button>
          </div>
        </Card>
      ) : (
        <div>
          <div className="mb-3 relative max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={roleQuery}
              onChange={(e) => setRoleQuery(e.target.value)}
              placeholder="Cari role platform…"
              className="!pl-9"
            />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleRoles.map((r) => (
            <Card key={r.id} className="!p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-bold text-ink">{r.name}</p>
                  <p className="text-[12.5px] text-muted mt-0.5">{r.description ?? '—'}</p>
                </div>
                <span className="inline-flex gap-1 shrink-0">
                  <button onClick={() => startEdit(r)} title="Edit" className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeRole(r)} title="Hapus" className="rounded-btn p-2 text-muted hover:bg-red-50 hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted">
                <span>{r.adminCount} admin</span>
                <span>{r.permissions.length} permission</span>
              </div>
            </Card>
          ))}
          {visibleRoles.length === 0 && (
            <p className="text-[13px] text-muted col-span-full">
              {roles.length === 0 ? 'Belum ada role platform. Buat role pertama, lalu tugaskan ke pengguna.' : 'Tidak ada role yang cocok dengan pencarian.'}
            </p>
          )}
          </div>
        </div>
      )}

      <Card>
        <CardTitle><span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4 text-brand" /> Tugaskan Admin WOORK</span></CardTitle>
        <div className="mt-3 relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari pengguna berdasarkan nama / email (min. 2 karakter)…"
            className="!pl-9"
          />
        </div>
        {searching && <p className="text-[12.5px] text-muted mt-2">Mencari…</p>}
        {results.length > 0 && (
          <div className="mt-3 space-y-2">
            {results.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-btn border border-line p-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[13.5px] font-semibold text-ink inline-flex items-center gap-2">
                    {u.name}
                    {u.isSuperAdmin && <Badge tone="amber">Administrator Pusat</Badge>}
                    {u.status !== 'ACTIVE' && <Badge tone="gray">{u.status}</Badge>}
                  </p>
                  <p className="text-[12.5px] text-muted">{u.email}</p>
                  {u.platformRoles.length > 0 && (
                    <p className="text-[12px] text-muted mt-0.5">Role platform: {u.platformRoles.map((r) => r.name).join(', ')}</p>
                  )}
                </div>
                {u.isSuperAdmin ? (
                  <span className="text-[12.5px] text-muted">Sudah punya akses penuh — tidak perlu role platform.</span>
                ) : u.status !== 'ACTIVE' ? (
                  <span className="text-[12.5px] text-muted">Pengguna tidak aktif.</span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <select
                      value={pickRole[u.id] ?? ''}
                      onChange={(e) => setPickRole((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      className="rounded-btn border border-line bg-white dark:bg-slate-900 px-2 py-2 text-[13px]"
                    >
                      <option value="">Pilih role…</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id} disabled={u.platformRoles.some((pr) => pr.id === r.id)}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => assignRole(u)} className="btn-primary !py-2 text-[13px]">Tugaskan</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Admin WOORK Aktif ({filteredAdmins.length})</CardTitle>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={adminRoleFilter}
            onChange={(e) => { setAdminRoleFilter(e.target.value); setAdminPage(1); }}
            className="rounded-btn border border-line bg-white dark:bg-slate-900 px-2 py-2 text-[13px]"
          >
            <option value="">Semua role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {adminPages > 1 && (
            <span className="inline-flex items-center gap-2 ml-auto text-[12.5px] text-muted">
              <button disabled={safeAdminPage <= 1} onClick={() => setAdminPage(safeAdminPage - 1)} className="btn-ghost !py-1.5 text-[12.5px] disabled:opacity-50">‹ Sebelumnya</button>
              <span>Halaman {safeAdminPage} dari {adminPages}</span>
              <button disabled={safeAdminPage >= adminPages} onClick={() => setAdminPage(safeAdminPage + 1)} className="btn-ghost !py-1.5 text-[12.5px] disabled:opacity-50">Berikutnya ›</button>
            </span>
          )}
        </div>
        {filteredAdmins.length === 0 ? (
          <p className="text-[13px] text-muted mt-2">Belum ada penugasan Admin WOORK.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pagedAdmins.map((a) => (
              <div key={`${a.userId}-${a.roleId}`} className="flex flex-wrap items-center gap-3 rounded-btn border border-line p-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[13.5px] font-semibold text-ink">{a.userName}</p>
                  <p className="text-[12.5px] text-muted">{a.userEmail} · {a.roleName}</p>
                </div>
                <span className={cn('text-[12px] text-muted', a.userStatus !== 'ACTIVE' && 'text-amber-600')}>
                  {a.userStatus !== 'ACTIVE' ? `Pengguna ${a.userStatus}` : `Sejak ${new Date(a.createdAt).toLocaleDateString('id-ID')}`}
                </span>
                <button onClick={() => revoke(a)} className="btn-ghost !py-2 text-[13px] !text-danger">Cabut</button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
