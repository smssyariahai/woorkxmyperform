import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyWebhook } from '@/lib/meta';
import { publishMessage, publishConversation } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

/** GET /api/webhooks/meta — verifikasi webhook oleh Meta. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const challenge = verifyWebhook(
    q.get('hub.mode'),
    q.get('hub.verify_token'),
    q.get('hub.challenge')
  );
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return new NextResponse('Forbidden', { status: 403 });
}

interface IncomingMsg {
  orgId: string;
  channelType: 'FACEBOOK' | 'INSTAGRAM';
  senderId: string;
  senderName: string | null;
  text: string;
  accountId: string;
}

async function ingest(m: IncomingMsg) {
  const { orgId, channelType, senderId, senderName, text, accountId } = m;
  if (!text.trim()) return;

  // cocokkan akun channel (berdasarkan externalId Halaman/IG)
  const account = await prisma.channelAccount.findFirst({
    where: { organizationId: orgId, externalId: accountId, status: 'CONNECTED' },
  });
  if (!account) return;

  // cari / buat pelanggan (identitas = senderId Meta)
  let customer = await prisma.customer.findFirst({
    where: { organizationId: orgId, phone: `meta:${senderId}` },
    select: { id: true },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        organizationId: orgId,
        name: senderName || `Pengguna ${channelType === 'INSTAGRAM' ? 'IG' : 'FB'}`,
        phone: `meta:${senderId}`,
        source: channelType,
        stage: 'Baru',
      },
      select: { id: true },
    });
  }

  const channel = await prisma.channel.findFirst({
    where: { organizationId: orgId, type: channelType },
    select: { id: true },
  });
  if (!channel) return;

  let conv = await prisma.conversation.findFirst({
    where: { organizationId: orgId, customerId: customer.id, channelId: channel.id, status: { not: 'CLOSED' } },
    select: { id: true },
  });
  if (!conv) {
    conv = await prisma.conversation.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        channelId: channel.id,
        channelType,
        status: 'OPEN',
        assignedTo: 'WOO',
        lastMessageAt: new Date(),
      },
      select: { id: true },
    });
    publishConversation(orgId, conv.id);
  }

  const created = await prisma.conversationMessage.create({
    data: { conversationId: conv.id, senderType: 'CUSTOMER', body: text.trim().slice(0, 4000) },
  });
  const now = new Date();
  await prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: now, status: 'OPEN' } });
  await prisma.customer.update({
    where: { id: customer.id },
    data: { lastMessageAt: now, unreadCount: { increment: 1 } },
  });
  publishMessage(orgId, {
    id: created.id,
    conversationId: conv.id,
    senderType: 'CUSTOMER',
    sender: senderName ? { name: senderName } : null,
    body: created.body,
    createdAt: now.toISOString(),
  });
}

/**
 * POST /api/webhooks/meta — pesan masuk dari Facebook Page & Instagram.
 * Perlu didaftarkan di dashboard Meta App (produk Webhooks).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.object !== 'page' && body.object !== 'instagram') {
      return NextResponse.json({ ok: true });
    }
    for (const entry of body.entry || []) {
      const pageId = String(entry.id || '');
      // cari organisasi pemilik Halaman ini
      const account = await prisma.channelAccount.findFirst({
        where: { externalId: pageId, status: 'CONNECTED' },
        select: { organizationId: true, channel: { select: { type: true } } },
      });
      if (!account) continue;
      const isIg = body.object === 'instagram' || account.channel.type === 'INSTAGRAM';

      for (const messaging of entry.messaging || []) {
        // abaikan echo (pesan yang dikirim oleh Halaman sendiri)
        if (messaging.message?.is_echo) continue;
        const text: string =
          messaging.message?.text ||
          messaging.message?.attachments?.[0]?.payload?.text ||
          '';
        if (!text.trim()) continue;
        await ingest({
          orgId: account.organizationId,
          channelType: isIg ? 'INSTAGRAM' : 'FACEBOOK',
          senderId: String(messaging.sender?.id || ''),
          senderName: null,
          text,
          accountId: pageId,
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[meta] webhook gagal:', (e as Error).message);
    return NextResponse.json({ ok: true });
  }
}
