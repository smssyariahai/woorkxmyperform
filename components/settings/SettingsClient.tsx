'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Skeleton, ErrorState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/modal';
import { formatDateTime, cn } from '@/lib/utils';
import { Building2, User, ShieldCheck, MonitorSmartphone, CreditCard, Check } from 'lucide-react';

const TABS = [
  { key: 'general', label: 'Umum', icon: Building2 },
  { key: 'profile', label: 'Profil', icon: User },
  { key: 'security', label: 'Keamanan', icon: ShieldCheck },
  { key: 'billing', label: 'Billing', icon: CreditCard },
];

export function SettingsClient() {
  const [tab, setTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // form states
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  // billing
  const [billing, setBilling] = useState<any>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/settings');
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setData(j.data);
      setOrgName(j.data.org.name);
      setIndustry(j.data.org.industry ?? '');
      setTeamSize(j.data.org.teamSize ?? '');
      setName(j.data.user.name);
      setPhone(j.data.user.phone ?? '');
    } catch (e: any) {
      setError(e.message || 'Gagal memuat pengaturan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const r = await fetch('/api/billing');
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setBilling(j.data);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat billing.');
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'billing' && !billing && !billingLoading) loadBilling();
  }, [tab, billing, billingLoading, loadBilling]);


  async function save(scope: string, payload: any) {
    setBusy(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, ...payload }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Pengaturan disimpan.');
      if (scope === 'password') {
        setCurPw(''); setNewPw(''); setNewPw2('');
      }
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-[1000px] mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-8 max-w-[1000px] mx-auto">
        <div className="card"><ErrorState message={error} onRetry={load} /></div>
      </div>
    );
  }

  const canManage = ['OWNER', 'ADMIN'].includes(data.role);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1000px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Pengaturan</h1>
        <p className="text-sm text-muted">Kelola workspace, profil, dan keamanan akun Anda.</p>
      </div>

      <div className="flex gap-1.5 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-[13.5px] font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-brand text-brand-700'
                : 'border-transparent text-muted hover:text-ink'
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <Card>
          <CardTitle className="mb-1">Workspace</CardTitle>
          <p className="text-[13px] text-muted mb-5">
            Paket: <Badge tone="blue">{data.org.subscription?.plan ?? 'FREE'}</Badge>
          </p>
          <div className="space-y-4 max-w-lg">
            <Field label="Nama workspace">
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!canManage} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Industri" optional>
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={!canManage} />
              </Field>
              <Field label="Jumlah tim" optional>
                <select className="input" value={teamSize} onChange={(e) => setTeamSize(e.target.value)} disabled={!canManage}>
                  <option value="">Pilih…</option>
                  {['1-5', '6-20', '21-50', '51-200', '200+'].map((t) => (
                    <option key={t} value={t}>{t} orang</option>
                  ))}
                </select>
              </Field>
            </div>
            {canManage ? (
              <Button onClick={() => save('workspace', { name: orgName, industry, teamSize })} loading={busy}>
                Simpan Perubahan
              </Button>
            ) : (
              <p className="text-[12.5px] text-muted">Hanya Owner/Admin yang dapat mengubah workspace.</p>
            )}
          </div>
        </Card>
      )}

      {tab === 'profile' && (
        <Card>
          <CardTitle className="mb-5">Profil Saya</CardTitle>
          <div className="space-y-4 max-w-lg">
            <Field label="Nama lengkap">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={data.user.email} disabled />
            </Field>
            <Field label="Nomor WhatsApp" optional>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="62812xxxxxxx" />
            </Field>
            <div>
              <Button onClick={() => save('profile', { name, phone })} loading={busy}>
                Simpan Profil
              </Button>
            </div>
          </div>
        </Card>
      )}

      {tab === 'security' && (
        <div className="space-y-4">
          <Card>
            <CardTitle className="mb-5">Ubah Password</CardTitle>
            <div className="space-y-4 max-w-lg">
              <Field label="Password saat ini">
                <Input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Password baru">
                  <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
                </Field>
                <Field label="Konfirmasi password baru">
                  <Input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
                </Field>
              </div>
              <Button
                onClick={() => {
                  if (newPw !== newPw2) {
                    toast.error('Konfirmasi password tidak sama.');
                    return;
                  }
                  save('password', { currentPassword: curPw, newPassword: newPw });
                }}
                loading={busy}
              >
                Ubah Password
              </Button>
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-1">Sesi Aktif</CardTitle>
            <p className="text-[13px] text-muted mb-4">Perangkat yang pernah masuk ke akun Anda.</p>
            <div className="space-y-2.5">
              {data.sessions.length === 0 && (
                <p className="text-[13px] text-muted">Belum ada data sesi.</p>
              )}
              {data.sessions.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line/70 px-4 py-3">
                  <MonitorSmartphone className="h-5 w-5 text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-ink truncate">{s.ipAddress ?? 'IP tidak diketahui'}</p>
                    <p className="text-[11.5px] text-muted truncate">{s.userAgent ?? 'Perangkat tidak diketahui'}</p>
                  </div>
                  <span className="text-[11.5px] text-muted shrink-0">{formatDateTime(s.createdAt)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-muted">
              Arsitektur siap 2FA — hubungi admin untuk mengaktifkan verifikasi dua langkah.
            </p>
          </Card>
        </div>
      )}

      {tab === 'billing' && (
        <div className="space-y-4">
          {billingLoading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </>
          ) : billing ? (
            <>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[12.5px] text-muted">Paket aktif</p>
                    <p className="mt-1 text-[20px] font-extrabold text-ink">
                      {billing.currentPlan.name}{' '}
                      <span className="text-[14px] font-bold text-brand">
                        {billing.currentPlan.price}
                        <span className="text-[12px] font-medium text-muted">{billing.currentPlan.period}</span>
                      </span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone="green">{billing.subscription.status}</Badge>
                      {billing.subscription.currentPeriodEnd && (
                        <Badge tone="blue">
                          s/d {formatDateTime(billing.subscription.currentPeriodEnd)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CreditCard className="h-10 w-10 text-brand/30" />
                </div>
                {!billing.canManage && (
                  <p className="mt-3 text-[12.5px] text-muted">
                    Hanya owner yang dapat mengubah paket langganan.
                  </p>
                )}
              </Card>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {billing.plans.map((p: any) => {
                  const isCurrent = p.key === billing.subscription.plan;
                  return (
                    <div
                      key={p.key}
                      className={cn(
                        'relative rounded-2xl border p-4 flex flex-col bg-white dark:bg-slate-900',
                        p.popular ? 'border-brand shadow-pop' : 'border-line',
                        isCurrent && 'ring-2 ring-brand/30'
                      )}
                    >
                      {p.popular && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2.5 py-0.5 text-[10.5px] font-bold text-white whitespace-nowrap">
                          Paling populer
                        </span>
                      )}
                      <p className="text-[14px] font-bold text-ink">{p.name}</p>
                      <p className="mt-1 text-[20px] font-extrabold text-ink">
                        {p.price}
                        {p.period && <span className="text-[11.5px] font-medium text-muted">{p.period}</span>}
                      </p>
                      <ul className="mt-3 space-y-1.5 flex-1">
                        {p.features.map((f: string) => (
                          <li key={f} className="flex items-start gap-1.5 text-[12px] text-muted">
                            <Check className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4">
                        {isCurrent ? (
                          <Badge tone="green">Paket saat ini</Badge>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[12px] text-muted">
                Paket langganan ditentukan oleh Administrator Pusat.{' '}
                <Link href="/upgrade" className="font-semibold text-brand hover:underline">
                  Lihat opsi upgrade
                </Link>
              </p>
            </>
          ) : (
            <div className="card"><ErrorState message="Gagal memuat billing." onRetry={loadBilling} /></div>
          )}
        </div>
      )}

    </div>
  );
}
