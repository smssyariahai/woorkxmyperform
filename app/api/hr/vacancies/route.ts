import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { hrVacancySchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/hr/vacancies — daftar lowongan */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('HR_VIEW');
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? '';
    const q = searchParams.get('q')?.trim() ?? '';
    const where: any = { organizationId: ctx.organizationId };
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
      ];
    }
    const items = await prisma.hrVacancy.findMany({
      where,
      include: { _count: { select: { candidates: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return apiOk({ items });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat lowongan.', 500);
  }
}

/** POST /api/hr/vacancies — buat lowongan */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const body = await req.json();
    const parsed = hrVacancySchema.safeParse(body);
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const item = await prisma.hrVacancy.create({
      data: {
        organizationId: ctx.organizationId,
        title: d.title.trim(),
        department: d.department?.trim() || null,
        location: d.location?.trim() || null,
        employmentType: d.employmentType,
        quota: d.quota,
        status: d.status,
        description: d.description?.trim() || null,
        salaryMin: d.salaryMin ?? null,
        salaryMax: d.salaryMax ?? null,
        publishedAt: d.status === 'OPEN' ? new Date() : null,
        createdById: ctx.userId,
      },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'CREATE_VACANCY', module: 'HR',
      description: `${ctx.name} membuka lowongan "${item.title}"`,
    });
    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat lowongan.', 500);
  }
}
