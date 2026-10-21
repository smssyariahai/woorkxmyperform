import { prisma } from '@/lib/db';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/vacancies — daftar lowongan yang DIBUKA (publik, tanpa login).
 * Hanya field yang aman untuk publik.
 */
export async function GET() {
  try {
    const items = await prisma.hrVacancy.findMany({
      where: { status: 'OPEN' },
      select: {
        id: true, title: true, department: true, location: true,
        employmentType: true, quota: true, description: true,
        salaryMin: true, salaryMax: true, publishedAt: true,
        organization: { select: { name: true } },
        _count: { select: { candidates: true } },
      },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    return apiOk({ items });
  } catch {
    return apiErr('Gagal memuat lowongan.', 500);
  }
}
