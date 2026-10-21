'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { Power, Wallet, MessageSquareText, Receipt, History, PlusCircle, AlertTriangle } from 'lucide-react';

function rp(n: number) {
  return 'Rp' + n.toLocaleString('id-ID');
}

/** Panel Bot AI untuk Owner: status, saldo, riwayat, top up. */
export function BotAiOwner() {
  const [data, setData] = useState<any>(null);
  const [usage, setUsage] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [topups, setTopups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [topupAmt, setTopupAmt] = useState('50000');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, u, l, t] = await Promise.all([
        fetch('/api/bot/ai').then((r) => r.json()),
        fetch('/api/bot/ai/usage').then((r) => r.json()),
        fetch('/api/bot/ai/ledger').then((r) => r.json()),
        fetch('/api/bot/ai/topup').then((r) => r.json()),
      ]);
      if (a.success) { setData(a.data); setPrompt(a.data.systemPrompt ?? ''); }
      if (u.success) setUsage(u.data.items);
      if (l.success) setLedger(l.data.items);
      if (t.success) setTopups(t.data.items);
    } catch {
      toast.error('Gagal memuat data bot.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle() {
    setSaving(true);
    try {
      const r = await fetch('/api/bot/ai', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !data.isEnabled }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Bot AI ${!data.isEnabled ? 'diaktifkan' : 'dinonaktifkan'}.`);
      load();
    } catch (e: any) { toast.error(e.message || 'Gagal.'); }
    finally { setSaving(false); }
  }

  async function savePrompt() {
    setSaving(true);
    try {
      const r = await fetch('/api/bot/ai', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: prompt.trim() || null }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Instruksi bot disimpan.');
      load();
    } catch (e: any) { toast.error(e.message || 'Gagal.'); }
    finally { setSaving(false); }
  }

  async function requestTopup() {
    const amt = parseInt(topupAmt.replace(/\D/g, ''), 10);
    if (!amt || amt < 10000) { toast.error('Nominal minimal Rp10.000.'); return; }
    try {
      const r = await fetch('/api/bot/ai/topup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Pengajuan top up dikirim. Menunggu persetujuan administrator.');
      setTopupAmt('50000');
      load();
    } catch (e: any) { toast.error(e.message || 'Gagal.'); }
  }

  if (loading) return <div className="p-6 max-w-[1100px] mx-auto"><Skeleton className="h-40" /></div>;
  if (!data) return <div className="p-6 text-sm text-muted">Gagal memuat.</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      {!data.globalEnabled && (
        <Card className="!border-amber-300 !bg-amber-50 dark:!bg-amber-900/20">
          <p className="flex items-center gap-2 text-[13.5px] font-medium text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" /> Layanan AI global sedang nonaktif oleh administrator.
          </p>
        </Card>
      )}
      {data.lowBalance && (
        <Card className="!border-red-300 !bg-red-50 dark:!bg-red-900/20">
          <p className="flex items-center gap-2 text-[13.5px] font-medium text-red-700 dark:text-red-200">
            <AlertTriangle className="h-4 w-4" /> Saldo tidak cukup untuk 1 balasan ({rp(data.pricePerReply)}). Bot tidak akan membalas sampai Anda top up.
          </p>
        </Card>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="!p-5">
          <p className="text-[12px] font-semibold text-muted uppercase tracking-wide">Status Bot</p>
          <div className="mt-2 flex items-center justify-between">
            <Badge tone={data.isEnabled ? 'green' : 'gray'}>{data.isEnabled ? 'ON' : 'OFF'}</Badge>
            <button
              onClick={toggle} disabled={saving}
              className={cn('inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-[13px] font-semibold transition-colors',
                data.isEnabled ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-brand text-white hover:bg-brand-600')}
            >
              <Power className="h-4 w-4" /> {data.isEnabled ? 'Matikan' : 'Nyalakan'}
            </button>
          </div>
          <p className="mt-2 text-[12px] text-muted">Tarif {rp(data.pricePerReply)} / balasan AI</p>
        </Card>
        <Card className="!p-5">
          <p className="text-[12px] font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Saldo Kredit</p>
          <p className="mt-2 text-[26px] font-extrabold text-ink">{rp(data.balance)}</p>
          <p className="text-[12px] text-muted">≈ {Math.floor(data.balance / data.pricePerReply)} balasan tersisa</p>
        </Card>
        <Card className="!p-5">
          <p className="text-[12px] font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5"><MessageSquareText className="h-3.5 w-3.5" /> Pemakaian</p>
          <p className="mt-2 text-[26px] font-extrabold text-ink">{data.successReplies}</p>
          <p className="text-[12px] text-muted">balasan · total {rp(data.totalSpent)}</p>
        </Card>
      </div>

      <Card>
        <CardTitle>Instruksi Bot</CardTitle>
        <p className="mt-1 text-[12.5px] text-muted">Kosongkan untuk memakai instruksi global dari administrator.</p>
        <textarea
          value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
          placeholder={data.globalSystemPrompt}
          className="mt-3 w-full rounded-btn border border-line bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[13.5px] text-ink"
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={savePrompt} disabled={saving}>Simpan Instruksi</Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Top Up Saldo</CardTitle>
        <p className="mt-1 text-[12.5px] text-muted">Pengajuan diverifikasi administrator sebelum saldo bertambah.</p>
        <div className="mt-3 flex gap-2 max-w-[420px]">
          <Input value={topupAmt} onChange={(e) => setTopupAmt(e.target.value)} placeholder="50000" inputMode="numeric" />
          <Button onClick={requestTopup} className="shrink-0"><PlusCircle className="h-4 w-4" /> Ajukan</Button>
        </div>
        {topups.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {topups.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-[13px] border-b border-line py-1.5">
                <span>{rp(t.amount)} <span className="text-muted">· {new Date(t.createdAt).toLocaleDateString('id-ID')}</span></span>
                <Badge tone={t.status === 'APPROVED' ? 'green' : t.status === 'REJECTED' ? 'red' : 'amber'}>{t.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardTitle><span className="inline-flex items-center gap-2"><History className="h-4 w-4" /> Riwayat Balasan</span></CardTitle>
          <div className="mt-3 space-y-1.5 max-h-[300px] overflow-auto">
            {usage.length === 0 && <p className="text-[13px] text-muted">Belum ada pemakaian.</p>}
            {usage.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between text-[13px] border-b border-line py-1.5">
                <span className="text-muted">{new Date(u.createdAt).toLocaleString('id-ID')}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={u.status === 'CHARGED' ? 'green' : u.status === 'REFUNDED' ? 'amber' : 'red'}>{u.status}</Badge>
                  <span className="font-semibold">{rp(u.amount)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle><span className="inline-flex items-center gap-2"><Receipt className="h-4 w-4" /> Riwayat Kredit</span></CardTitle>
          <div className="mt-3 space-y-1.5 max-h-[300px] overflow-auto">
            {ledger.length === 0 && <p className="text-[13px] text-muted">Belum ada transaksi.</p>}
            {ledger.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between text-[13px] border-b border-line py-1.5">
                <span className="min-w-0"><span className="font-medium">{l.type}</span> <span className="text-muted truncate">· {l.description ?? ''}</span></span>
                <span className={cn('font-semibold shrink-0', l.amount >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {l.amount >= 0 ? '+' : ''}{rp(l.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
