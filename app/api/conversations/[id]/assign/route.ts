import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** POST /api/conversations/:id/assign — ambil alih / kembalikan ke Woo */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    const body = await req.json().catch(() => ({}));
    const to: 'team' | 'woo' = body.to === 'woo' ? 'woo' : 'team';

    const conv = await prisma.conversation.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { customer: true },
    });
    if (!conv) return apiErr('Percakapan tidak ditemukan.', 404);

    const updated = await prisma.conversation.update({
      where: { id: conv.id },
      data:
        to === 'team'
          ? { assignedTo: 'TEAM', assigneeId: ctx.userId, status: 'IN_PROGRESS' }
          : { assignedTo: 'WOO', assigneeId: null },
      include: { assignee: { select: { id: true, name: true } } },
    });

    const sysMsg = await prisma.conversationMessage.create({
      data: {
        conversationId: conv.id,
        senderType: 'SYSTEM',
        body:
          to === 'team'
            ? `${ctx.name} mengambil alih percakapan.`
            : 'Woo kembali menangani percakapan.',
      },
    });

    // siarkan real-time
    try {
      const { publishMessage, publishConversation } = await import('@/lib/realtime');
      publishMessage(ctx.organizationId, {
        id: sysMsg.id,
        conversationId: conv.id,
        senderType: 'SYSTEM',
        sender: null,
        body: sysMsg.body,
        createdAt: sysMsg.createdAt instanceof Date ? sysMsg.createdAt.toISOString() : String(sysMsg.createdAt),
      });
      publishConversation(ctx.organizationId, conv.id);
    } catch {}

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ASSIGN_CONVERSATION',
      module: 'INBOX',
      description:
        to === 'team'
          ? `${ctx.name} mengambil alih percakapan ${conv.customer.name}`
          : `Percakapan ${conv.customer.name} dikembalikan ke Woo`,
      ipAddress: getClientIp(req),
    });

    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah assignment.', 500);
  }
}
