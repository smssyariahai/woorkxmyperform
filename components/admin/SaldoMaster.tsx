'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import {
  Wallet, Users, Bot, TrendingUp, TrendingDown, ShieldAlert, Calculator,
  Plus, Settings2, Download, History, X, AlertTriangle, CheckCircle2,
  Landmark, Sparkles,
} from 'lucide-react';

function rp(n: number) {
  return 'Rp' + (n ?? 0).toLocaleString('id-ID');
}

function statusTone(s: string): 'green' | 'amber' | 'red' {
  if (s === 'KRITIS') return 'red';
  if (s === 'PERINGATAN') return 'amber';
  return 'green';
}

function statusLabel(s: string) {
  if (s === 'KRITIS') return 'Kritis';
  if (s === 'PERINGATAN') return 'Peringatan';
  return 'Aman';
}

function typeTone(t: string): 'green' | 'blue' | 'amber' | 'gray' {
  if (t === 'MASTER_TOPUP') return 'green';
  if (t === 'DISTRIBUTE') return 'blue';
  if (t === 'USAGE') return 'amber';
  return 'gray';
}

/** Panel Administrator Pusat: Saldo Master WOORK.ID. */
export function SaldoMaster() {
  const [stats, setStats] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showTopup, setShowTopup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [topupAmt, setTopupAmt] = useState('');
  const [minBal, setMinBal] = useState('');
  const [critBal, setCritBal] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        fetch('/api/super/master').then((r) => r.json()),
        fetch(`/api/super/master/transactions?page=${p}&perPage=15`).then((r) => r.json()),
      ]);
      if (s.success) setStats(s.data);
      if (t.success) { setTxs(t.data.items); setTotal(t.data.total); setPage(t.data.page); }
    } catch { toast.error('Gagal memuat Saldo Master.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1); }, [load]);

  async function doTopup() {
    const amount = parseInt(topupAmt.replace(/\D/g, ''), 10);
    if (!amount || amount < 1000) { toast.error('Nominal minimal Rp1.000.'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/super/master/topup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Saldo Master bertambah ${rp(amount)}.`);
      setShowTopup(false); setTopupAmt('');
      load(page);
    } catch (e: any) { toast.error(e.message || 'Gagal menambah saldo.'); }
    finally { setSaving(false); }
  }

  async function doSaveSettings() {
    const min = parseInt(minBal.replace(/\D/g, ''), 10);
    const crit = parseInt(critBal.replace(/\D/g, ''), 10);
    if (!Number.isFinite(min) || !Number.isFinite(crit)) { toast.error('Isi kedua batas saldo.'); return; }
    if (crit > min) { toast.error('Saldo kritis harus lebih kecil dari saldo minimum.'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/super/master/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minBalance: min, criticalBalance: crit }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Batas saldo disimpan.');
      setShowSettings(false);
      load(page);
    } catch (e: any) { toast.error(e.message || 'Gagal menyimpan.'); }
    finally { setSaving(false); }
  }

  const cards = stats ? [
    { label: 'Total Saldo Tenant', value: rp(stats.totalTenant), sub: 'akumulasi semua tenant', icon: Users, chip: 'bg-sky-100 text-sky-600' },
    { label: 'Pemakaian AI-Agent', value: rp(stats.totalUsage), sub: `${(stats.totalUsage / (stats.pricePerReply || 500)).toLocaleString('id-ID')} balasan terbayar`, icon: Bot, chip: 'bg-violet-100 text-violet-600' },
    { label: 'Total Masuk', value: rp(stats.totalIn), sub: 'dana masuk ke Master', icon: TrendingUp, chip: 'bg-emerald-100 text-emerald-600' },
    { label: 'Total Keluar', value: rp(stats.totalOut), sub: 'distribusi & pemakaian', icon: TrendingDown, chip: 'bg-rose-100 text-rose-600' },
    { label: 'Saldo Minimum', value: rp(stats.minBalance), sub: 'batas proteksi', icon: ShieldAlert, chip: 'bg-amber-100 text-amber-600' },
    { label: 'Estimasi Sisa', value: `${(stats.estimasiSisa ?? 0).toLocaleString('id-ID')} balasan`, sub: `dengan tarif ${rp(stats.pricePerReply)}`, icon: Calculator, chip: 'bg-slate-200 text-slate-600' },
  ] : [];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-brand" />
            <h1 className="text-[22px] font-extrabold tracking-tight text-ink">Saldo Master</h1>
          </div>
          <p className="mt-1 text-[13px] text-muted">Dompet pusat AI-Agent WOORK.ID — seluruh distribusi & pemakaian tercatat otomatis di sini.</p>
        </div>
        {stats && <Badge tone={statusTone(stats.status)} className="!px-3 !py-1.5 !text-[13px]">{statusLabel(stats.status)}</Badge>}
      </div>

      {/* Alert */}
      {stats?.status !== 'AMAN' && stats && (
        <div className={cn('flex items-start gap-3 rounded-2xl border p-4 text-[13px] shadow-sm',
          stats.status === 'KRITIS' ? 'border-red-200 bg-red-50/80 text-red-800' : 'border-amber-200 bg-amber-50/80 text-amber-800')}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">{stats.status === 'KRITIS' ? 'Saldo Master kritis' : 'Peringatan saldo Master'}</p>
            <p className="mt-0.5 opacity-90">
              {stats.status === 'KRITIS'
                ? 'Distribusi ke tenant & pemakaian AI berbayar diblokir otomatis sampai saldo ditambah di atas batas minimum.'
                : 'Saldo mendekati batas minimum. Segera tambah Saldo Master agar layanan tidak terhenti.'}
            </p>
          </div>
        </div>
      )}

      {loading && !stats ? (
        <div className="space-y-4">
          <Skeleton className="h-44 !rounded-2xl" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 !rounded-2xl" />)}
          </div>
        </div>
      ) : stats && (
        <>
          {/* Hero: saldo utama */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 p-6 sm:p-8 text-white shadow-lg">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -left-10 -bottom-16 h-40 w-40 rounded-full bg-white/5" />
            <div className="relative">
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-widest text-blue-100">
                <Wallet className="h-4 w-4" /> Saldo Master Saat Ini
              </div>
              <div className="mt-2 text-[38px] font-extrabold tracking-tight tabular-nums sm:text-[46px]">
                {rp(stats.balance)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-blue-100">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" /> Minimum {rp(stats.minBalance)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Kritis ≤ {rp(stats.criticalBalance)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Cukup untuk ±{(stats.estimasiSisa ?? 0).toLocaleString('id-ID')} balasan
                </span>
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', c.chip)}>
                    <c.icon className="h-5 w-5" />
                  </div>
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{c.label}</p>
                </div>
                <p className="mt-3 text-[21px] font-extrabold tracking-tight text-ink tabular-nums">{c.value}</p>
                <p className="mt-0.5 text-[12px] text-muted">{c.sub}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2.5">
        <Button onClick={() => setShowTopup(true)} className="!rounded-xl !px-5 !py-2.5 shadow-sm">
          <Plus className="mr-1.5 h-4 w-4" /> Tambah Saldo Master
        </Button>
        <Button variant="secondary" onClick={() => {
          setMinBal(String(stats?.minBalance ?? '')); setCritBal(String(stats?.criticalBalance ?? '')); setShowSettings(true);
        }} className="!rounded-xl !px-5 !py-2.5">
          <Settings2 className="mr-1.5 h-4 w-4" /> Pengaturan Saldo Minimum
        </Button>
        <Link href="/bot">
          <Button variant="secondary" className="!rounded-xl !px-5 !py-2.5">Pengaturan Biaya AI-Agent</Button>
        </Link>
        <a href="/api/super/master/report" download>
          <Button variant="secondary" className="!rounded-xl !px-5 !py-2.5">
            <Download className="mr-1.5 h-4 w-4" /> Unduh Laporan
          </Button>
        </a>
      </div>

      {/* Riwayat */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <CardTitle className="!text-[15px] flex items-center gap-2">
            <History className="h-4 w-4 text-muted" /> Riwayat Transaksi
          </CardTitle>
          <span className="text-[12px] text-muted">{total.toLocaleString('id-ID')} transaksi</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Jenis</th>
                <th className="px-3 py-3">Tenant</th>
                <th className="px-3 py-3">Keterangan</th>
                <th className="px-3 py-3 text-right">Saldo Sebelum</th>
                <th className="px-3 py-3 text-right">Masuk</th>
                <th className="px-3 py-3 text-right">Keluar</th>
                <th className="px-5 py-3 text-right">Saldo Sesudah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {txs.map((t) => (
                <tr key={t.id} className="transition hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-5 py-3 text-[12px] text-muted tabular-nums">
                    {new Date(t.createdAt).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px] font-semibold text-ink">#{t.seq}</td>
                  <td className="px-3 py-3"><Badge tone={typeTone(t.type)}>{t.typeLabel}</Badge></td>
                  <td className="px-3 py-3 font-medium text-ink">{t.tenant ?? <span className="text-muted">—</span>}</td>
                  <td className="max-w-[240px] truncate px-3 py-3 text-[12px] text-muted" title={t.description}>{t.description ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-[12px] text-muted tabular-nums">{rp(t.balanceBefore)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-[12.5px] font-semibold text-emerald-600 tabular-nums">{t.in ? `+${rp(t.in)}` : <span className="font-normal text-slate-300">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-[12.5px] font-semibold text-rose-600 tabular-nums">{t.out ? `−${rp(t.out)}` : <span className="font-normal text-slate-300">—</span>}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-[12.5px] font-bold text-ink tabular-nums">{rp(t.balanceAfter)}</td>
                </tr>
              ))}
              {txs.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-[13px] text-muted">Belum ada transaksi.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => load(page - 1)} className="!rounded-lg !py-1.5 !text-[12.5px]">‹ Sebelumnya</Button>
          <span className="px-1 text-[12px] text-muted tabular-nums">Hal {page}</span>
          <Button variant="secondary" disabled={txs.length < 15} onClick={() => load(page + 1)} className="!rounded-lg !py-1.5 !text-[12.5px]">Berikutnya ›</Button>
        </div>
      </div>

      {/* Modal top up */}
      {showTopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]" onClick={() => setShowTopup(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-brand" /> Tambah Saldo Master</CardTitle>
              <button onClick={() => setShowTopup(false)} aria-label="Tutup" className="rounded-lg p-1 hover:bg-slate-100"><X className="h-5 w-5 text-muted" /></button>
            </div>
            <p className="mb-4 text-[12px] text-muted">Dana masuk ke dompet pusat. Tercatat di riwayat & audit.</p>
            <Field label="Nominal (Rp)">
              <Input value={topupAmt} onChange={(e) => setTopupAmt(e.target.value)} placeholder="1.000.000" inputMode="numeric" className="!rounded-xl !py-2.5 !text-[15px] font-semibold tabular-nums" />
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowTopup(false)} className="!rounded-xl">Batal</Button>
              <Button onClick={doTopup} disabled={saving} className="!rounded-xl">{saving ? 'Menyimpan…' : 'Tambah Saldo'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal settings */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]" onClick={() => setShowSettings(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-600" /> Pengaturan Saldo Minimum</CardTitle>
              <button onClick={() => setShowSettings(false)} aria-label="Tutup" className="rounded-lg p-1 hover:bg-slate-100"><X className="h-5 w-5 text-muted" /></button>
            </div>
            <p className="mb-4 text-[12px] text-muted">Transaksi yang membuat Saldo Master turun di bawah batas minimum akan ditolak otomatis.</p>
            <div className="space-y-3">
              <Field label="Saldo minimum (Rp)">
                <Input value={minBal} onChange={(e) => setMinBal(e.target.value)} placeholder="500.000" inputMode="numeric" className="!rounded-xl tabular-nums" />
              </Field>
              <Field label="Saldo kritis (Rp)">
                <Input value={critBal} onChange={(e) => setCritBal(e.target.value)} placeholder="200.000" inputMode="numeric" className="!rounded-xl tabular-nums" />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowSettings(false)} className="!rounded-xl">Batal</Button>
              <Button onClick={doSaveSettings} disabled={saving} className="!rounded-xl">{saving ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
