import { requirePermission, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { cancelTask } from '@/lib/agents/scheduler';

export const dynamic = 'force-dynamic';

/** POST /api/agent-tasks/:id/cancel — hentikan tugas */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    await requireModule(ctx, 'kantor');
    await cancelTask(ctx.organizationId, params.id, ctx.userId);
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'CANCEL_AGENT_TASK', module: 'KANTOR',
      description: `${ctx.name} membatalkan tugas agent`, ipAddress: getClientIp(req),
    });
    return apiOk({ id: params.id, status: 'CANCELLED' });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e.message || 'Gagal membatalkan tugas.', 500);
  }
}
