'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { PlugZap, CheckCircle2, XCircle, Wallet, TrendingUp, Users, AlertTriangle, Eye, EyeOff } from 'lucide-react';

function rp(n: number) {
  return 'Rp' + (n ?? 0).toLocaleString('id-ID');
}

/** Panel Administrator: konfigurasi 9Router global, statistik, top up. */
export function BotAiAdmin() {
  const [cfg, setCfg] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [topups, setTopups] = useState<any[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRes, setTestRes] = useState<any>(null);
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState<any>({});
  const [adjustOrg, setAdjustOrg] = useState('');
  const [adjustAmt, setAdjustAmt] = useState('');
  const [orgs, setOrgs] = useState<any[]>([]);
  const [masterBal, setMasterBal] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, t, o, m] = await Promise.all([
        fetch('/api/super/ninerouter').then((r) => r.json()),
        fetch('/api/super/ninerouter/stats').then((r) => r.json()),
        fetch('/api/super/credits/topup?status=PENDING').then((r) => r.json()),
        fetch('/api/super/offices').then((r) => r.json()).catch(() => null),
        fetch('/api/super/master').then((r) => r.json()).catch(() => null),
      ]);
      if (c.success) { setCfg(c.data); setForm({ ...c.data, apiKey: '' }); }
      if (s.success) setStats(s.data);
      if (t.success) setTopups(t.data.items);
      if (o?.success) {
        setOrgs(o.data);
        const woork = o.data.find((x: any) => x.name === 'WOORK.ID');
        if (woork) setAdjustOrg(woork.id);
      }
      if (m?.success) setMasterBal(m.data.balance);
    } catch { toast.error('Gagal memuat konfigurasi.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      const body: any = {
        enabled: !!form.enabled,
        baseUrl: form.baseUrl,
        model: form.model,
        systemPrompt: form.systemPrompt,
        maxTokens: parseInt(form.maxTokens, 10) || undefined,
        timeoutMs: parseInt(form.timeoutMs, 10) || undefined,
        fallbackMessage: form.fallbackMessage,
        pricePerReply: parseInt(form.pricePerReply, 10) ?? undefined,
      };
      if (form.apiKey) body.apiKey = form.apiKey;
      const r = await fetch('/api/super/ninerouter', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Konfigurasi 9Router disimpan.');
      setForm({ ...j.data, apiKey: '' });
      setCfg(j.data);
    } catch (e: any) { toast.error(e.message || 'Gagal menyimpan.'); }
    finally { setSaving(false); }
  }

  async function test() {
    setTesting(true);
    setTestRes(null);
    try {
      const r = await fetch('/api/super/ninerouter/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: form.baseUrl, apiKey: form.apiKey || undefined, model: form.model || undefined }),
      });
      const j = await r.json();
      setTestRes(j.success ? j.data : { ok: false, error: j.message });
      if (j.success && j.data.ok && j.data.models) setModels(j.data.models);
    } catch (e: any) { setTestRes({ ok: false, error: e.message }); }
    finally { setTesting(false); }
  }

  async function handleTopup(id: string, action: 'APPROVE' | 'REJECT') {
    if (!confirm(`${action === 'APPROVE' ? 'Setujui' : 'Tolak'} pengajuan top up ini?`)) return;
    try {
      const r = await fetch('/api/super/credits/topup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Top up ${action === 'APPROVE' ? 'disetujui' : 'ditolak'}.`);
      load();
    } catch (e: any) { toast.error(e.message || 'Gagal.'); }
  }

  async function adjust() {
    const amt = parseInt(adjustAmt.replace(/\D/g, ''), 10);
    if (!adjustOrg.trim() || !amt || amt <= 0) { toast.error('Pilih kantor dan isi nominal valid.'); return; }
    const orgName = orgs.find((o) => o.id === adjustOrg)?.name ?? adjustOrg;
    if (!confirm(`Top up ${rp(amt)} ke "${orgName}"? Didebet dari Saldo Master (${rp(masterBal ?? 0)}).`)) return;
    try {
      const r = await fetch('/api/super/credits/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: adjustOrg.trim(), amount: amt, note: 'Top up manual (didebet Saldo Master)' }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Top up berhasil. Saldo "${orgName}": ${rp(j.data.balance)}`);
      setAdjustAmt('');
      load();
    } catch (e: any) { toast.error(e.message || 'Gagal.'); }
  }

  if (loading) return <div className="p-6 max-w-[1100px] mx-auto"><Skeleton className="h-40" /></div>;
  if (!cfg) return <div className="p-6 text-sm text-muted">Gagal memuat.</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="!p-5">
            <p className="text-[12px] font-semibold text-muted uppercase">Integrasi</p>
            <p className="mt-2"><Badge tone={stats.globalEnabled ? 'green' : 'gray'}>{stats.globalEnabled ? 'AKTIF' : 'NONAKTIF'}</Badge></p>
            <p className="mt-1 text-[12px] text-muted">{stats.model}</p>
          </Card>
          <Card className="!p-5">
            <p className="text-[12px] font-semibold text-muted uppercase flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Total Balasan</p>
            <p className="mt-2 text-[24px] font-extrabold">{stats.totalCharged}</p>
            <p className="text-[12px] text-muted">{rp(stats.pricePerReply)} / balasan</p>
          </Card>
          <Card className="!p-5">
            <p className="text-[12px] font-semibold text-muted uppercase flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Pendapatan Kredit</p>
            <p className="mt-2 text-[24px] font-extrabold">{rp(stats.totalRevenue)}</p>
            <p className="text-[12px] text-muted">{stats.byOwner.length} owner aktif</p>
          </Card>
          <Card className="!p-5">
            <p className="text-[12px] font-semibold text-muted uppercase flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Top Up Pending</p>
            <p className="mt-2 text-[24px] font-extrabold">{stats.pendingTopups}</p>
            <p className="text-[12px] text-muted">menunggu persetujuan</p>
          </Card>
          <Card className="!p-5">
            <p className="text-[12px] font-semibold text-muted uppercase flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Saldo AI-Agent</p>
            <p className="mt-2 text-[24px] font-extrabold">{rp(stats.totalTenantBalance ?? 0)}</p>
            <p className="text-[12px] text-muted">{(stats.tenantBalances ?? []).length} tenant memiliki saldo</p>
          </Card>
        </div>
      )}

      <Card>
        <CardTitle><span className="inline-flex items-center gap-2"><PlugZap className="h-4 w-4" /> Konfigurasi 9Router</span></CardTitle>
        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              onClick={() => set('enabled', !form.enabled)}
              className={cn('relative h-6 w-11 rounded-full transition-colors', form.enabled ? 'bg-emerald-500' : 'bg-slate-300')}
            >
              <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', form.enabled ? 'left-[22px]' : 'left-0.5')} />
            </button>
            <span className="text-[13.5px] font-semibold">Aktifkan integrasi 9Router</span>
            <Badge tone={form.enabled ? 'green' : 'gray'}>{form.enabled ? 'ON' : 'OFF'}</Badge>
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Base URL 9Router">
              <Input value={form.baseUrl ?? ''} onChange={(e) => set('baseUrl', e.target.value)} placeholder="http://127.0.0.1:20128" />
            </Field>
            <Field label={`API Token ${cfg.apiKeySet ? `(tersimpan: ${cfg.apiKeyMasked})` : '(belum diisi)'}`}>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={form.apiKey ?? ''} onChange={(e) => set('apiKey', e.target.value)}
                  placeholder={cfg.apiKeySet ? 'Kosongkan bila tidak diubah' : 'Masukkan API token'}
                />
                <button onClick={() => setShowKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Model AI">
              {models.length > 0 ? (
                <select value={form.model ?? ''} onChange={(e) => set('model', e.target.value)}
                  className="w-full rounded-btn border border-line bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[13.5px]">
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <Input value={form.model ?? ''} onChange={(e) => set('model', e.target.value)} placeholder="muse-spark" />
              )}
            </Field>
            <Field label="Tarif per balasan (Rp)">
              <Input value={form.pricePerReply ?? ''} onChange={(e) => set('pricePerReply', e.target.value)} inputMode="numeric" />
            </Field>
          </div>

          <Field label="System prompt global">
            <textarea value={form.systemPrompt ?? ''} onChange={(e) => set('systemPrompt', e.target.value)} rows={3}
              className="w-full rounded-btn border border-line bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[13.5px] text-ink" />
          </Field>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Maks token respons">
              <Input value={form.maxTokens ?? ''} onChange={(e) => set('maxTokens', e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Timeout (ms)">
              <Input value={form.timeoutMs ?? ''} onChange={(e) => set('timeoutMs', e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Pesan fallback">
              <Input value={form.fallbackMessage ?? ''} onChange={(e) => set('fallbackMessage', e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Konfigurasi'}</Button>
            <Button variant="secondary" onClick={test} disabled={testing}>
              {testing ? 'Menguji…' : 'Test Connection'}
            </Button>
          </div>
          {testRes && (
            <div className={cn('rounded-btn border p-3 text-[13px]', testRes.ok ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50')}>
              {testRes.ok ? (
                <p className="flex items-center gap-2 text-emerald-700 font-medium"><CheckCircle2 className="h-4 w-4" /> Koneksi berhasil. {testRes.models?.length ?? 0} model tersedia.</p>
              ) : (
                <p className="flex items-center gap-2 text-red-700 font-medium"><XCircle className="h-4 w-4" /> {testRes.error}</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>Persetujuan Top Up ({topups.length})</CardTitle>
        <div className="mt-3 space-y-2">
          {topups.length === 0 && <p className="text-[13px] text-muted">Tidak ada pengajuan pending.</p>}
          {topups.map((t: any) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2">
              <div className="text-[13px]">
                <span className="font-semibold">{t.organization?.name}</span>
                <span className="text-muted"> · {rp(t.amount)} · {new Date(t.createdAt).toLocaleString('id-ID')}</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleTopup(t.id, 'APPROVE')} className="!py-1.5 text-[12.5px]">Setujui</Button>
                <Button variant="secondary" onClick={() => handleTopup(t.id, 'REJECT')} className="!py-1.5 text-[12.5px]">Tolak</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Top Up Saldo Tenant</CardTitle>
        <p className="mt-1 text-[12.5px] text-muted">
          Tambah saldo AI-Agent tenant — otomatis <span className="font-semibold text-ink">didebet dari Saldo Master</span>
          {masterBal !== null && <> (saat ini: <span className="font-semibold text-ink">{rp(masterBal)}</span>)</>}.
          Tercatat di audit.
        </p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2 max-w-[640px]">
          <select
            value={adjustOrg}
            onChange={(e) => setAdjustOrg(e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink"
          >
            <option value="">— Pilih kantor —</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <Input value={adjustAmt} onChange={(e) => setAdjustAmt(e.target.value)} placeholder="Nominal Rp" inputMode="numeric" />
          <Button onClick={adjust} className="shrink-0">Top Up</Button>
        </div>
      </Card>

      {stats?.byOwner?.length > 0 && (
        <Card>
          <CardTitle>Saldo & Pemakaian per Owner</CardTitle>
          <div className="mt-3 space-y-1.5">
            {(stats.tenantBalances ?? []).map((b: any) => {
              const usage = (stats.byOwner ?? []).find((u: any) => u.organizationId === b.organizationId);
              return (
                <div key={b.organizationId} className="flex items-center justify-between text-[13px] border-b border-line py-1.5">
                  <span className="font-medium">{b.organizationName}</span>
                  <span className="text-muted">
                    Saldo <span className={cn('font-semibold', b.balance > 0 ? 'text-emerald-600' : 'text-rose-600')}>{rp(b.balance)}</span>
                    {usage && <> · {usage.replies} balasan · <span className="font-semibold text-ink">{rp(usage.spent)}</span></>}
                  </span>
                </div>
              );
            })}
            {(stats.tenantBalances ?? []).length === 0 && (
              <p className="text-[13px] text-muted">Belum ada saldo tenant.</p>
            )}
          </div>
        </Card>
      )}

      {stats?.recentErrors?.length > 0 && (
        <Card>
          <CardTitle><span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Error Terakhir</span></CardTitle>
          <div className="mt-3 space-y-1.5">
            {stats.recentErrors.map((e: any) => (
              <div key={e.id} className="text-[13px] border-b border-line py-1.5">
                <span className="font-medium">{e.organizationName}</span>
                <span className="text-muted"> · {e.status} · {e.error ?? ''} · {new Date(e.createdAt).toLocaleString('id-ID')}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
