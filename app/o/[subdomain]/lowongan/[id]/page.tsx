import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ApplyForm } from '@/components/karir/ApplyForm';
import { MapPin, Building2, ArrowLeft, Users, Banknote, Menu } from 'lucide-react';
import { officeBase, officeHome } from '@/lib/office-site';

export const dynamic = 'force-dynamic';

const EMP_LABEL: Record<string, string> = {
  PKWTT: 'PKWTT (Tetap)', PKWT: 'PKWT (Kontrak)', FREELANCE: 'Freelance', MAGANG: 'Magang',
};

export default async function OfficeVacancyPage({
  params,
}: {
  params: { subdomain: string; id: string };
}) {
  const org = await prisma.organization.findFirst({
    where: { subdomain: params.subdomain.toLowerCase(), isActive: true },
    select: { id: true, name: true, subdomain: true, logoPath: true },
  });
  if (!org) notFound();

  const v = await prisma.hrVacancy.findFirst({
    where: { id: params.id, organizationId: org.id, status: 'OPEN' },
    select: {
      id: true, title: true, department: true, location: true, employmentType: true,
      quota: true, description: true, salaryMin: true, salaryMax: true,
    },
  });
  if (!v) notFound();

  const base = officeBase(org.subdomain as string);
  const home = officeHome(org.subdomain as string);
  const logoUrl = org.logoPath ? `/api/o/${org.subdomain}/logo` : null;
  const rupiah = (n: number | null) => (n == null ? null : 'Rp' + Number(n).toLocaleString('id-ID'));

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-50 border-b border-line bg-white/95 dark:bg-slate-900/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link href={home} className="flex items-center gap-2.5 min-w-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`Logo ${org.name}`} className="h-10 w-10 rounded-xl object-contain bg-white shadow-md" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900 text-white text-[17px] font-extrabold shadow-md">
                {org.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="text-[16px] font-extrabold text-ink tracking-tight truncate">{org.name}</span>
          </Link>
          <details className="md:hidden relative">
            <summary className="list-none cursor-pointer p-2 -mr-2 text-ink" aria-label="Menu">
              <Menu className="h-6 w-6" />
            </summary>
            <nav className="absolute right-0 top-12 w-52 card !p-2 shadow-pop flex flex-col">
              <a href={`${home}#tentang`} className="px-4 py-2.5 rounded-lg text-[14px] font-medium text-ink hover:bg-slate-100 dark:hover:bg-slate-800">Tentang</a>
              <a href={`${home}#lowongan`} className="px-4 py-2.5 rounded-lg text-[14px] font-medium text-ink hover:bg-slate-100 dark:hover:bg-slate-800">Lowongan</a>
              <a href={`${home}#kontak`} className="px-4 py-2.5 rounded-lg text-[14px] font-medium text-ink hover:bg-slate-100 dark:hover:bg-slate-800">Kontak</a>
            </nav>
          </details>
          <nav className="hidden md:flex items-center gap-6 text-[14px] font-medium text-muted">
            <a href={`${home}#tentang`} className="hover:text-ink transition-colors">Tentang</a>
            <a href={`${home}#lowongan`} className="hover:text-ink transition-colors">Lowongan</a>
            <a href={`${home}#kontak`} className="hover:text-ink transition-colors">Kontak</a>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <Link href={`${home}#lowongan`} className="inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-brand transition-colors">
          <ArrowLeft className="h-4 w-4" /> Semua lowongan {org.name}
        </Link>

        <div className="card !p-6 sm:!p-8">
          <span className="badge-blue">{EMP_LABEL[v.employmentType] || v.employmentType}</span>
          <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-ink tracking-tight leading-tight">{v.title}</h1>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13.5px] text-muted">
            <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 shrink-0" />{org.name}{v.department ? ` · ${v.department}` : ''}</span>
            {v.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0" />{v.location}</span>}
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 shrink-0" />{v.quota} posisi</span>
            {(rupiah(v.salaryMin) || rupiah(v.salaryMax)) && (
              <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                <Banknote className="h-4 w-4 shrink-0" />{rupiah(v.salaryMin) || '—'} – {rupiah(v.salaryMax) || '—'}
              </span>
            )}
          </div>
          {v.description && (
            <div className="mt-6 pt-6 border-t border-line/70">
              <h2 className="font-bold text-ink mb-2.5">Deskripsi pekerjaan</h2>
              <p className="text-[14.5px] text-ink/90 whitespace-pre-wrap leading-relaxed">{v.description}</p>
            </div>
          )}
        </div>

        <ApplyForm vacancyId={v.id} vacancyTitle={v.title} />
      </main>

      <footer className="border-t border-line bg-white dark:bg-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 text-center text-[12.5px] text-muted">
          © 2026 {org.name} · Didukung oleh{' '}
          <a href="https://woork-saas.xsramazys.dev" className="font-semibold text-brand hover:underline">WOORK</a>
        </div>
      </footer>
    </div>
  );
}
