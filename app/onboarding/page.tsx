'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Logo } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Check, MessageCircle, Instagram, Facebook, Globe, Plus, X, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { completeOnboardingAction } from './actions';

const STEPS = ['Profil perusahaan', 'Pilih channel', 'Undang tim', 'Selesai'];

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: '#22C55E' },
  { key: 'instagram', label: 'Instagram', icon: Instagram, color: '#C13584' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, color: '#1877F2' },
  { key: 'website', label: 'Website Chat', icon: Globe, color: '#087BFF' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [channels, setChannels] = useState<string[]>(['whatsapp']);
  const [emails, setEmails] = useState<string[]>(['']);

  function toggleChannel(key: string) {
    setChannels((cs) => (cs.includes(key) ? cs.filter((c) => c !== key) : [...cs, key]));
  }

  function next() {
    if (step === 0 && company.trim().length < 2) {
      toast.error('Isi nama perusahaan dulu ya.');
      return;
    }
    if (step === 1 && channels.length === 0) {
      toast.error('Pilih minimal 1 channel.');
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  }

  async function finish() {
    setLoading(true);
    const invites = emails.map((e) => e.trim()).filter((e) => /.+@.+\..+/.test(e));
    const res = await completeOnboardingAction({ company, industry, teamSize, channels, invites });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success('Workspace siap digunakan!');
    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8" aria-label="Progress onboarding">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold transition-colors',
                  i < step ? 'bg-wa text-white' : i === step ? 'bg-brand text-white' : 'bg-slate-200 text-muted dark:bg-slate-700'
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn('text-[12px] font-medium hidden sm:block', i === step ? 'text-ink' : 'text-muted')}>
                {s}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-line" />}
            </div>
          ))}
        </div>

        <div className="card p-8">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-[20px] font-bold text-ink">Profil perusahaan</h2>
              <p className="text-sm text-muted -mt-2">Ceritakan sedikit tentang bisnis Anda.</p>
              <Field label="Nama perusahaan">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="PT Maju Bersama" />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Industri" optional>
                  <select className="input" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                    <option value="">Pilih industri…</option>
                    {['Retail', 'F&B', 'Fashion', 'Jasa', 'Teknologi', 'Kesehatan', 'Pendidikan', 'Lainnya'].map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Jumlah anggota tim" optional>
                  <select className="input" value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
                    <option value="">Pilih…</option>
                    {['1-5', '6-20', '21-50', '51-200', '200+'].map((t) => (
                      <option key={t} value={t}>{t} orang</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-[20px] font-bold text-ink">Pilih channel</h2>
              <p className="text-sm text-muted mt-1 mb-5">Channel apa saja yang ingin dihubungkan ke WOORK?</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {CHANNELS.map((c) => {
                  const active = channels.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleChannel(c.key)}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center gap-3 rounded-card border p-4 text-left transition-all',
                        active ? 'border-brand ring-2 ring-brand/15 bg-brand-50/50 dark:bg-brand-900/20' : 'border-line hover:border-brand/40'
                      )}
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                        style={{ background: c.color }}
                      >
                        <c.icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1 text-[14px] font-semibold text-ink">{c.label}</span>
                      {active && <Check className="h-5 w-5 text-brand" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-[20px] font-bold text-ink">Undang tim</h2>
              <p className="text-sm text-muted mt-1 mb-5">
                Undang anggota tim Anda. Bisa dilewati dan ditambahkan nanti.
              </p>
              <div className="space-y-3">
                {emails.map((em, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="nama@perusahaan.com"
                      value={em}
                      onChange={(e) =>
                        setEmails((list) => list.map((v, j) => (j === i ? e.target.value : v)))
                      }
                    />
                    {emails.length > 1 && (
                      <button
                        className="btn-ghost !px-2.5"
                        onClick={() => setEmails((l) => l.filter((_, j) => j !== i))}
                        aria-label="Hapus"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="btn-secondary !py-2 text-[13px]"
                  onClick={() => setEmails((l) => [...l, ''])}
                >
                  <Plus className="h-4 w-4" /> Tambah email
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-6">
              <PartyPopper className="mx-auto h-14 w-14 text-brand" />
              <h2 className="mt-4 text-[22px] font-bold text-ink">Semua siap!</h2>
              <p className="mt-2 text-sm text-muted max-w-md mx-auto">
                Workspace <b className="text-ink">{company}</b> berhasil disiapkan dengan{' '}
                {channels.length} channel. Mulai kelola pelanggan Anda sekarang.
              </p>
            </div>
          )}

          <div className="mt-8 flex justify-between">
            <Button variant="secondary" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}>
              Kembali
            </Button>
            {step < 3 ? (
              <Button onClick={next}>Lanjut</Button>
            ) : (
              <Button onClick={finish} loading={loading}>
                Mulai menggunakan WOORK
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
