import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/audit — log audit + filter */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('AUDIT_VIEW');
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') ?? '';
    const module = searchParams.get('module') ?? '';
    const userId = searchParams.get('userId') ?? '';
    const date = searchParams.get('date') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('perPage') ?? '15')));

    const where: any = { organizationId: ctx.organizationId };
    if (action) where.action = action;
    if (module) where.module = module;
    if (userId) where.userId = userId;
    if (date) {
      const d = new Date(date);
      where.createdAt = { gte: d, lt: new Date(d.getTime() + 24 * 3600 * 1000) };
    }

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return apiOk({ items, page, perPage, total, totalPages: Math.ceil(total / perPage) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat audit log.', 500);
  }
}
