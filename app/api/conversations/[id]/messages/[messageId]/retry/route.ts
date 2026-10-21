import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** POST /api/conversations/:id/messages/:messageId/retry — kirim ulang pesan yang gagal ke WhatsApp */
export async function POST(
  _req: Request,
  { params }: { params: { id: string; messageId: string } }
) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');

    const conv = await prisma.conversation.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { customer: true },
    });
    if (!conv) return apiErr('Percakapan tidak ditemukan.', 404);
    if (conv.channelType !== 'WHATSAPP') {
      return apiErr('Kirim ulang hanya untuk percakapan WhatsApp.', 422);
    }

    const msg = await prisma.conversationMessage.findFirst({
      where: {
        id: params.messageId,
        conversationId: conv.id,
        senderType: { in: ['AGENT', 'WOO'] },
      },
    });
    if (!msg) return apiErr('Pesan tidak ditemukan.', 404);

    const { sendText } = await import('@/lib/wa/manager');
    const res = await sendText(
      ctx.organizationId,
      { phone: conv.customer.phone, waLid: (conv.customer as any).waLid ?? null },
      msg.body
    );

    const updated = await prisma.conversationMessage.update({
      where: { id: msg.id },
      data: {
        metadata: JSON.stringify(
          res.ok
            ? { sentVia: 'whatsapp', retriedAt: new Date().toISOString() }
            : { sentVia: 'whatsapp_failed', error: res.error, retriedAt: new Date().toISOString() }
        ),
      },
    });

    return apiOk({
      ...updated,
      waSent: res.ok,
      waError: res.ok ? null : (res.error ?? 'Gagal mengirim via WhatsApp'),
    });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') return apiErr('Tidak diizinkan.', 403);
    return apiErr(e?.message || 'Gagal mengirim ulang.', 500);
  }
}
