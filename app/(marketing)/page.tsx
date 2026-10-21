import Link from 'next/link';
import { Logo, Badge, Card, CardTitle, Avatar } from '@/components/ui/primitives';
import SiteHeader from '@/components/layout/SiteHeader';
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
  Menu,
  Bot,
  GitBranch,
  Send,
  Search,
  Bell,
  Clock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export const metadata = {
  title: 'WOORK — Omnichannel CRM & Customer Management Platform',
  description:
    'WOORK membantu tim mengelola WhatsApp, Instagram, Facebook, lead, follow up, dan customer relationship dalam satu workspace yang sederhana.',
};

/* ---------------------------------- data ---------------------------------- */

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

const PLANS = [
  {
    name: 'Free',
    price: 'Rp0',
    period: 'selamanya',
    desc: 'Untuk mencoba WOORK dengan tim kecil.',
    cta: 'Mulai Gratis',
    features: ['1 workspace', '100 percakapan / bulan', '1 channel WhatsApp', 'CRM dasar', 'Dukungan komunitas'],
    popular: false,
  },
  {
    name: 'Starter',
    price: 'Rp149rb',
    period: '/ bulan',
    desc: 'Untuk bisnis yang mulai bertumbuh.',
    cta: 'Pilih Starter',
    features: [
      '1 workspace',
      '2.000 percakapan / bulan',
      '3 channel (WA, IG, FB)',
      'Pipeline lead & follow up',
      'Broadcast 5.000 pesan / bulan',
      'Dukungan email',
    ],
    popular: false,
  },
  {
    name: 'Professional',
    price: 'Rp399rb',
    period: '/ bulan',
    desc: 'Untuk tim operasional yang serius.',
    cta: 'Pilih Professional',
    features: [
      '3 workspace',
      'Percakapan tanpa batas',
      'Semua channel + Website Chat',
      'Automasi Woo & bot builder',
      'Broadcast 25.000 pesan / bulan',
      'Laporan & audit lengkap',
      'Dukungan prioritas',
    ],
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Hubungi kami',
    period: '',
    desc: 'Untuk perusahaan dengan kebutuhan khusus.',
    cta: 'Hubungi Sales',
    features: [
      'Workspace tanpa batas',
      'SSO & keamanan lanjutan',
      'Integrasi API & webhook khusus',
      'Manajer akun dedikasi',
      'SLA 99,9%',
    ],
    popular: false,
  },
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
    a: 'Keamanan adalah prioritas kami. Data tersimpan di database PostgreSQL terenkripsi, akses dilindungi role & permission, dan setiap aktivitas penting tercatat di audit log yang tidak bisa diubah.',
  },
  {
    q: 'Bisakah saya mencoba sebelum berlangganan?',
    a: 'Tentu. Paket Free gratis selamanya dengan 100 percakapan per bulan — cukup daftar dan workspace Anda langsung aktif tanpa kartu kredit.',
  },
  {
    q: 'Apakah WOORK cocok untuk tim besar?',
    a: 'Sangat cocok. Paket Professional dan Enterprise mendukung banyak workspace, role bertingkat (Owner, Admin, Supervisor, Agent, Viewer), assignment percakapan, dan laporan performa tim.',
  },
];

const TRUSTED = ['Nusantara Kopi', 'Berkah Mart', 'Laras Fashion', 'Mitra Oto', 'Sinar Abadi'];

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
      {desc && <p className="mt-4 text-[15px] leading-relaxed text-muted">{desc}</p>}
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

/* --------------------------------- navbar --------------------------------- */

function Navbar() {
  return (
    <SiteHeader />
  );
}

/* ---------------------------------- hero ---------------------------------- */

