import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/super/audit — audit log global seluruh kantor. */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const organizationId = searchParams.get('organizationId') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('perPage') ?? '30')));

    const where: any = {};
    if (organizationId) where.organizationId = organizationId;
    if (q) {
      where.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { module: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          organization: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    const offices = await prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return apiOk({ items, page, perPage, total, totalPages: Math.ceil(total / perPage), offices });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat audit log.', 500);
  }
}
