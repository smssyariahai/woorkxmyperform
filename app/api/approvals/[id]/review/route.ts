import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { reviewApproval } from '@/lib/agents/scheduler';

export const dynamic = 'force-dynamic';

/** POST /api/approvals/:id/review — setujui / tolak pengajuan */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CRM_EDIT');
    const body = await req.json();
    const approve = body.approve === true;
    await reviewApproval(ctx.organizationId, params.id, ctx.userId, approve);
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: approve ? 'APPROVE_AGENT_TASK' : 'REJECT_AGENT_TASK', module: 'KANTOR',
      description: `${ctx.name} ${approve ? 'menyetujui' : 'menolak'} pengajuan agent`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: params.id, approved: approve });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e.message || 'Gagal memproses persetujuan.', 500);
  }
}
