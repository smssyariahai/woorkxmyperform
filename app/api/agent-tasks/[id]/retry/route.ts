import { requirePermission, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { retryTask } from '@/lib/agents/scheduler';

export const dynamic = 'force-dynamic';

/** POST /api/agent-tasks/:id/retry — ulangi tugas gagal/dibatalkan */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    await requireModule(ctx, 'kantor');
    await retryTask(ctx.organizationId, params.id);
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'RETRY_AGENT_TASK', module: 'KANTOR',
      description: `${ctx.name} mengulang tugas agent`, ipAddress: getClientIp(req),
    });
    return apiOk({ id: params.id, status: 'QUEUED' });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e.message || 'Gagal mengulang tugas.', 500);
  }
}
