import { prisma } from '@/lib/db';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import { Briefcase, MapPin, Building2, ArrowRight, Clock } from 'lucide-react';

export const metadata = { title: 'Karir — Lowongan Kerja | WOORK' };
export const dynamic = 'force-dynamic';

const EMP_LABEL: Record<string, string> = {
  PKWTT: 'PKWTT (Tetap)', PKWT: 'PKWT (Kontrak)', FREELANCE: 'Freelance', MAGANG: 'Magang',
};

export default async function KarirPage() {
  const items = await prisma.hrVacancy.findMany({
    where: { status: 'OPEN' },
    select: {
      id: true, title: true, department: true, location: true,
      employmentType: true, quota: true, salaryMin: true, salaryMax: true,
      publishedAt: true, organization: { select: { name: true } },
    },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  });

  const rupiah = (n: number | null) => (n == null ? null : 'Rp' + Number(n).toLocaleString('id-ID'));

  return (
    <div className="min-h-screen bg-canvas">
            <SiteHeader anchorBase="/" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-ink tracking-tight">Lowongan Kerja</h1>
          <p className="mt-3 text-[15px] text-muted">
            Bergabunglah dengan tim kami. Pilih posisi yang sesuai, isi formulir lamaran, dan unggah CV Anda —
            lamaran otomatis masuk ke tim HR kami.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="card mt-10 p-12 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-muted">
              <Briefcase className="h-7 w-7" />
            </span>
            <p className="mt-4 font-semibold text-ink text-lg">Belum ada lowongan dibuka</p>
            <p className="mt-1 text-[14px] text-muted">Silakan kembali lagi nanti — posisi baru akan muncul di sini.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 mt-10">
            {items.map((v) => (
              <Link key={v.id} href={`/karir/${v.id}`} className="card !p-6 group transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 block">
                <div className="flex items-start justify-between gap-2">
                  <span className="badge-blue">{EMP_LABEL[v.employmentType] || v.employmentType}</span>
                  {v.publishedAt && (
                    <span className="flex items-center gap-1 text-[11.5px] text-muted shrink-0">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(v.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
                <h2 className="mt-3 text-[17px] font-bold text-ink group-hover:text-brand transition-colors">{v.title}</h2>
                <p className="mt-1 text-[13px] text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{v.organization.name}{v.department ? ` · ${v.department}` : ''}</span>
                  {v.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{v.location}</span>}
                </p>
                {(rupiah(v.salaryMin) || rupiah(v.salaryMax)) && (
                  <p className="mt-2 text-[13.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {rupiah(v.salaryMin) || '—'} – {rupiah(v.salaryMax) || '—'}
                  </p>
                )}
                <span className="inline-flex items-center gap-1.5 mt-4 text-[13.5px] font-semibold text-brand">
                  Lamar sekarang <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            ))}
          </div>
        )}

        <p className="text-center text-[12.5px] text-muted mt-10">
          Data lamaran hanya digunakan untuk proses rekrutmen.
        </p>
      </main>
    </div>
  );
}
