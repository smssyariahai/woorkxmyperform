import { prisma } from '@/lib/db';
import { requirePermission, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/agent-tasks/:id — detail tugas + log event */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    await requireModule(ctx, 'kantor');
    const task = await prisma.agentTask.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: {
        agent: { select: { id: true, name: true, role: true, avatarColor: true } },
        events: { orderBy: { createdAt: 'asc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!task) return apiErr('Tugas tidak ditemukan.', 404);
    return apiOk(task);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tugas.', 500);
  }
}
