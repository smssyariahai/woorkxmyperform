import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { hrCandidateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/hr/candidates — daftar kandidat */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('HR_VIEW');
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage') ?? '';
    const vacancyId = searchParams.get('vacancyId') ?? '';
    const q = searchParams.get('q')?.trim() ?? '';
    const where: any = { organizationId: ctx.organizationId };
    if (stage) where.stage = stage;
    if (vacancyId) where.vacancyId = vacancyId;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }
    const items = await prisma.hrCandidate.findMany({
      where,
      include: {
        vacancy: { select: { id: true, title: true } },
        employee: { select: { id: true, employeeNo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return apiOk({ items });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat kandidat.', 500);
  }
}

/** POST /api/hr/candidates — tambah kandidat */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const parsed = hrCandidateSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    if (d.vacancyId) {
      const v = await prisma.hrVacancy.findFirst({ where: { id: d.vacancyId, organizationId: ctx.organizationId } });
      if (!v) return apiErr('Lowongan tidak ditemukan.', 404);
    }
    const item = await prisma.hrCandidate.create({
      data: {
        organizationId: ctx.organizationId,
        vacancyId: d.vacancyId || null,
        name: d.name.trim(),
        email: d.email?.trim() || null,
        phone: d.phone?.trim() || null,
        address: d.address?.trim() || null,
        birthDate: d.birthDate ? new Date(d.birthDate) : null,
        education: d.education?.trim() || null,
        experience: d.experience?.trim() || null,
        source: d.source?.trim() || null,
        stage: d.stage,
        rating: d.rating ?? null,
        notes: d.notes?.trim() || null,
        createdById: ctx.userId,
      },
      include: { vacancy: { select: { id: true, title: true } } },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'CREATE_CANDIDATE', module: 'HR',
      description: `${ctx.name} menambahkan kandidat "${item.name}"`,
    });
    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambahkan kandidat.', 500);
  }
}