function HeroMockup() {
  return (
    <div className="relative">
      <div className="card overflow-hidden p-0 shadow-pop">
        <div className="flex items-center gap-1.5 border-b border-line bg-white px-4 py-3 dark:bg-slate-900">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-wa/70" />
          <span className="ml-2 text-[12px] font-semibold text-muted">WOORK Dashboard</span>
        </div>
        <div className="flex">
          <div className="hidden w-12 flex-col items-center gap-5 border-r border-line bg-slate-50/70 py-4 sm:flex dark:bg-slate-800/40">
            <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-brand-500 text-white">
              <Inbox className="h-4 w-4" />
            </span>
            <Users className="h-4 w-4 text-muted" />
            <Bot className="h-4 w-4 text-muted" />
            <Megaphone className="h-4 w-4 text-muted" />
            <BarChart3 className="h-4 w-4 text-muted" />
          </div>
          <div className="flex-1 space-y-3 bg-canvas/70 p-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Pelanggan', value: '1.284' },
                { label: 'Prospek Baru', value: '128' },
                { label: 'Konversi', value: '18,4%' },
              ].map((s) => (
                <div key={s.label} className="rounded-card border border-line bg-white p-3 dark:bg-slate-900">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{s.label}</p>
                  <p className="mt-1 text-lg font-extrabold text-ink">{s.value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-card border border-line bg-white dark:bg-slate-900">
              <div className="flex text-[11px]">
                <div className="w-2/5 space-y-2 border-r border-line p-2.5">
                  {[
                    { n: 'Bu Sari', p: 'Toko kue, mau terima…', t: '09.57', badge: 'Woo menangani', tone: 'green' as const },
                    { n: 'Pak Andi', p: 'Kalau beli 20 unit…', t: '09.12', badge: 'Menunggu tim', tone: 'amber' as const },
                    { n: 'Bu Rina', p: 'Saya sudah transfer…', t: '08.47', badge: null, tone: 'gray' as const },
                  ].map((c) => (
                    <div key={c.n} className="flex items-center gap-2 rounded-btn bg-slate-50 p-1.5 dark:bg-slate-800/60">
                      <Avatar name={c.n} size={26} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-ink">{c.n}</p>
                        <p className="truncate text-[10px] text-muted">{c.p}</p>
                      </div>
                      {c.badge && <Badge tone={c.tone}>{c.badge}</Badge>}
                    </div>
                  ))}
                </div>
                <div className="flex-1 space-y-2 bg-slate-50/60 p-2.5 dark:bg-slate-800/30">
                  <ChatBubble from="customer" text="Halo, saya mau tanya paket Pro" time="09.42" />
                  <ChatBubble from="agent" text="Halo Bu Sari! Paket Pro cocok untuk usaha yang sedang berkembang." time="09.43" />
                  <div className="flex justify-center">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      Lead tercatat: Bu Sari, tahap Terkualifikasi
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -left-3 top-10 hidden rounded-card border border-line bg-white px-3 py-2 shadow-pop sm:block dark:bg-slate-900">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
          <Sparkles className="h-3.5 w-3.5 text-brand-500" /> Woo menangani 24/7
        </p>
      </div>
      <div className="absolute -right-3 bottom-10 hidden rounded-card border border-line bg-white px-3 py-2 shadow-pop sm:block dark:bg-slate-900">
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
      <div className="pointer-events-none absolute -top-24 right-0 h-96 w-96 rounded-full bg-brand-50 blur-3xl dark:bg-brand-900/20" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pt-24">
        <div>
          <Badge tone="blue" className="px-3 py-1 text-[12px]">
            <Sparkles className="h-3.5 w-3.5" /> Omnichannel CRM untuk bisnis modern
          </Badge>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.15] tracking-tight text-ink sm:text-5xl">
            Kelola Semua Percakapan dan Pelanggan dalam Satu Platform
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted">
            WOORK membantu tim mengelola WhatsApp, Instagram, Facebook, lead, follow up, dan customer
            relationship dalam satu workspace yang sederhana.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-[15px]">
              Mulai Sekarang <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="btn-secondary px-6 py-3 text-[15px]">
              <Play className="h-4 w-4" /> Lihat Demo
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted">
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-wa" /> Gratis selamanya untuk paket Free
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-wa" /> Tanpa kartu kredit
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-wa" /> Aktif dalam 2 menit
            </span>
          </div>
        </div>
        <HeroMockup />
      </div>
    </section>
  );
}

/* -------------------------------- trusted --------------------------------- */

function TrustedBy() {
  return (
    <section className="border-y border-line bg-white dark:bg-slate-900/40" aria-label="Dipercaya oleh">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <p className="text-center text-[12px] font-bold uppercase tracking-widest text-muted">
          Dipercaya oleh tim operasional bisnis modern
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {TRUSTED.map((name) => (
            <span key={name} className="text-[15px] font-bold text-muted/70">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- fitur ---------------------------------- */

function Fitur() {
  return (
    <section id="fitur" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="Fitur"
          title="Semua yang tim Anda butuhkan"
          desc="Satu platform terpadu untuk percakapan, penjualan, dan kolaborasi tim — tanpa berpindah aplikasi."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="transition-shadow hover:shadow-pop">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-card bg-brand-50 text-brand-600 dark:bg-brand-900/30">
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
    <div className="card overflow-hidden p-0 shadow-pop" aria-label="Contoh tampilan inbox WOORK">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted" />
          <span className="text-[12.5px] text-muted">Cari nama atau pesan</span>
        </div>
        <Bell className="h-4 w-4 text-muted" />
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
            <Send className="h-4 w-4 text-brand-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProdukSection() {
  return (
    <section id="produk" className="scroll-mt-20 bg-white dark:bg-slate-900/40">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
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
                  <Check className="h-3 w-3" />
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
    <section className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="CRM & Pipeline"
          title="Bangun proses penjualan yang lebih terstruktur"
          desc="Seret prospek antar tahap, catat setiap interaksi, dan jangan pernah kehilangan follow up lagi."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list" aria-label="Pipeline penjualan">
          {cols.map((col, i) => (
            <div key={col.title} role="listitem" className="rounded-card border border-line bg-slate-50/70 p-3 dark:bg-slate-800/40">
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-[13px] font-bold text-ink">{col.title}</p>
                <Badge tone={i === 3 ? 'green' : i === 0 ? 'blue' : 'gray'}>{col.cards.length}</Badge>
              </div>
              <div className="space-y-2.5">
                {col.cards.map((c) => (
                  <div key={c.n} className="card cursor-grab p-3 transition-shadow hover:shadow-pop">
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
    <section className="scroll-mt-20 bg-white dark:bg-slate-900/40">
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="Automation"
          title="Automasi pekerjaan repetitif"
          desc="Susun alur kerja tanpa coding: tentukan pemicu, kondisi, dan aksi. Woo mengerjakannya untuk Anda."
        />
        <div className="card mt-12 p-6 shadow-soft sm:p-8">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {nodes.map((n, i) => (
              <div key={n.label} className="flex flex-1 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <div className="flex-1 rounded-card border-2 border-brand-100 bg-brand-50/50 p-4 text-center dark:border-brand-900/40 dark:bg-brand-900/10">
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
    <section id="solusi" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
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
            <Card key={s.label}>
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-muted">{s.label}</p>
                <s.icon className="h-4 w-4 text-brand-500" aria-hidden />
              </div>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{s.value}</p>
              <p className="mt-1 text-[12.5px] text-muted">{s.note}</p>
            </Card>
          ))}
        </div>
        <Card className="mt-5">
          <div className="flex items-center justify-between">
            <CardTitle>Percakapan minggu ini</CardTitle>
            <Badge tone="green">+18% vs minggu lalu</Badge>
          </div>
          <div className="mt-6 flex h-44 items-end gap-3 sm:gap-5" role="img" aria-label="Grafik batang percakapan per hari">
            {bars.map((h, i) => (
              <div key={days[i]} className="flex flex-1 flex-col items-center gap-2">
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
        </Card>
      </div>
    </section>
  );
}

/* --------------------------------- pricing -------------------------------- */

function Pricing() {
  return (
    <section id="harga" className="scroll-mt-20 bg-white dark:bg-slate-900/40">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="Harga"
          title="Harga transparan untuk setiap tahap bisnis"
          desc="Mulai gratis, upgrade kapan saja. Semua paket termasuk inbox omnichannel dan CRM."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => (
            <Card
              key={p.name}
              className={`relative flex flex-col ${p.popular ? 'border-2 border-brand-500 shadow-pop' : ''}`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-1 text-[11px] font-bold text-white shadow-sm">
                  Paling populer
                </span>
              )}
              <CardTitle className="text-[16px]">{p.name}</CardTitle>
              <p className="mt-1 text-[12.5px] text-muted">{p.desc}</p>
              <p className="mt-4">
                <span className="text-[28px] font-extrabold tracking-tight text-ink">{p.price}</span>
                {p.period && <span className="text-[13px] text-muted">{p.period}</span>}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-ink">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-wa" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className={`mt-6 px-4 py-2.5 text-sm ${p.popular ? 'btn-primary' : 'btn-secondary'}`}
              >
                {p.cta}
              </Link>
            </Card>
          ))}
        </div>
        <p className="mt-8 text-center text-[13px] text-muted">
          Harga belum termasuk PPN. Batalkan kapan saja tanpa penalti.
        </p>
      </div>
    </section>
  );
}

/* ----------------------------------- faq ---------------------------------- */

function Faq() {
  return (
    <section className="scroll-mt-20" aria-label="Pertanyaan umum">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="FAQ"
          title="Pertanyaan yang sering diajukan"
          desc="Tidak menemukan jawaban? Hubungi tim kami, kami siap membantu."
        />
        <div className="mt-10 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="card group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
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
        <div className="relative overflow-hidden rounded-card bg-brand-900 px-6 py-16 text-center shadow-pop sm:px-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" aria-hidden />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Siap mengelola customer dengan lebih baik?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-brand-100">
              Bergabung dengan ratusan bisnis yang sudah merapikan percakapan dan meningkatkan penjualan bersama WOORK.
            </p>
            <Link
              href="/register"
              className="btn mt-8 bg-white px-8 py-3.5 text-[15px] font-bold text-brand-900 shadow-pop transition-all hover:bg-brand-50 active:scale-[.98]"
            >
              Mulai Menggunakan WOORK <ArrowRight className="h-4 w-4" />
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
      links: ['Omnichannel Inbox', 'CRM', 'Broadcast', 'Automation', 'Harga'],
      hrefs: ['#produk', '#fitur', '#harga', '#fitur', '#harga'],
    },
    {
      title: 'Perusahaan',
      links: ['Tentang Kami', 'Karier', 'Blog', 'Kontak'],
      hrefs: ['#tentang', '#tentang', '#tentang', '#tentang'],
    },
    {
      title: 'Bantuan',
      links: ['Pusat Bantuan', 'Dokumentasi API', 'Status Layanan', 'Kebijakan Privasi'],
      hrefs: ['#tentang', '#tentang', '#tentang', '#tentang'],
    },
  ];
  return (
    <footer id="tentang" className="scroll-mt-20 border-t border-line bg-white dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-muted">
              Omnichannel CRM & Customer Management Platform untuk bisnis modern Indonesia.
            </p>
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="text-[13px] font-bold uppercase tracking-wide text-ink">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l, i) => (
                  <li key={l}>
                    <a href={c.hrefs[i]} className="text-[13.5px] text-muted transition-colors hover:text-ink">
                      {l}
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
            <ShieldCheck className="h-4 w-4" aria-hidden /> Data Anda aman & terenkripsi
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Navbar />
      <main>
        <Hero />
        <TrustedBy />
        <Fitur />
        <ProdukSection />
        <PipelineSection />
        <AutomationSection />
        <AnalyticsSection />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
