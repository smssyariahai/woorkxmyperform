import { prisma } from '@/lib/db';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/public/vacancies/[id] — detail lowongan (publik). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const item = await prisma.hrVacancy.findFirst({
      where: { id: params.id, status: 'OPEN' },
      select: {
        id: true, title: true, department: true, location: true,
        employmentType: true, quota: true, description: true,
        salaryMin: true, salaryMax: true, publishedAt: true,
        organization: { select: { name: true } },
      },
    });
    if (!item) return apiErr('Lowongan tidak ditemukan atau sudah ditutup.', 404);
    return apiOk({ item });
  } catch {
    return apiErr('Gagal memuat lowongan.', 500);
  }
}
