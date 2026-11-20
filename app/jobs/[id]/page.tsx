import { prisma } from '@/lib/db';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import { notFound } from 'next/navigation';
import { ApplyForm } from '@/components/karir/ApplyForm';
import { MapPin, Building2, ArrowLeft, Users, Banknote } from 'lucide-react';

export const dynamic = 'force-dynamic';

const EMP_LABEL: Record<string, string> = {
  PKWTT: 'PKWTT (Tetap)', PKWT: 'PKWT (Kontrak)', FREELANCE: 'Freelance', MAGANG: 'Magang',
};

export default async function VacancyDetailPage({ params }: { params: { id: string } }) {
  const v = await prisma.hrVacancy.findFirst({
    where: { id: params.id, status: 'OPEN' },
    select: {
      id: true, title: true, department: true, location: true, employmentType: true,
      quota: true, description: true, salaryMin: true, salaryMax: true,
      organization: { select: { name: true } },
    },
  });
  if (!v) notFound();

  const rupiah = (n: number | null) => (n == null ? null : 'Rp' + Number(n).toLocaleString('id-ID'));

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader anchorBase="/" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <Link href="/jobs" className="inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-brand transition-colors">
          <ArrowLeft className="h-4 w-4" /> Semua Jobs
        </Link>

        <div className="card !p-6 sm:!p-8">
          <span className="badge-blue">{EMP_LABEL[v.employmentType] || v.employmentType}</span>
          <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">{v.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px] text-muted">
            <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" />{v.organization.name}{v.department ? ` · ${v.department}` : ''}</span>
            {v.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{v.location}</span>}
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{v.quota} posisi</span>
            {(rupiah(v.salaryMin) || rupiah(v.salaryMax)) && (
              <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                <Banknote className="h-4 w-4" />{rupiah(v.salaryMin) || '—'} – {rupiah(v.salaryMax) || '—'}
              </span>
            )}
          </div>
          {v.description && (
            <div className="mt-5 pt-5 border-t border-line/70">
              <h2 className="font-bold text-ink mb-2">Deskripsi pekerjaan</h2>
              <p className="text-[14px] text-ink/90 whitespace-pre-wrap leading-relaxed">{v.description}</p>
            </div>
          )}
        </div>

        <ApplyForm vacancyId={v.id} vacancyTitle={v.title} />
      </main>
    </div>
  );
}
