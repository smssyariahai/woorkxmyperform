import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  MapPin, Building2, Users, Banknote, ArrowRight, Briefcase,
  Phone, Mail, Globe, Menu,
} from 'lucide-react';
import type { Metadata } from 'next';
import { officeBase, officeHome } from '@/lib/office-site';

export const dynamic = 'force-dynamic';

const EMP_LABEL: Record<string, string> = {
  PKWTT: 'PKWTT (Tetap)', PKWT: 'PKWT (Kontrak)', FREELANCE: 'Freelance', MAGANG: 'Magang',
};

async function getOffice(subdomain: string) {
  return prisma.organization.findFirst({
    where: { subdomain: subdomain.toLowerCase(), isActive: true },
    select: {
      id: true, name: true, subdomain: true, description: true,
      tagline: true, industry: true, teamSize: true,
      phone: true, email: true, address: true, website: true,
      logoPath: true, coverPath: true,
      hrVacancies: {
        where: { status: 'OPEN' },
        select: {
          id: true, title: true, department: true, location: true,
          employmentType: true, quota: true, salaryMin: true, salaryMax: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { memberships: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: { subdomain: string } }): Promise<Metadata> {
  const o = await getOffice(params.subdomain);
  if (!o) return { title: 'Kantor tidak ditemukan' };
  return {
    title: `${o.name} — Karir & Profil Kantor`,
    description: o.tagline ?? o.description?.slice(0, 160) ?? `Profil dan lowongan kerja ${o.name}.`,
  };
}

function OfficeLogo({ name, logoUrl, size = 'md' }: { name: string; logoUrl: string | null; size?: 'md' | 'lg' }) {
  const cls = size === 'lg'
    ? 'h-20 w-20 sm:h-24 sm:w-24 text-3xl rounded-2xl'
    : 'h-10 w-10 text-[17px] rounded-xl';
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={`Logo ${name}`} className={`${cls} object-contain bg-white shadow-md`} />;
  }
  return (
    <span className={`${cls} flex items-center justify-center bg-brand-900 text-white font-extrabold shadow-md`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default async function OfficeSitePage({ params }: { params: { subdomain: string } }) {
  const o = await getOffice(params.subdomain);
  if (!o) notFound();
  const base = officeBase(o.subdomain as string);
  const home = officeHome(o.subdomain as string);
  const logoUrl = o.logoPath ? `/api/o/${o.subdomain}/logo` : null;
  const coverUrl = o.coverPath ? `/api/o/${o.subdomain}/cover` : null;
  const rupiah = (n: number | null) =>
    n == null ? null : 'Rp' + Number(n).toLocaleString('id-ID');

  const nav = [
    { href: '#tentang', label: 'Tentang' },
    { href: '#lowongan', label: 'Lowongan' },
    { href: '#kontak', label: 'Kontak' },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-50 border-b border-line bg-white/95 dark:bg-slate-900/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link href={home} className="flex items-center gap-2.5 min-w-0">
            <OfficeLogo name={o.name} logoUrl={logoUrl} />
            <span className="text-[16px] sm:text-[17px] font-extrabold text-ink tracking-tight truncate">{o.name}</span>
          </Link>
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7 text-[14px] font-medium text-muted">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-ink transition-colors">{n.label}</a>
            ))}
            <a href="#lowongan" className="btn-primary !py-2 !px-4 !text-[13px]">Lamar Sekarang</a>
          </nav>
          {/* Mobile nav */}
          <details className="md:hidden relative">
            <summary className="list-none cursor-pointer p-2 -mr-2 text-ink" aria-label="Menu">
              <Menu className="h-6 w-6" />
            </summary>
            <nav className="absolute right-0 top-12 w-52 card !p-2 shadow-pop flex flex-col">
              {nav.map((n) => (
                <a key={n.href} href={n.href} className="px-4 py-2.5 rounded-lg text-[14px] font-medium text-ink hover:bg-slate-100 dark:hover:bg-slate-800">{n.label}</a>
              ))}
              <a href="#lowongan" className="btn-primary !py-2.5 !text-[13.5px] mt-1 mx-1">Lamar Sekarang</a>
            </nav>
          </details>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden">
        {coverUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-slate-950/60" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-brand-900 via-brand-800 to-slate-950" />
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,white,transparent_55%)]" />
          </>
        )}
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 md:py-28">
          <div className="max-w-3xl">
            <div className="flex items-center gap-4">
              <OfficeLogo name={o.name} logoUrl={logoUrl} size="lg" />
              <div>
                {o.industry && (
                  <p className="text-[12.5px] sm:text-[13px] font-semibold uppercase tracking-[0.14em] text-white/70">{o.industry}</p>
                )}
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">{o.name}</h1>
              </div>
            </div>
            <p className="mt-5 text-[15px] sm:text-lg text-white/85 leading-relaxed">
              {o.tagline ?? o.description?.split('\n')[0] ?? `Bergabunglah dengan tim ${o.name}.`}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a href="#lowongan" className="btn-primary !bg-white !text-brand-900 hover:!bg-white/90 !border-0 !py-3 !px-7 text-[14.5px] inline-flex justify-center">
                Lihat Lowongan <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#kontak" className="!py-3 !px-7 text-[14.5px] rounded-btn border border-white/40 text-white font-semibold hover:bg-white/10 transition-colors inline-flex justify-center">
                Hubungi Kami
              </a>
            </div>
          </div>
        </div>
        {/* wave divider */}
        <svg className="relative block w-full h-10 sm:h-14 text-canvas" viewBox="0 0 1440 56" preserveAspectRatio="none" fill="currentColor">
          <path d="M0,32 C240,56 480,0 720,16 C960,32 1200,48 1440,24 L1440,56 L0,56 Z" />
        </svg>
      </section>

      {/* ===== Statistik ===== */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { icon: Building2, label: 'Industri', value: o.industry ?? '—' },
            { icon: Users, label: 'Tim', value: o.teamSize ?? `${o._count.memberships} anggota` },
            { icon: Briefcase, label: 'Lowongan terbuka', value: String(o.hrVacancies.length) },
            { icon: MapPin, label: 'Lokasi', value: o.address?.split(',')[0] ?? o.hrVacancies[0]?.location ?? 'Indonesia' },
          ].map((s) => (
            <div key={s.label} className="card !p-4 sm:!p-6 text-center">
              <s.icon className="h-5 w-5 sm:h-6 sm:w-6 mx-auto text-brand" />
              <p className="mt-2 text-[14px] sm:text-[16px] font-bold text-ink truncate">{s.value}</p>
              <p className="text-[11.5px] sm:text-[12.5px] text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Tentang ===== */}
      <section id="tentang" className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 scroll-mt-20">
        <div className="grid md:grid-cols-5 gap-6 md:gap-10 items-start">
          <div className="md:col-span-3">
            <p className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-brand">Tentang Kami</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">Profil {o.name}</h2>
            <div className="mt-4 space-y-3 text-[14.5px] sm:text-[15.5px] text-ink/85 leading-relaxed">
              {(o.description ?? `${o.name} adalah kantor yang terhubung dalam ekosistem WOORK — platform omnichannel CRM & customer management. Kami terus bertumbuh dan mencari talenta terbaik untuk bergabung dengan tim kami.`)
                .split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </div>
          <div className="md:col-span-2 card !p-5 sm:!p-6">
            <h3 className="font-bold text-ink text-[15px]">Informasi Kantor</h3>
            <dl className="mt-4 space-y-3.5 text-[13.5px]">
              {o.address && (
                <div className="flex gap-3">
                  <MapPin className="h-5 w-5 shrink-0 text-brand mt-0.5" />
                  <div><dt className="text-muted text-[12px]">Alamat</dt><dd className="text-ink font-medium">{o.address}</dd></div>
                </div>
              )}
              {o.phone && (
                <div className="flex gap-3">
                  <Phone className="h-5 w-5 shrink-0 text-brand mt-0.5" />
                  <div><dt className="text-muted text-[12px]">Telepon / WhatsApp</dt><dd><a href={`https://wa.me/${o.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-ink font-medium hover:text-brand">{o.phone}</a></dd></div>
                </div>
              )}
              {o.email && (
                <div className="flex gap-3">
                  <Mail className="h-5 w-5 shrink-0 text-brand mt-0.5" />
                  <div><dt className="text-muted text-[12px]">Email</dt><dd><a href={`mailto:${o.email}`} className="text-ink font-medium hover:text-brand break-all">{o.email}</a></dd></div>
                </div>
              )}
              {o.website && (
                <div className="flex gap-3">
                  <Globe className="h-5 w-5 shrink-0 text-brand mt-0.5" />
                  <div><dt className="text-muted text-[12px]">Website</dt><dd><a href={o.website.startsWith('http') ? o.website : `https://${o.website}`} target="_blank" rel="noreferrer" className="text-ink font-medium hover:text-brand break-all">{o.website}</a></dd></div>
                </div>
              )}
              {!o.address && !o.phone && !o.email && !o.website && (
                <p className="text-muted">Informasi kontak belum dilengkapi.</p>
              )}
            </dl>
          </div>
        </div>
      </section>

      {/* ===== Lowongan ===== */}
      <section id="lowongan" className="bg-slate-50 dark:bg-slate-900/50 border-y border-line scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-brand">Karir</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">Lowongan Terbuka</h2>
            {o.hrVacancies.length > 0 && (
              <span className="badge-blue !text-[12.5px] !py-1 !px-3">{o.hrVacancies.length} posisi</span>
            )}
          </div>
          <p className="mt-2 text-[14px] text-muted max-w-2xl">Temukan peran yang cocok dan kirim lamaran Anda langsung melalui website ini.</p>

          {o.hrVacancies.length === 0 ? (
            <div className="card !p-10 sm:!p-14 mt-6 text-center">
              <Briefcase className="h-9 w-9 mx-auto text-muted" />
              <p className="mt-4 text-[15px] font-semibold text-ink">Belum ada lowongan terbuka</p>
              <p className="mt-1 text-[13.5px] text-muted">Silakan kembali lagi nanti atau hubungi kami untuk informasi lebih lanjut.</p>
            </div>
          ) : (
            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {o.hrVacancies.map((v) => (
                <Link
                  key={v.id}
                  href={`${base}/lowongan/${v.id}`}
                  className="card !p-5 sm:!p-6 hover:border-brand/50 hover:shadow-pop hover:-translate-y-0.5 transition-all group flex flex-col"
                >
                  <span className="badge-blue self-start">{EMP_LABEL[v.employmentType] || v.employmentType}</span>
                  <h3 className="mt-3 text-[16.5px] font-bold text-ink group-hover:text-brand transition-colors leading-snug">{v.title}</h3>
                  <div className="mt-2.5 space-y-1.5 text-[13px] text-muted">
                    {v.department && <p className="flex items-center gap-1.5"><Building2 className="h-4 w-4 shrink-0" /><span className="truncate">{v.department}</span></p>}
                    {v.location && <p className="flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{v.location}</span></p>}
                    {(rupiah(v.salaryMin) || rupiah(v.salaryMax)) && (
                      <p className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        <Banknote className="h-4 w-4 shrink-0" />{rupiah(v.salaryMin) || '—'} – {rupiah(v.salaryMax) || '—'}
                      </p>
                    )}
                  </div>
                  <span className="mt-4 pt-4 border-t border-line/70 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand mt-auto">
                    Lihat & Lamar <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== Kontak / CTA ===== */}
      <section id="kontak" className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 scroll-mt-16">
        <div className="relative overflow-hidden rounded-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-900 via-brand-800 to-slate-950" />
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_70%_30%,white,transparent_55%)]" />
          <div className="relative px-6 py-12 sm:px-12 sm:py-16 text-center">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Tertarik bergabung dengan {o.name}?</h2>
            <p className="mt-3 text-[14.5px] sm:text-[16px] text-white/80 max-w-xl mx-auto">
              Jelajahi lowongan di atas dan kirim lamaran Anda — atau hubungi kami langsung.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row justify-center gap-3">
              <a href="#lowongan" className="btn-primary !bg-white !text-brand-900 hover:!bg-white/90 !border-0 !py-3 !px-7 text-[14.5px] inline-flex justify-center">
                Lihat Lowongan <ArrowRight className="h-4 w-4" />
              </a>
              {o.phone && (
                <a href={`https://wa.me/${o.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="!py-3 !px-7 text-[14.5px] rounded-btn border border-white/40 text-white font-semibold hover:bg-white/10 transition-colors inline-flex justify-center items-center gap-2">
                  <Phone className="h-4 w-4" /> WhatsApp Kami
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-line bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link href={home} className="flex items-center gap-2.5">
              <OfficeLogo name={o.name} logoUrl={logoUrl} />
              <span className="text-[15px] font-extrabold text-ink">{o.name}</span>
            </Link>
            <nav className="flex items-center gap-5 text-[13px] text-muted">
              {nav.map((n) => (
                <a key={n.href} href={n.href} className="hover:text-ink transition-colors">{n.label}</a>
              ))}
            </nav>
          </div>
          <div className="mt-6 pt-6 border-t border-line/70 flex flex-col sm:flex-row items-center justify-between gap-2 text-[12.5px] text-muted">
            <p>© 2026 {o.name}. Seluruh hak cipta dilindungi.</p>
            <p>Didukung oleh <a href="https://woork-saas.xsramazys.dev" className="font-semibold text-brand hover:underline">WOORK</a></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
