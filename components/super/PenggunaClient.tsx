'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { Search, KeyRound, UserX, UserCheck, X, Crown } from 'lucide-react';

/** Satu baris = satu keanggotaan (user di satu kantor). */
interface PenggunaItem {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  userStatus: string;
  isSuperAdmin: boolean;
  /** Baris ini adalah akun sendiri (tombol super admin disembunyikan). */
  isSelf: boolean;
  status: string;
  roleId: string;
  role: string;
  organizationId: string;
  organization: string;
  joinedAt: string;
}

interface OrgOpt {
  id: string;
  name: string;
}

const PAGE_SIZE = 20;

export function PenggunaClient() {
  const [items, setItems] = useState<PenggunaItem[]>([]);
  const [orgs, setOrgs] = useState<OrgOpt[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<PenggunaItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  // Debounce pencarian 400 ms (pola yang sama seperti PlatformAdminClient).
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        perPage: String(PAGE_SIZE),
        q: qDebounced,
        organizationId: orgFilter,
        role: roleFilter,
        status: statusFilter,
      });
      const r = await fetch(`/api/super/users?${params.toString()}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      const d = j.data ?? j;
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
      setTotalPages(Math.max(1, d.totalPages ?? 1));
      setPage(d.page ?? p);
      setOrgs(d.organizations ?? []);
      setRoles(d.roles ?? []);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat pengguna.');
    } finally {
      setLoading(false);
    }
  }, [qDebounced, orgFilter, roleFilter, statusFilter]);

  useEffect(() => { load(1); }, [load]);

  async function toggleActive(u: PenggunaItem) {
    const active = u.status !== 'ACTIVE';
    if (!confirm(`${active ? 'Aktifkan' : 'Nonaktifkan'} ${u.name} (${u.email}) di kantor ${u.organization}?`)) return;
    setBusyId(u.membershipId);
    try {
      const r = await fetch(`/api/super/memberships/${u.membershipId}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(active ? 'Pengguna diaktifkan.' : 'Pengguna dinonaktifkan.');
      load(page);
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status pengguna.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSuperAdmin(u: PenggunaItem) {
    const makeSuper = !u.isSuperAdmin;
    if (!confirm(
      makeSuper
        ? `Jadikan ${u.name} (${u.email}) sebagai Administrator Pusat? Ia akan mendapat akses penuh ke semua halaman /admin. Sesi aktifnya akan dicabut dan ia harus login ulang lewat pintu admin (/admin).`
        : `Cabut status Administrator Pusat dari ${u.name} (${u.email})? Sesi aktifnya akan dicabut dan ia harus login ulang.`
    )) return;
    const key = `super-${u.userId}`;
    setBusyId(key);
    try {
      const r = await fetch(`/api/super/users/${u.userId}/super-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSuperAdmin: makeSuper }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(
        makeSuper
          ? `${u.name} kini Administrator Pusat. Minta ia login ulang lewat /admin.`
          : `Status Administrator Pusat ${u.name} dicabut.`
      );
      load(page);
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status Administrator Pusat.');
    } finally {
      setBusyId(null);
    }
  }

  async function submitReset() {
    if (!resetTarget) return;
    if (newPassword.length < 8) { toast.error('Password baru minimal 8 karakter.'); return; }
    setResetBusy(true);
    try {
      const r = await fetch(`/api/super/users/${resetTarget.userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Password ${resetTarget.email} berhasil di-reset. Sesi aktif pengguna dicabut.`);
      setResetTarget(null);
      setNewPassword('');
    } catch (e: any) {
      toast.error(e.message || 'Gagal me-reset password.');
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Pengguna</h1>
        <p className="text-sm text-muted">
          Semua pengguna dari semua kantor. Satu baris = satu pengguna di satu kantor.
          Menonaktifkan hanya menutup akses pengguna di kantor tersebut; password yang
          di-reset berlaku untuk akunnya di semua kantor dan mencabut sesi aktifnya.
          Tombol &ldquo;Jadikan Super Admin&rdquo; memberi pengguna akses penuh Administrator
          Pusat (pengguna harus login ulang lewat pintu admin /admin).
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama / email…"
              className="!pl-9"
            />
          </div>
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="rounded-btn border border-line bg-white dark:bg-slate-900 px-2 py-2 text-[13px]"
            aria-label="Filter kantor"
          >
            <option value="">Semua kantor</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-btn border border-line bg-white dark:bg-slate-900 px-2 py-2 text-[13px]"
            aria-label="Filter role"
          >
            <option value="">Semua role</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-btn border border-line bg-white dark:bg-slate-900 px-2 py-2 text-[13px]"
            aria-label="Filter status"
          >
            <option value="">Semua status</option>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Nonaktif</option>
          </select>
        </div>
      </Card>

      <Card>
        <CardTitle>
          {total} pengguna
          {loading && <span className="text-muted font-normal"> — memuat…</span>}
        </CardTitle>
        {items.length === 0 && !loading ? (
          <p className="text-[13px] text-muted mt-2">Tidak ada pengguna yang cocok dengan filter.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2 pr-3 font-semibold">Pengguna</th>
                  <th className="py-2 pr-3 font-semibold">Kantor</th>
                  <th className="py-2 pr-3 font-semibold">Role</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.membershipId} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-ink inline-flex items-center gap-2 flex-wrap">
                        {u.name}
                        {u.isSuperAdmin && <Badge tone="amber">Administrator Pusat</Badge>}
                      </p>
                      <p className="text-[12.5px] text-muted">{u.email}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-ink">{u.organization}</td>
                    <td className="py-2.5 pr-3 text-ink">{u.role}</td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex flex-wrap gap-1">
                        <Badge tone={u.status === 'ACTIVE' ? 'green' : 'gray'}>
                          {u.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                        {u.userStatus !== 'ACTIVE' && <Badge tone="red">Akun nonaktif</Badge>}
                      </span>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={busyId === u.membershipId}
                        className="btn-ghost !py-1.5 text-[12.5px] disabled:opacity-50"
                      >
                        {u.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1"><UserX className="h-3.5 w-3.5" /> Nonaktifkan</span>
                        ) : (
                          <span className="inline-flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> Aktifkan</span>
                        )}
                      </button>
                      <button
                        onClick={() => { setResetTarget(u); setNewPassword(''); }}
                        className="btn-ghost !py-1.5 text-[12.5px]"
                      >
                        <span className="inline-flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" /> Reset password</span>
                      </button>
                      {!u.isSelf && (
                        <button
                          onClick={() => toggleSuperAdmin(u)}
                          disabled={busyId === `super-${u.userId}`}
                          className="btn-ghost !py-1.5 text-[12.5px] disabled:opacity-50"
                          title={u.isSuperAdmin ? 'Cabut status Administrator Pusat' : 'Jadikan Administrator Pusat'}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Crown className="h-3.5 w-3.5" />
                            {u.isSuperAdmin ? 'Cabut Super Admin' : 'Jadikan Super Admin'}
                          </span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2 text-[12.5px] text-muted">
            <button disabled={page <= 1} onClick={() => load(page - 1)} className="btn-ghost !py-1.5 text-[12.5px] disabled:opacity-50">‹ Sebelumnya</button>
            <span>Halaman {page} dari {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => load(page + 1)} className="btn-ghost !py-1.5 text-[12.5px] disabled:opacity-50">Berikutnya ›</button>
          </div>
        )}
      </Card>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setResetTarget(null)}>
          <div className="card w-full max-w-md p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-ink">Reset password — {resetTarget.name}</h3>
              <button onClick={() => setResetTarget(null)} className="rounded-btn p-1 text-muted hover:bg-slate-100" aria-label="Tutup">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[12.5px] text-muted mt-1">
              Password baru berlaku untuk akun {resetTarget.email} di semua kantor dan
              sesi aktif pengguna akan dicabut (pengguna harus login ulang).
            </p>
            <div className="mt-4">
              <label className="text-[12.5px] font-semibold text-ink">Password baru (min. 8 karakter)</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Masukkan password baru"
                className="mt-1"
                autoFocus
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setResetTarget(null)} className="btn-ghost !py-2 text-[13px]">Batal</button>
              <button onClick={submitReset} disabled={resetBusy} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
                {resetBusy ? 'Menyimpan…' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
