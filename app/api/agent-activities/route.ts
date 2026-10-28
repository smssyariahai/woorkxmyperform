import { prisma } from '@/lib/db';
import { requirePermission, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/agent-activities — timeline aktivitas agent */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    await requireModule(ctx, 'kantor');
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const where: any = { organizationId: ctx.organizationId };
    if (agentId) where.agentId = agentId;
    const items = await prisma.agentActivity.findMany({
      where,
      include: { agent: { select: { id: true, name: true, avatarColor: true } } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return apiOk(items);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat aktivitas.', 500);
  }
}
