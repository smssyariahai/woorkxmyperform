import Link from 'next/link';
import { Logo, Badge, Card, CardTitle, Avatar } from '@/components/ui/primitives';
import SiteHeader from '@/components/layout/SiteHeader';
import PricingCalculator, {
  type CatalogModule,
  type CatalogStorageTier,
  type CatalogUserTier,
  type PricingCatalog,
} from '@/components/marketing/PricingCalculator';
import {
  Inbox,
  Users,
  Target,
  MessageCircle,
  Zap,
  Megaphone,
  UsersRound,
  BarChart3,
  Check,
  Play,
  ArrowRight,
  ArrowDown,
  ChevronDown,
  Bot,
  GitBranch,
  Send,
  Search,
  Bell,
  Clock,
  ShieldCheck,
  Sparkles,
  Layers,
  FileCheck,
  Handshake,
  Coins,
  MoonStar,
  CalendarCheck,
  Video,
  PenLine,
  Archive,
  MapPin,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const metadata = {
  title: 'WOORK — Platform Operasional Bisnis Terpadu',
  description:
    'WOORK menyatukan CRM omnichannel (WhatsApp, Instagram, Facebook), HR, koperasi, emas, dan kantor virtual AI dalam satu workspace untuk bisnis Indonesia. Trial 30 hari gratis, tanpa kartu kredit.',
};

/* --------------------------- katalog: live + fallback --------------------------- */

/**
 * Katalog harga diambil live dari GET /api/public/pricing (sumber yang sama
 * dengan formulir pendaftaran). Bila fetch gagal, dipakai FALLBACK_CATALOG —
 * nilai yang sudah terverifikasi live dari API yang sama.
 */
const FALLBACK_CATALOG: PricingCatalog = {
  userTiers: [
    { id: 'fallback-u1', name: 'Sampai 10 pengguna', maxUsers: 10, monthlyPrice: 250000, yearlyPrice: 2500000, isCustomPrice: false, minStorageGb: 100 },
    { id: 'fallback-u2', name: 'Sampai 25 pengguna', maxUsers: 25, monthlyPrice: 450000, yearlyPrice: 4500000, isCustomPrice: false, minStorageGb: 100 },
    { id: 'fallback-u3', name: 'Sampai 50 pengguna', maxUsers: 50, monthlyPrice: 750000, yearlyPrice: 7500000, isCustomPrice: false, minStorageGb: 250 },
    { id: 'fallback-u4', name: 'Sampai 100 pengguna', maxUsers: 100, monthlyPrice: 1250000, yearlyPrice: 12500000, isCustomPrice: false, minStorageGb: 250 },
    { id: 'fallback-u5', name: 'Sampai 200 pengguna', maxUsers: 200, monthlyPrice: 2000000, yearlyPrice: 20000000, isCustomPrice: false, minStorageGb: 500 },
    { id: 'fallback-u6', name: 'Sampai 500 pengguna', maxUsers: 500, monthlyPrice: 4000000, yearlyPrice: 40000000, isCustomPrice: false, minStorageGb: 1000 },
    { id: 'fallback-u7', name: 'Di atas 500 pengguna', maxUsers: null, monthlyPrice: null, yearlyPrice: null, isCustomPrice: true, minStorageGb: 1000 },
  ],
  storageTiers: [
    { id: 'fallback-s1', name: '100 GB', capacityGb: 100, monthlyPrice: 100000, yearlyPrice: 1000000, isCustomPrice: false },
    { id: 'fallback-s2', name: '250 GB', capacityGb: 250, monthlyPrice: 200000, yearlyPrice: 2000000, isCustomPrice: false },
    { id: 'fallback-s3', name: '500 GB', capacityGb: 500, monthlyPrice: 350000, yearlyPrice: 3500000, isCustomPrice: false },
    { id: 'fallback-s4', name: '1 TB', capacityGb: 1000, monthlyPrice: 600000, yearlyPrice: 6000000, isCustomPrice: false },
    { id: 'fallback-s5', name: '2 TB', capacityGb: 2000, monthlyPrice: 1000000, yearlyPrice: 10000000, isCustomPrice: false },
    { id: 'fallback-s6', name: 'Di atas 2 TB', capacityGb: null, monthlyPrice: null, yearlyPrice: null, isCustomPrice: true },
  ],
  modules: [
    { id: 'fallback-m1', moduleKey: 'tal', name: 'TAL', monthlyPrice: 300000, yearlyPrice: 3000000 },
    { id: 'fallback-m2', moduleKey: 'koperasi', name: 'Koperasi Keanggotaan', monthlyPrice: 250000, yearlyPrice: 2500000 },
    { id: 'fallback-m3', moduleKey: 'emas', name: 'Simulasi Emas', monthlyPrice: 250000, yearlyPrice: 2500000 },
    { id: 'fallback-m4', moduleKey: 'islami', name: 'Ekosistem Islami', monthlyPrice: 100000, yearlyPrice: 1000000 },
    { id: 'fallback-m5', moduleKey: 'kantor', name: 'AI Workspace', monthlyPrice: 150000, yearlyPrice: 1500000 },
  ],
  ppnRateBps: 1100,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parseCatalog(json: unknown): PricingCatalog | null {
  if (!isRecord(json) || json.success !== true) return null;
  const data = json.data;
  if (!isRecord(data)) return null;

  const userTiers: CatalogUserTier[] = [];
  if (Array.isArray(data.userTiers)) {
    for (const t of data.userTiers) {
      if (!isRecord(t)) continue;
      const id = toStr(t.id);
      const name = toStr(t.name);
      if (!id || !name) continue;
      userTiers.push({
        id,
        name,
        maxUsers: toNum(t.maxUsers),
        monthlyPrice: toNum(t.monthlyPrice),
        yearlyPrice: toNum(t.yearlyPrice),
        isCustomPrice: t.isCustomPrice === true,
        minStorageGb: toNum(t.minStorageGb) ?? 0,
      });
    }
  }

  const storageTiers: CatalogStorageTier[] = [];
  if (Array.isArray(data.storageTiers)) {
    for (const t of data.storageTiers) {
      if (!isRecord(t)) continue;
      const id = toStr(t.id);
      const name = toStr(t.name);
      if (!id || !name) continue;
      storageTiers.push({
        id,
        name,
        capacityGb: toNum(t.capacityGb),
        monthlyPrice: toNum(t.monthlyPrice),
        yearlyPrice: toNum(t.yearlyPrice),
        isCustomPrice: t.isCustomPrice === true,
      });
    }
  }

  const modules: CatalogModule[] = [];
  if (Array.isArray(data.modules)) {
    for (const m of data.modules) {
      if (!isRecord(m)) continue;
      const id = toStr(m.id);
      const moduleKey = toStr(m.moduleKey);
      const name = toStr(m.name);
      const monthlyPrice = toNum(m.monthlyPrice);
      if (!id || !moduleKey || !name || monthlyPrice === null) continue;
      modules.push({
        id,
        moduleKey,
        name,
        monthlyPrice,
        yearlyPrice: toNum(m.yearlyPrice) ?? monthlyPrice * 10,
      });
    }
  }

  const settings = isRecord(data.settings) ? data.settings : {};
  const ppnRateBps = toNum(settings.ppnRateBps) ?? 1100;
  if (userTiers.length === 0 || storageTiers.length === 0) return null;
  return { userTiers, storageTiers, modules, ppnRateBps };
}

async function loadCatalog(): Promise<PricingCatalog> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') || 'http://localhost:3000';
  try {
    const res = await fetch(`${base}/api/public/pricing`, { next: { revalidate: 3600 } });
    if (!res.ok) return FALLBACK_CATALOG;
    const json: unknown = await res.json();
    return parseCatalog(json) ?? FALLBACK_CATALOG;
  } catch {
    return FALLBACK_CATALOG;
  }
}

/** Rp300.000 -> "Rp300rb", Rp1.250.000 -> "Rp1,25jt". */
function rpSingkat(n: number): string {
  if (n >= 1_000_000) {
    const jt = n / 1_000_000;
    return `Rp${Number.isInteger(jt) ? jt : jt.toLocaleString('id-ID')}jt`;
  }
  return `Rp${n / 1000}rb`;
}

/* ---------------------------------- data ---------------------------------- */

const HERO_STATS = [
  { value: '5', label: 'modul berbayar' },
  { value: '7', label: 'tier pengguna' },
  { value: '6', label: 'pilihan storage' },
  { value: '3', label: 'channel chat' },
];

const VALUES = [
  {
    icon: Layers,
    title: 'Semua modul dalam satu workspace',
    desc: 'CRM, HR, koperasi, emas, dan kantor virtual AI terpadu — tanpa berpindah aplikasi.',
  },
  {
    icon: ShieldCheck,
    title: 'Data terisolasi per tenant',
    desc: 'Setiap perusahaan punya database sendiri. Data Anda tidak pernah tercampur dengan tenant lain.',
  },
  {
    icon: FileCheck,
    title: 'Audit log lengkap',
    desc: 'Setiap aktivitas penting tercatat dan bisa ditelusuri kapan saja.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp Business API resmi',
    desc: 'Terhubung lewat WhatsApp Business Cloud API resmi dari Meta, bukan jalur tidak resmi.',
  },
];

const MODULE_META: Record<string, { icon: LucideIcon; desc: string }> = {
  tal: {
    icon: Users,
    desc: 'Kelola karyawan, absensi GPS, cuti, dan lembur dalam satu tempat.',
  },
  koperasi: {
    icon: Handshake,
    desc: 'Kelola anggota, simpanan, dan kegiatan koperasi Anda.',
  },
  emas: {
    icon: Coins,
    desc: 'Pantau harga emas dan simulasikan rencana tabungan emas.',
  },
  islami: {
    icon: MoonStar,
    desc: 'Jadwal salat, pengingat ibadah, dan fitur Islami untuk tim.',
  },
  kantor: {
    icon: Bot,
    desc: 'Kantor virtual 3D dengan 16 agen AI yang bekerja untuk Anda.',
  },
};

const FEATURES = [
  {
    icon: Inbox,
    title: 'Omnichannel Inbox',
    desc: 'Semua chat WhatsApp, Instagram, dan Facebook masuk ke satu kotak masuk yang rapi.',
  },
  {
    icon: Users,
    title: 'CRM',
    desc: 'Kelola data pelanggan, riwayat percakapan, dan pembelian dalam satu profil terpadu.',
  },
  {
    icon: Target,
    title: 'Lead Management',
    desc: 'Pantau setiap prospek dari baru hingga closing dengan pipeline yang jelas.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp Integration',
    desc: 'Hubungkan nomor WhatsApp Business resmi dan balas pelanggan tanpa ganti aplikasi.',
  },
  {
    icon: Zap,
    title: 'Automation',
    desc: 'Woo, asisten otomatis WOORK, menjawab pertanyaan umum dan mencatat lead 24/7.',
  },
  {
    icon: Megaphone,
    title: 'Broadcast',
    desc: 'Kirim pesan massal tertarget ke ribuan pelanggan dengan template resmi WhatsApp.',
  },
  {
    icon: UsersRound,
    title: 'Team Collaboration',
    desc: 'Bagi tugas, serahkan percakapan, dan kolaborasi dengan tim dalam satu workspace.',
  },
  {
    icon: BarChart3,
    title: 'Reporting',
    desc: 'Pantau performa tim, respons chat, dan konversi penjualan lewat dashboard analitik.',
  },
];

const INCLUDED = [
  { icon: Inbox, label: 'Inbox omnichannel' },
  { icon: Users, label: 'CRM & pipeline' },
  { icon: Megaphone, label: 'Broadcast' },
  { icon: Zap, label: 'Automasi Woo' },
  { icon: PenLine, label: 'E-Sign' },
  { icon: Archive, label: 'E-Arsip' },
  { icon: Video, label: 'WOORK MEET' },
  { icon: MapPin, label: 'Absensi GPS' },
  { icon: CalendarCheck, label: 'Kalender Kerja' },
];

const FAQS = [
  {
    q: 'Apakah WOORK menggunakan WhatsApp Business API resmi?',
    a: 'Ya. WOORK terhubung melalui WhatsApp Business Cloud API resmi dari Meta, sehingga nomor bisnis Anda aman, terverifikasi, dan mendukung template pesan broadcast resmi.',
  },
  {
    q: 'Channel apa saja yang didukung?',
    a: 'WOORK mendukung WhatsApp, Instagram Direct Message, Facebook Messenger, dan Website Chat. Semua pesan dari channel tersebut masuk ke satu inbox terpadu.',
  },
  {
    q: 'Apakah data perusahaan saya aman?',
    a: 'Keamanan adalah prioritas kami. Setiap perusahaan (tenant) punya database sendiri yang terisolasi, akses dilindungi role & permission, dan setiap aktivitas penting tercatat di audit log yang tidak bisa diubah.',
  },
  {
    q: 'Bisakah saya mencoba sebelum berlangganan?',
    a: 'Ya. Pendaftaran baru mendapatkan trial 30 hari gratis — cukup daftar, workspace Anda langsung aktif tanpa kartu kredit. Setelah trial berakhir, pilih paket yang sesuai dan lanjutkan berlangganan.',
  },
  {
    q: 'Apakah WOORK cocok untuk tim besar?',
    a: 'Sangat cocok. Tier pengguna tersedia sampai 500 pengguna — lebih dari itu ada harga khusus — dengan role bertingkat (Owner, Admin, Supervisor, Agent, Viewer), assignment percakapan, dan laporan performa tim.',
  },
];

/* ------------------------------ small pieces ------------------------------ */

function SectionHeading({
  eyebrow,
  title,
  desc,
  align = 'center',
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="text-[13px] font-bold uppercase tracking-widest text-brand-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h2>
      {desc && <p className="mt-4 text-base leading-relaxed text-muted">{desc}</p>}
    </div>
  );
}

function ChatBubble({
  from,
  text,
  time,
}: {
  from: 'customer' | 'agent';
  text: string;
  time: string;
}) {
  const isAgent = from === 'agent';
  return (
    <div className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-card px-3 py-2 text-[12.5px] leading-relaxed shadow-sm ${
          isAgent ? 'rounded-br-md bg-brand-500 text-white' : 'rounded-bl-md border border-line bg-white text-ink'
        }`}
      >
        <p>{text}</p>
        <p className={`mt-1 text-right text-[10px] ${isAgent ? 'text-white/70' : 'text-muted'}`}>{time}</p>
      </div>
    </div>
  );
}

/* ---------------------------------- hero ---------------------------------- */

function HeroMockup() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-pop dark:bg-slate-900">
        <div className="flex items-center gap-1.5 border-b border-line bg-white px-4 py-3 dark:bg-slate-900">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-warn/70" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-wa/70" aria-hidden />
          <span className="ml-2 text-[12px] font-semibold text-muted">WOORK Dashboard</span>
        </div>
        <div className="flex">
          <div className="hidden w-12 flex-col items-center gap-5 border-r border-line bg-slate-50/70 py-4 sm:flex dark:bg-slate-800/40">
            <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-brand-500 text-white">
              <Inbox className="h-4 w-4" aria-hidden />
            </span>
            <Users className="h-4 w-4 text-muted" aria-hidden />
            <Bot className="h-4 w-4 text-muted" aria-hidden />
            <Megaphone className="h-4 w-4 text-muted" aria-hidden />
            <BarChart3 className="h-4 w-4 text-muted" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-3 bg-canvas/70 p-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Pelanggan', value: '1.284' },
                { label: 'Prospek', value: '128' },
                { label: 'Konversi', value: '18,4%' },
              ].map((s) => (
                <div key={s.label} className="min-w-0 rounded-card border border-line bg-white p-3 dark:bg-slate-900">
                  <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted">{s.label}</p>
                  <p className="mt-1 truncate text-lg font-extrabold text-ink">{s.value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-card border border-line bg-white dark:bg-slate-900">
              <div className="flex text-[11px]">
                <div className="hidden w-1/2 space-y-2 border-r border-line p-2.5 min-[420px]:block">
                  {[
                    { n: 'Bu Sari', p: 'Toko kue, mau terima…', badge: 'Woo menangani', tone: 'green' as const },
                    { n: 'Pak Andi', p: 'Kalau beli 20 unit…', badge: 'Menunggu tim', tone: 'amber' as const },
                    { n: 'Bu Rina', p: 'Saya sudah transfer…', badge: null, tone: 'gray' as const },
                  ].map((c) => (
                    <div key={c.n} className="flex items-start gap-2 rounded-btn bg-slate-50 p-1.5 dark:bg-slate-800/60">
                      <Avatar name={c.n} size={22} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-ink">{c.n}</p>
                        <p className="truncate text-[10px] text-muted">{c.p}</p>
                        {c.badge && (
                          <div className="mt-1">
                            <Badge tone={c.tone}>{c.badge}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="min-w-0 flex-1 space-y-2 bg-slate-50/60 p-2.5 dark:bg-slate-800/30">
                  <ChatBubble from="customer" text="Halo, saya mau tanya paket Pro" time="09.42" />
                  <ChatBubble from="agent" text="Halo Bu Sari! Paket Pro cocok untuk usaha yang sedang berkembang." time="09.43" />
                  <div className="flex justify-center">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-center text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      Lead tercatat: Bu Sari, tahap Terkualifikasi
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -left-6 -top-6 hidden rounded-card border border-line bg-white px-3 py-2 shadow-pop lg:block dark:bg-slate-900" aria-hidden>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
          <Sparkles className="h-3.5 w-3.5 text-brand-500" /> Woo menangani 24/7
        </p>
      </div>
      <div className="absolute -bottom-6 -right-6 hidden rounded-card border border-line bg-white px-3 py-2 shadow-pop lg:block dark:bg-slate-900" aria-hidden>
        <p className="text-[11px] font-semibold text-ink">
          <span className="text-wa">+128</span> prospek minggu ini
        </p>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* gradient mesh latar */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-32 right-[-8%] h-[420px] w-[420px] rounded-full bg-brand-500/15 blur-3xl" />
        <div className="absolute -bottom-40 left-[-6%] hidden h-[380px] w-[380px] rounded-full bg-emerald-500/10 blur-3xl sm:block" />
        <div className="absolute left-1/3 top-24 hidden h-56 w-56 rounded-full bg-brand-100/60 blur-3xl lg:block dark:bg-brand-900/20" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:pb-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Badge tone="blue" className="px-3 py-1 text-[12px]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Platform operasional bisnis terpadu
            </Badge>
            <h1 className="mt-5 text-3xl font-extrabold leading-[1.15] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Satu workspace untuk seluruh operasional bisnis Anda
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              WOORK menyatukan CRM omnichannel, HR, koperasi, emas, dan kantor virtual AI dalam satu
              platform — supaya tim Anda bekerja dari satu tempat, bukan lima aplikasi.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register" className="btn-primary px-6 py-3.5 text-[15px]">
                Daftar Gratis 30 Hari <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/login" className="btn-secondary px-6 py-3.5 text-[15px]">
                <Play className="h-4 w-4" aria-hidden /> Masuk ke Workspace
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted">
              {['Trial 30 hari gratis', 'Tanpa kartu kredit', 'Aktif dalam hitungan menit'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-wa" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroMockup />
        </div>
        <dl className="mt-14 grid grid-cols-2 gap-6 border-t border-line pt-8 sm:grid-cols-4">
          {HERO_STATS.map((s) => (
            <div key={s.label}>
              <dt className="sr-only">{s.label}</dt>
              <dd className="text-3xl font-extrabold tracking-tight text-ink">{s.value}</dd>
              <dd className="mt-1 text-[13px] text-muted">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------ pita nilai -------------------------------- */

function ValueStrip() {
  return (
    <section className="border-y border-line bg-white dark:bg-slate-900/40" aria-label="Nilai utama WOORK">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((v) => (
            <div key={v.title}>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-card bg-brand-50 text-brand-600 dark:bg-brand-900/30">
                <v.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-[15px] font-bold text-ink">{v.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- modul ---------------------------------- */

function ModulSection({ modules }: { modules: CatalogModule[] }) {
  return (
    <section id="modul" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Modul berbayar"
          title="Tambah modul sesuai kebutuhan bisnis Anda"
          desc="Mulai dari paket dasar, lalu aktifkan modul yang Anda butuhkan. Setiap modul ditagih per bulan dan bisa digabung dalam satu langganan."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => {
            const meta = MODULE_META[m.moduleKey] ?? { icon: Sparkles, desc: 'Modul tambahan untuk workspace Anda.' };
            const Icon = meta.icon;
            return (
              <Card key={m.id} className="flex flex-col rounded-3xl transition-all hover:-translate-y-1 hover:shadow-pop">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-card bg-brand-50 text-brand-600 dark:bg-brand-900/30">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <CardTitle className="mt-4 text-[16px]">{m.name}</CardTitle>
                <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted">{meta.desc}</p>
                <p className="mt-5">
                  <span className="text-[22px] font-extrabold tracking-tight text-ink">{rpSingkat(m.monthlyPrice)}</span>
                  <span className="text-[13px] text-muted"> / bulan</span>
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted">atau {rpSingkat(m.yearlyPrice)} / tahun</p>
              </Card>
            );
          })}
          <a
            href="#harga"
            className="flex flex-col justify-center rounded-3xl border-2 border-dashed border-line bg-white/60 p-5 transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-pop dark:bg-slate-900/60"
          >
            <span className="text-[16px] font-bold text-ink">Hitung paket Anda sendiri</span>
            <span className="mt-2 text-[13.5px] leading-relaxed text-muted">
              Pilih jumlah pengguna, storage, dan modul — total langsung terhitung beserta PPN.
            </span>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-600">
              Buka kalkulator harga <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- fitur ---------------------------------- */

function Fitur() {
  return (
    <section id="fitur" className="scroll-mt-20 bg-white dark:bg-slate-900/40">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Fitur"
          title="Semua yang tim Anda butuhkan"
          desc="Satu platform terpadu untuk percakapan, penjualan, dan kolaborasi tim — tanpa berpindah aplikasi."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="rounded-3xl transition-all hover:-translate-y-1 hover:shadow-pop">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-card bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 dark:from-brand-900/40 dark:to-brand-900/20">
                <f.icon className="h-5 w-5" aria-hidden />
              </span>
              <CardTitle className="mt-4">{f.title}</CardTitle>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{f.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ inbox visual ------------------------------ */

function InboxVisual() {
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-pop dark:bg-slate-900" aria-label="Contoh tampilan inbox WOORK">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted" aria-hidden />
          <span className="text-[12.5px] text-muted">Cari nama atau pesan</span>
        </div>
        <Bell className="h-4 w-4 text-muted" aria-hidden />
      </div>
      <div className="grid sm:grid-cols-[1fr_1.4fr]">
        <div className="space-y-1 border-b border-line p-3 sm:border-b-0 sm:border-r">
          {[
            { n: 'Bu Sari', p: 'Toko kue, mau terima pesanan online', t: '09.57', badge: 'Woo menangani', tone: 'green' as const, active: true },
            { n: 'Pak Andi', p: 'Kalau beli 20 unit ada diskon?', t: '09.12', badge: 'Menunggu tim', tone: 'amber' as const, active: false },
            { n: 'Bu Rina', p: 'Saya sudah transfer ya', t: '08.47', badge: 'Woo menangani', tone: 'green' as const, active: false },
          ].map((c) => (
            <div
              key={c.n}
              className={`flex items-center gap-2.5 rounded-card p-2.5 ${c.active ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
            >
              <Avatar name={c.n} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-ink">{c.n}</p>
                  <span className="text-[10.5px] text-muted">{c.t}</span>
                </div>
                <p className="truncate text-[11.5px] text-muted">{c.p}</p>
                <div className="mt-1">
                  <Badge tone={c.tone}>{c.badge}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col bg-slate-50/60 p-4 dark:bg-slate-800/30">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[14px] font-bold text-ink">Bu Sari</p>
              <p className="text-[11.5px] text-muted">WhatsApp, tahap Terkualifikasi</p>
            </div>
            <span className="btn-secondary px-3 py-1.5 text-[12px]">Ambil alih</span>
          </div>
          <div className="space-y-2.5">
            <ChatBubble from="customer" text="Halo, saya mau tanya paket Pro" time="09.42" />
            <ChatBubble from="agent" text="Halo Bu Sari! Paket Pro cocok untuk usaha yang sedang berkembang. Boleh tahu usaha ibu apa?" time="09.43" />
            <ChatBubble from="customer" text="Toko kue, mau terima pesanan online" time="09.57" />
            <ChatBubble from="agent" text="Siap, saya catat ya, Bu. Ada target anggaran per bulan?" time="09.58" />
            <div className="flex justify-center pt-1">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                Lead tercatat: Bu Sari, tahap Terkualifikasi
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-input border border-line bg-white px-3 py-2.5 dark:bg-slate-900">
            <span className="flex-1 text-[12.5px] text-muted">Tulis pesan...</span>
            <Send className="h-4 w-4 text-brand-500" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProdukSection() {
  return (
    <section id="produk" className="scroll-mt-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Omnichannel Inbox"
            title="Semua percakapan dalam satu tempat"
            desc="Berhenti berpindah aplikasi. WhatsApp, Instagram, dan Facebook tampil dalam satu daftar percakapan. Woo, asisten otomatis WOORK, menangani chat rutin dan hanya menyerahkan ke tim saat dibutuhkan."
          />
          <ul className="mt-6 space-y-3 text-[14px] text-ink">
            {[
              'Badge status jelas: Woo menangani atau menunggu tim',
              'Serah terima percakapan ke agen dalam satu klik',
              'Panel pelanggan otomatis terisi dari percakapan',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30">
                  <Check className="h-3 w-3" aria-hidden />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <InboxVisual />
      </div>
    </section>
  );
}

/* -------------------------------- pipeline -------------------------------- */

function PipelineSection() {
  const cols = [
    { title: 'Baru', cards: [{ n: 'Dewi', v: 'Rp2,5 jt' }, { n: 'Toko Berkah', v: 'Rp4 jt' }] },
    { title: 'Dihubungi', cards: [{ n: 'Pak Joko', v: 'Rp7,5 jt' }] },
    { title: 'Terkualifikasi', cards: [{ n: 'Bu Sari', v: 'Rp12 jt' }, { n: 'Pak Andi', v: 'Rp30 jt' }] },
    { title: 'Menang', cards: [{ n: 'Bu Rina', v: 'Rp9 jt' }] },
  ];
  return (
    <section className="scroll-mt-20 bg-white dark:bg-slate-900/40">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="CRM & Pipeline"
          title="Bangun proses penjualan yang lebih terstruktur"
          desc="Seret prospek antar tahap, catat setiap interaksi, dan jangan pernah kehilangan follow up lagi."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list" aria-label="Pipeline penjualan">
          {cols.map((col, i) => (
            <div key={col.title} role="listitem" className="rounded-3xl border border-line bg-slate-50/70 p-3 dark:bg-slate-800/40">
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-[13px] font-bold text-ink">{col.title}</p>
                <Badge tone={i === 3 ? 'green' : i === 0 ? 'blue' : 'gray'}>{col.cards.length}</Badge>
              </div>
              <div className="space-y-2.5">
                {col.cards.map((c) => (
                  <div key={c.n} className="cursor-grab rounded-card border border-line bg-white p-3 shadow-soft transition-shadow hover:shadow-pop dark:bg-slate-900">
                    <p className="text-[13px] font-semibold text-ink">{c.n}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[12px] font-bold text-brand-600">{c.v}</span>
                      <Avatar name={c.n} size={24} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- workflow -------------------------------- */

function AutomationSection() {
  const nodes = [
    { icon: Zap, label: 'Trigger', title: 'Pesan masuk', desc: 'Pelanggan mengirim chat' },
    { icon: GitBranch, label: 'Condition', title: 'Berisi kata "harga"', desc: 'Cek maksud pesan' },
    { icon: Send, label: 'Action', title: 'Kirim info paket', desc: 'Balas otomatis + catat lead' },
  ];
  return (
    <section className="scroll-mt-20">
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Automation"
          title="Automasi pekerjaan repetitif"
          desc="Susun alur kerja tanpa coding: tentukan pemicu, kondisi, dan aksi. Woo mengerjakannya untuk Anda."
        />
        <div className="mt-12 rounded-3xl border border-line bg-white p-6 shadow-soft sm:p-8 dark:bg-slate-900">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {nodes.map((n, i) => (
              <div key={n.label} className="flex flex-1 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <div className="flex-1 rounded-3xl border-2 border-brand-100 bg-brand-50/50 p-4 text-center dark:border-brand-900/40 dark:bg-brand-900/10">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-card bg-brand-500 text-white">
                    <n.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-2 text-[10.5px] font-bold uppercase tracking-widest text-brand-600">{n.label}</p>
                  <p className="mt-0.5 text-[14px] font-bold text-ink">{n.title}</p>
                  <p className="mt-0.5 text-[12px] text-muted">{n.desc}</p>
                </div>
                {i < nodes.length - 1 && (
                  <span className="flex justify-center text-brand-500" aria-hidden>
                    <ArrowRight className="hidden h-6 w-6 sm:block" />
                    <ArrowDown className="h-6 w-6 sm:hidden" />
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-6 rounded-card bg-slate-50 px-4 py-3 text-center text-[13px] text-muted dark:bg-slate-800/60">
            Jika pesan tidak cocok dengan kondisi apapun, percakapan otomatis diteruskan ke tim dengan konteks lengkap.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- analytics ------------------------------- */

function AnalyticsSection() {
  const bars = [42, 68, 55, 80, 64, 92, 74];
  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  return (
    <section id="solusi" className="scroll-mt-20 bg-white dark:bg-slate-900/40">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Reporting"
          title="Pantau performa tim"
          desc="Lihat volume percakapan, kecepatan respons, dan konversi — semua terukur dalam satu dashboard."
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {[
            { label: 'Rata-rata respons', value: '1 mnt 24 dtk', note: '12% lebih cepat dari minggu lalu', icon: Clock },
            { label: 'Pesan ditangani Woo', value: '86%', note: 'Tanpa campur tangan tim', icon: Bot },
            { label: 'Audit tercatat', value: '1.647', note: 'Rantai data terverifikasi utuh', icon: ShieldCheck },
          ].map((s) => (
            <Card key={s.label} className="rounded-3xl">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-muted">{s.label}</p>
                <s.icon className="h-4 w-4 text-brand-500" aria-hidden />
              </div>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{s.value}</p>
              <p className="mt-1 text-[12.5px] text-muted">{s.note}</p>
            </Card>
          ))}
        </div>
        <div className="mt-5 rounded-3xl border border-line bg-white p-5 shadow-soft dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <CardTitle>Percakapan minggu ini</CardTitle>
            <Badge tone="green">+18% vs minggu lalu</Badge>
          </div>
          <div className="mt-6 flex h-44 items-end gap-3 sm:gap-5" role="img" aria-label="Grafik batang percakapan per hari">
            {bars.map((h, i) => (
              <div key={days[i]} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-36 w-full items-end">
                  <div
                    className={`w-full rounded-t-[6px] ${i === 5 ? 'bg-brand-900' : 'bg-brand-500/85'}`}
                    style={{ height: `${h}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-muted">{days[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- pricing -------------------------------- */

function PricingSection({ catalog }: { catalog: PricingCatalog }) {
  return (
    <section id="harga" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Harga"
          title="Harga transparan, hitung sesuai kebutuhan Anda"
          desc="Tidak ada paket tersembunyi: pilih jumlah pengguna, storage, dan modul — total beserta PPN langsung terlihat. Semua harga diambil dari katalog resmi WOORK."
        />
        <div className="mt-10">
          <p className="text-center text-[13px] font-bold uppercase tracking-wide text-muted">
            Semua paket sudah termasuk
          </p>
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {INCLUDED.map((f) => (
              <li
                key={f.label}
                className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink dark:bg-slate-900"
              >
                <f.icon className="h-3.5 w-3.5 text-brand-600" aria-hidden /> {f.label}
              </li>
            ))}
          </ul>
        </div>
        <PricingCalculator catalog={catalog} />
      </div>
    </section>
  );
}

/* ----------------------------------- faq ---------------------------------- */

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 bg-white dark:bg-slate-900/40" aria-label="Pertanyaan umum">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="FAQ"
          title="Pertanyaan yang sering diajukan"
          desc="Tidak menemukan jawaban? Hubungi tim kami, kami siap membantu."
        />
        <div className="mt-10 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-card border border-line bg-white px-5 py-4 shadow-soft dark:bg-slate-900">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- final cta ------------------------------- */

function FinalCta() {
  return (
    <section className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-brand-900 px-6 py-16 text-center shadow-pop sm:px-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" aria-hidden />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Mulai trial 30 hari gratis hari ini
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-brand-100">
              Daftar sekarang — tanpa kartu kredit. Workspace Anda aktif dalam hitungan menit, dan Anda
              bisa memilih paket setelah mencoba.
            </p>
            <Link
              href="/register"
              className="btn mt-8 bg-white px-8 py-3.5 text-[15px] font-bold text-brand-900 shadow-pop transition-all hover:bg-brand-50 active:scale-[.98]"
            >
              Daftar Gratis 30 Hari <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- footer --------------------------------- */

function Footer() {
  const cols = [
    {
      title: 'Produk',
      links: [
        { label: 'Omnichannel Inbox', href: '#produk' },
        { label: 'Fitur', href: '#fitur' },
        { label: 'Modul', href: '#modul' },
        { label: 'Harga', href: '#harga' },
      ],
    },
    {
      title: 'Perusahaan',
      links: [
        { label: 'Tentang Kami', href: '#tentang' },
        { label: 'Lowongan Kerja', href: '/jobs' },
        { label: 'Masuk', href: '/login' },
      ],
    },
    {
      title: 'Bantuan',
      links: [
        { label: 'Pertanyaan Umum', href: '#faq' },
        { label: 'Harga', href: '#harga' },
        { label: 'Daftar', href: '/register' },
      ],
    },
  ];
  return (
    <footer id="tentang" className="scroll-mt-20 border-t border-line bg-white dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-muted">
              Platform operasional bisnis terpadu untuk perusahaan Indonesia.
            </p>
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="text-[13px] font-bold uppercase tracking-wide text-ink">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="inline-block min-h-[28px] text-[13.5px] text-muted transition-colors hover:text-ink">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-[12.5px] text-muted sm:flex-row">
          <p>© 2026 WOORK. Seluruh hak cipta dilindungi.</p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Data Anda aman &amp; terenkripsi
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default async function LandingPage() {
  const catalog = await loadCatalog();
  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-ink">
      <SiteHeader />
      <main>
        <Hero />
        <ValueStrip />
        <ModulSection modules={catalog.modules} />
        <Fitur />
        <ProdukSection />
        <PipelineSection />
        <AutomationSection />
        <AnalyticsSection />
        <PricingSection catalog={catalog} />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
