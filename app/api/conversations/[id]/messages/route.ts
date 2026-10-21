import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { messageSchema } from '@/lib/validation';
import { aiService } from '@/lib/ai';

export const dynamic = 'force-dynamic';

/** POST /api/conversations/:id/messages — kirim pesan (agent / Woo) */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    const body = await req.json();
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success) return apiErr('Pesan tidak valid.', 422);
    const asWoo = body.asWoo === true;

    const conv = await prisma.conversation.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { customer: true },
    });
    if (!conv) return apiErr('Percakapan tidak ditemukan.', 404);

    const message = await prisma.conversationMessage.create({
      data: {
        conversationId: conv.id,
        senderType: asWoo ? 'WOO' : 'AGENT',
        senderId: asWoo ? null : ctx.userId,
        body: parsed.data.body.trim(),
      },
      include: { sender: { select: { id: true, name: true } } },
    });

    // Balasan (agen/Woo) berarti percakapan sedang ditangani → Proses.
    // Bila sebelumnya Selesai lalu dibalas manual, ikut terbuka kembali sebagai Proses.
    // Balasan manual agen manusia = ambil alih → bot AI nonaktif di percakapan ini.
    await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        lastMessageAt: new Date(),
        ...(conv.status !== 'IN_PROGRESS' ? { status: 'IN_PROGRESS' } : {}),
        ...(!asWoo ? { botEnabled: false } : {}),
      },
    });
    await prisma.customer.update({
      where: { id: conv.customerId },
      data: { lastMessageAt: new Date() },
    });

    // Woo mencatat insight pelanggan otomatis (ekstraksi heuristik dari isi percakapan)
    if (asWoo) {
      const history = await prisma.conversationMessage.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: 'asc' },
        take: 30,
      });
      const insight = await aiService.extractCustomerData(
        history.map((m) => ({ sender: m.senderType, body: m.body }))
      );
      await prisma.customer.update({
        where: { id: conv.customerId },
        data: {
          business: insight.business !== 'Belum diketahui' ? insight.business : undefined,
          interest: insight.interest !== 'Belum diketahui' ? insight.interest : undefined,
          stage: insight.stage,
        },
      });
    }

    // Kirim via WhatsApp asli — hasil jujur: UI harus tahu bila gagal.
    let waSent = false;
    let waError: string | null = null;
    if (conv.channelType === 'WHATSAPP') {
      try {
        const { sendText } = await import('@/lib/wa/manager');
        const res = await sendText(
          ctx.organizationId,
          { phone: conv.customer.phone, waLid: (conv.customer as any).waLid ?? null },
          parsed.data.body.trim()
        );
        waSent = res.ok;
        waError = res.ok ? null : (res.error ?? 'Gagal mengirim via WhatsApp');
        await prisma.conversationMessage.update({
          where: { id: message.id },
          data: {
            metadata: JSON.stringify(
              res.ok ? { sentVia: 'whatsapp' } : { sentVia: 'whatsapp_failed', error: waError }
            ),
          },
        });
      } catch (e) {
        waError = 'Gagal mengirim via WhatsApp: ' + (e as Error).message;
        console.error('[wa] kirim keluar gagal:', waError);
        await prisma.conversationMessage.update({
          where: { id: message.id },
          data: { metadata: JSON.stringify({ sentVia: 'whatsapp_failed', error: waError }) },
        }).catch(() => {});
      }
    }

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'SEND_MESSAGE',
      module: 'INBOX',
      description: `${asWoo ? 'Woo' : ctx.name} mengirim pesan ke ${conv.customer.name}`,
      ipAddress: getClientIp(req),
    });

    // siarkan real-time ke semua client inbox organisasi ini
    try {
      const { publishMessage } = await import('@/lib/realtime');
      publishMessage(ctx.organizationId, {
        id: message.id,
        conversationId: message.conversationId,
        senderType: message.senderType,
        sender: message.sender ? { name: message.sender.name } : null,
        body: message.body,
        createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : String(message.createdAt),
      });
    } catch {}

    return apiOk({ ...message, waSent, waError }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim pesan.', 500);
  }
}
