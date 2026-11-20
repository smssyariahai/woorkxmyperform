'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/primitives';
import { Field, Input } from '@/components/ui/input';
import { ArrowLeft, ArrowRight, Building2, Check, KeyRound, Receipt, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatIDR } from '@/lib/modular';

interface PriceRow {
  moduleKey: string;
  monthlyPerUser: number;
  yearlyPerUser: number;
}

const MODULE_LABELS: Record<string, string> = {
  chat: 'Chat (Inbox, CRM, Broadcast, Saluran, Bot)',
  hris: 'HRIS (HR, Kantor Virtual, Divisi, E-Sign)',
  audit: 'Audit Trail Log',
};

export function OfficeWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [done, setDone] = useState<any | null>(null);

  // Langkah 1 — detail kantor
  const [office, setOffice] = useState({ name: '', description: '', email: '', phone: '', address: '' });
  // Langkah 2 — admin kantor
  const [admin, setAdmin] = useState({ adminName: '', adminEmail: '', adminPassword: '' });
  // Langkah 3 — langganan
  const [modules, setModules] = useState<string[]>(['chat', 'hris', 'audit']);
  const [userQuota, setUserQuota] = useState(10);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    fetch('/api/super/module-prices')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setPrices(j.data);
      })
      .catch(() => {});
  }, []);

  const priceByKey = useMemo(() => new Map(prices.map((p) => [p.moduleKey, p])), [prices]);

  const total = useMemo(() => {
    const perUser = modules.reduce((sum, key) => {
      const p = priceByKey.get(key);
      if (!p) return sum;
      return sum + (billingCycle === 'YEARLY' ? p.yearlyPerUser : p.monthlyPerUser);
    }, 0);
    return perUser * Math.max(0, userQuota);
  }, [modules, userQuota, billingCycle, priceByKey]);

  const periodEnd = useMemo(() => {
    const d = new Date(startDate || new Date());
    if (billingCycle === 'YEARLY') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }, [startDate, billingCycle]);

  function toggleModule(key: string) {
    setModules((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  function validStep1() {
    if (!office.name.trim()) { toast.error('Nama kantor wajib diisi.'); return false; }
    return true;
  }

  function validStep2() {
    if (!admin.adminName.trim() || !admin.adminEmail.trim() || admin.adminPassword.length < 8) {
      toast.error('Lengkapi data admin kantor (password min. 8 karakter).');
      return false;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin.adminEmail)) {
      toast.error('Format email admin tidak valid.');
      return false;
    }
    return true;
  }

  async function submit() {
    if (userQuota < 1) { toast.error('Kuota karyawan minimal 1.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/super/offices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...office,
          ...admin,
          modules,
          userQuota,
          billingCycle,
          startDate,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setDone(j.data);
      toast.success(`Kantor "${office.name}" dibuat. Invoice ${j.data.invoice.number} terbit.`);
    } catch (e: any) {
      toast.error(e.message || 'Gagal membuat kantor.');
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    { n: 1, label: 'Detail Kantor', icon: Building2 },
    { n: 2, label: 'Admin Kantor', icon: KeyRound },
    { n: 3, label: 'Langganan & Harga', icon: Wallet },
  ];

  if (done) {
    return (
      <div className="max-w-[640px] mx-auto space-y-5">
        <Card className="!p-6 text-center space-y-4">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="h-6 w-6" />
          </span>
          <h1 className="text-[20px] font-bold text-ink">Kantor &ldquo;{done.name}&rdquo; dibuat</h1>
          <p className="text-sm text-muted leading-relaxed">
            Situs publik: <b className="text-ink">{done.siteUrl}</b>
            {done.dnsOk ? '' : ` (DNS gagal: ${done.dnsError || 'periksa nanti'})`}
            <br />
            Langganan berstatus <b className="text-amber-600">Menunggu Pembayaran</b> — admin kantor
            baru bisa login setelah invoice ditandai lunas.
          </p>
          <div className="rounded-btn border border-line bg-canvas p-4 text-left text-[13.5px] space-y-1.5">
            <p className="flex justify-between"><span className="text-muted">Invoice</span><b>{done.invoice.number}</b></p>
            <p className="flex justify-between"><span className="text-muted">Total</span><b>{formatIDR(done.invoice.total)}</b></p>
            <p className="flex justify-between"><span className="text-muted">Jatuh tempo</span><b>{new Date(done.invoice.dueDate).toLocaleDateString('id-ID')}</b></p>
            <p className="flex justify-between"><span className="text-muted">Periode</span><b>{new Date(done.subscription.startDate).toLocaleDateString('id-ID')} – {new Date(done.subscription.endDate).toLocaleDateString('id-ID')}</b></p>
          </div>
          <div className="flex justify-center gap-2">
            <Link href={`/admin/invoices/${done.invoice.id}`} className="btn-primary !py-2 text-[13px]">
              <Receipt className="h-4 w-4" /> Lihat Invoice
            </Link>
            <Link href="/admin/offices" className="btn-ghost !py-2 text-[13px]">Kembali ke Daftar Kantor</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto space-y-5">
      <div>
        <Link href="/admin/offices" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-brand mb-3">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Kantor
        </Link>
        <h1 className="text-[22px] font-bold text-ink">Buat Kantor Baru</h1>
        <p className="text-sm text-muted">Kantor dibuat beserta admin, langganan modul, dan invoice pertama.</p>
      </div>

      {/* Indikator langkah */}
      <div className="flex items-center gap-2">
        {steps.map((s) => (
          <button
            key={s.n}
            onClick={() => s.n < step && setStep(s.n)}
            className={cn(
              'flex flex-1 items-center gap-2 rounded-btn border px-3 py-2.5 text-left transition-colors',
              step === s.n ? 'border-brand bg-brand-50 text-brand-700' : 'border-line text-muted'
            )}
          >
            <s.icon className="h-4 w-4 shrink-0" />
            <span className="text-[12.5px] font-semibold leading-tight">
              <span className="block text-[10.5px] font-bold uppercase tracking-wide opacity-70">Langkah {s.n}</span>
              {s.label}
            </span>
          </button>
        ))}
      </div>

      <Card className="!p-6 space-y-4">
        {step === 1 && (
          <>
            <Field label="Nama kantor *"><Input value={office.name} onChange={(e) => setOffice({ ...office, name: e.target.value })} placeholder="SINERGI" /></Field>
            <p className="-mt-2 text-[12px] text-muted">Subdomain & situs publik dibuat otomatis, mis. <b>sinergi.xsramazys.dev</b>.</p>
            <Field label="Deskripsi"><Input value={office.description} onChange={(e) => setOffice({ ...office, description: e.target.value })} placeholder="Deskripsi singkat kantor" /></Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Email kantor"><Input type="email" value={office.email} onChange={(e) => setOffice({ ...office, email: e.target.value })} placeholder="kantor@contoh.id" /></Field>
              <Field label="Telepon / WhatsApp"><Input value={office.phone} onChange={(e) => setOffice({ ...office, phone: e.target.value })} placeholder="08xxxxxxxxxx" /></Field>
            </div>
            <Field label="Alamat"><Input value={office.address} onChange={(e) => setOffice({ ...office, address: e.target.value })} placeholder="Alamat kantor" /></Field>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-[13px] text-muted">Akun ini menjadi pemilik (OWNER) kantor dan bisa login setelah invoice pertama lunas.</p>
            <Field label="Nama lengkap *"><Input value={admin.adminName} onChange={(e) => setAdmin({ ...admin, adminName: e.target.value })} placeholder="Nama admin" /></Field>
            <Field label="Email *"><Input type="email" value={admin.adminEmail} onChange={(e) => setAdmin({ ...admin, adminEmail: e.target.value })} placeholder="admin@kantor.id" /></Field>
            <Field label="Password awal *"><Input type="password" value={admin.adminPassword} onChange={(e) => setAdmin({ ...admin, adminPassword: e.target.value })} placeholder="Min. 8 karakter" /></Field>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <p className="text-[13px] font-semibold text-ink mb-2">Modul berbayar yang digunakan</p>
              <div className="space-y-2">
                {Object.entries(MODULE_LABELS).map(([key, label]) => {
                  const p = priceByKey.get(key);
                  const checked = modules.includes(key);
                  return (
                    <label key={key} className={cn('flex items-center gap-3 rounded-btn border px-4 py-3 cursor-pointer transition-colors', checked ? 'border-brand bg-brand-50/60' : 'border-line')}>
                      <input type="checkbox" checked={checked} onChange={() => toggleModule(key)} className="h-4 w-4 accent-brand" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-medium text-ink">{label}</span>
                        <span className="block text-[12px] text-muted">
                          {p ? `${formatIDR(p.monthlyPerUser)}/user/bulan · ${formatIDR(p.yearlyPerUser)}/user/tahun` : 'Memuat harga…'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-[12px] text-muted">Dashboard & Setting selalu ikut tanpa biaya.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Kuota karyawan (jumlah user) *">
                <Input type="number" min={1} value={userQuota} onChange={(e) => setUserQuota(Number(e.target.value))} />
              </Field>
              <Field label="Siklus langganan">
                <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as 'MONTHLY' | 'YEARLY')} className="input w-full">
                  <option value="MONTHLY">Bulanan</option>
                  <option value="YEARLY">Tahunan (hemat 2 bulan)</option>
                </select>
              </Field>
            </div>
            <Field label="Tanggal mulai langganan">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>

            <div className="rounded-btn border border-line bg-canvas p-4 text-[13.5px] space-y-1.5">
              <p className="font-semibold text-ink">Ringkasan biaya</p>
              {modules.length === 0 && <p className="text-muted">Tidak ada modul berbayar — invoice Rp0.</p>}
              {modules.map((key) => {
                const p = priceByKey.get(key);
                if (!p) return null;
                const unit = billingCycle === 'YEARLY' ? p.yearlyPerUser : p.monthlyPerUser;
                return (
                  <p key={key} className="flex justify-between">
                    <span className="text-muted">{MODULE_LABELS[key]} × {userQuota} user</span>
                    <b>{formatIDR(unit * userQuota)}</b>
                  </p>
                );
              })}
              <p className="flex justify-between border-t border-line pt-2 text-[15px]">
                <span className="font-semibold">Total {billingCycle === 'YEARLY' ? 'tahunan' : 'bulanan'}</span>
                <b className="text-brand">{formatIDR(total)}</b>
              </p>
              <p className="text-[12px] text-muted">Periode: {startDate} – {periodEnd}. Invoice jatuh tempo 7 hari setelah dibuat.</p>
            </div>
          </>
        )}

        <div className="flex justify-between pt-2">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="btn-ghost !py-2 text-[13px] disabled:opacity-40"
          >
            Kembali
          </button>
          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 1 && validStep1()) setStep(2);
                if (step === 2 && validStep2()) setStep(3);
              }}
              className="btn-primary !py-2 text-[13px]"
            >
              Lanjut <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={busy} className="btn-primary !py-2 text-[13px]">
              {busy ? 'Menyimpan…' : 'Buat Kantor & Terbitkan Invoice'}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
