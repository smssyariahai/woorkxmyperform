'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Field } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { ArrowLeft, KeyRound, Crown } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function OfficeDetailClient({ id }: { id: string }) {
  const [members, setMembers] = useState<any[]>([]);
  const [officeName, setOfficeName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [subdomain, setSubdomain] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState<any>(null);
  const [newPw, setNewPw] = useState('');
  const [subscription, setSubscription] = useState<any>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/super/offices/${id}/users`);
    const j = await r.json();
    if (j.success) {
      setMembers(j.data.members);
      setOfficeName(j.data.office.name);
    }
    const r2 = await fetch(`/api/super/offices?q=`);
    const j2 = await r2.json();
    const o = j2.success ? j2.data.find((x: any) => x.id === id) : null;
    if (o) {
      setIsActive(o.isActive);
      setSubdomain(o.subdomain ?? '');
      setSubscription(o.subscription ?? null);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!officeName.trim()) { toast.error('Nama kantor tidak boleh kosong.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/super/offices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: officeName.trim(), isActive, subdomain: subdomain.trim() || null }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      if (j.data.subdomain) setSubdomain(j.data.subdomain);
      if (j.data.dnsOk === false) {
        toast.warning(`Kantor diperbarui, tetapi DNS gagal: ${j.data.dnsError || 'periksa nanti'}.`);
      } else {
        toast.success('Kantor diperbarui.' + (j.data.siteUrl ? ` Situs: ${j.data.siteUrl}` : ''));
      }
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function doReset() {
    if (newPw.length < 8) { toast.error('Password minimal 8 karakter.'); return; }
    try {
      const r = await fetch(`/api/super/users/${resetFor.user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Password ${resetFor.user.name} direset.`);
      setResetFor(null);
      setNewPw('');
    } catch (e: any) {
      toast.error(e.message || 'Gagal me-reset password.');
    }
  }

  async function toggleSuper(m: any) {
    const target = !m.user.isSuperAdmin;
    if (!confirm(`${target ? 'Beri' : 'Cabut'} status Administrator Pusat untuk ${m.user.name}?`)) return;
    try {
      const r = await fetch(`/api/super/users/${m.user.id}/superadmin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSuperAdmin: target }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Status diperbarui.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status.');
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-5">
      <Link href="/admin/offices" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Kembali ke daftar kantor
      </Link>

      <Card>
        <CardTitle>Pengaturan Kantor</CardTitle>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <Field label="Nama kantor">
            <Input value={officeName} onChange={(e) => setOfficeName(e.target.value)} />
          </Field>
          <Field label="Subdomain (situs publik)">
            <div className="flex items-center gap-1.5">
              <Input value={subdomain} onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="sinergi" className="!w-40" />
              <span className="text-[13px] text-muted whitespace-nowrap">.xsramazys.dev</span>
            </div>
          </Field>
          <Field label="Status">
            <button
              onClick={() => setIsActive((v) => !v)}
              className={cn(
                'inline-flex items-center gap-2 rounded-btn border px-4 py-2 text-[13px] font-medium transition-colors',
                isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-line bg-canvas text-muted'
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', isActive ? 'bg-emerald-500' : 'bg-slate-400')} />
              {isActive ? 'Aktif' : 'Nonaktif'}
            </button>
          </Field>
        </div>
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-ink mb-2 flex items-center gap-1.5">
            <Crown className="h-4 w-4 text-amber-500" /> Langganan Modular
          </p>
          {subscription ? (
            <div className="rounded-btn border border-line bg-canvas p-4 text-[13.5px] space-y-1.5">
              <p className="flex justify-between gap-3"><span className="text-muted">Status</span><b>{subscription.status === 'ACTIVE' ? 'Aktif' : subscription.status === 'PENDING_PAYMENT' ? 'Menunggu Pembayaran' : subscription.status}</b></p>
              <p className="flex justify-between gap-3"><span className="text-muted">Siklus</span><b>{subscription.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'}</b></p>
              <p className="flex justify-between gap-3"><span className="text-muted">Kuota karyawan</span><b>{subscription.userQuota} pengguna</b></p>
              <p className="flex justify-between gap-3"><span className="text-muted">Periode</span><b>{subscription.startDate ? new Date(subscription.startDate).toLocaleDateString('id-ID') : '—'} – {subscription.endDate ? new Date(subscription.endDate).toLocaleDateString('id-ID') : '—'}</b></p>
              <p className="flex justify-between gap-3"><span className="text-muted">Modul berbayar</span><b>{(subscription.modules ?? []).length > 0 ? subscription.modules.join(', ') : 'Tidak ada (hanya Dashboard & Setting)'}</b></p>
              <p className="pt-1">
                <Link href="/admin/invoices" className="font-medium text-brand hover:underline">Lihat Invoice kantor ini →</Link>
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-muted">Kantor ini belum memiliki langganan modul.</p>
          )}
          <p className="mt-1.5 text-[12px] text-muted">Modul & masa langganan diatur lewat invoice — bukan dari halaman ini.</p>
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={save} disabled={saving} className="btn-primary !py-2 text-[13px]">
            {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
        </div>
      </Card>

      <Card>
        <CardTitle>Pengguna Kantor ({members.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Nama</th><th>Email</th><th>Role</th><th>Divisi</th><th>Status</th><th className="!text-right">Aksi</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="font-medium">
                    {m.user.name}
                    {m.user.isSuperAdmin && (
                      <span className="ml-2 inline-flex items-center gap-1 badge badge-amber !text-[10px]">
                        <Crown className="h-3 w-3" /> Pusat
                      </span>
                    )}
                  </td>
                  <td className="text-muted">{m.user.email}</td>
                  <td><Badge tone="blue">{m.role}</Badge></td>
                  <td className="text-muted">{m.department ?? '—'}</td>
                  <td>
                    <Badge tone={m.status === 'ACTIVE' ? 'green' : 'gray'}>
                      {m.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </td>
                  <td className="!text-right">
                    <span className="inline-flex gap-1 justify-end">
                      <button
                        onClick={() => setResetFor(m)}
                        title="Reset password"
                        className="inline-flex items-center justify-center rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleSuper(m)}
                        title={m.user.isSuperAdmin ? 'Cabut Administrator Pusat' : 'Jadikan Administrator Pusat'}
                        className={cn(
                          'inline-flex items-center justify-center rounded-btn p-2 transition-colors',
                          m.user.isSuperAdmin ? 'text-amber-600 hover:bg-amber-50' : 'text-muted hover:bg-amber-50 hover:text-amber-600'
                        )}
                      >
                        <Crown className="h-4 w-4" />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {resetFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-900/45" onClick={() => setResetFor(null)} />
          <div className="relative card w-full max-w-sm p-6 shadow-pop space-y-4">
            <CardTitle>Reset Password</CardTitle>
            <p className="text-[13px] text-muted">
              Password baru untuk <b className="text-ink">{resetFor.user.name}</b> ({resetFor.user.email}).
              Sesi aktif user akan dicabut.
            </p>
            <Field label="Password baru (min. 8 karakter)">
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <button onClick={() => setResetFor(null)} className="btn-ghost !py-2 text-[13px]">Batal</button>
              <button onClick={doReset} className="btn-primary !py-2 text-[13px]">Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
