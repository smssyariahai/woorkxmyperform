import { prisma } from '@/lib/db';
import { getSessionInfo, sendText, sendImage } from '@/lib/wa/manager';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { audit } from '@/lib/audit';

/** Jeda antar pesan agar tidak kena rate-limit / ban WhatsApp. */
const DELAY_MS = 2500;
/** Campaign yang macet di status SENDING lebih lama dari ini dianggap gagal dan diproses ulang. */
const STUCK_MINUTES = 15;

function personalize(template: string, name: string | null): string {
  const nama = (name || 'Bapak/Ibu').trim() || 'Bapak/Ibu';
  return template.replace(/\{\{\s*nama\s*\}\}/gi, nama);
}

/**
 * Pastikan sesi WhatsApp organisasi terbuka. Bila ada kredensial tersimpan,
 * getSessionInfo() memicu restore otomatis — fungsi ini menunggunya.
 */
export async function waitForWaOpen(orgId: string, timeoutMs = 20000): Promise<boolean> {
  const start = Date.now();
  getSessionInfo(orgId); // picu restore bila ada creds.json
  while (Date.now() - start < timeoutMs) {
    if (getSessionInfo(orgId).status === 'open') return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return getSessionInfo(orgId).status === 'open';
}

export type SendResult = { sent: number; failed: number };

/**
 * Kirim campaign via WhatsApp ke semua penerima PENDING.
 * Aman dipanggil berulang / paralel: tiap penerima diklaim atomik
 * (PENDING -> SENDING) sehingga tidak ada double-kirim.
 */
export async function sendCampaign(campaignId: string): Promise<SendResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      recipients: {
        include: { customer: { select: { id: true, name: true, waLid: true } } },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!campaign) throw new Error('Campaign tidak ditemukan.');
  if (campaign.channelType !== 'WHATSAPP') {
    throw new Error('Pengiriman nyata saat ini hanya didukung untuk channel WhatsApp.');
  }

  const waOpen = await waitForWaOpen(campaign.organizationId);
  if (!waOpen) {
    throw new Error('WhatsApp belum terhubung. Hubungkan dulu di menu Saluran.');
  }

  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SENDING' } });

  // Muat poster bila ada — dikirim sebagai gambar dengan caption teks.
  let poster: Buffer | null = null;
  if (campaign.imagePath) {
    const safe = campaign.imagePath.split('/').pop()!.split('\\').pop()!;
    const full = join(process.cwd(), 'uploads', 'campaigns', safe);
    if (existsSync(full)) {
      try { poster = await readFile(full); } catch {}
    }
  }

  let sent = 0;
  let failed = 0;

  for (const r of campaign.recipients) {
    // Klaim atomik: hanya proses bila masih PENDING/SENDING dan belum diklaim worker lain.
    const claimed = await prisma.campaignRecipient.updateMany({
      where: { id: r.id, status: { in: ['PENDING', 'SENDING'] } },
      data: { status: 'SENDING' },
    });
    if (claimed.count === 0) continue;

    const text = personalize(campaign.message, r.customer?.name ?? null);
    try {
      const res = poster
        ? await sendImage(
            campaign.organizationId,
            { phone: r.phone, waLid: r.customer?.waLid ?? null },
            poster,
            text
          )
        : await sendText(
            campaign.organizationId,
            { phone: r.phone, waLid: r.customer?.waLid ?? null },
            text
          );
      if (res.ok) {
        sent++;
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            error: null,
            waMessageId: res.messageId ?? null,
          },
        });
        // Catat ke inbox: buat/temukan percakapan lalu simpan pesan terkirim.
        try {
          if (r.customer?.id) {
            let conv = await prisma.conversation.findFirst({
              where: { organizationId: campaign.organizationId, customerId: r.customer.id },
              select: { id: true },
            });
            if (!conv) {
              const channel = await prisma.channel.findFirst({
                where: { organizationId: campaign.organizationId, type: 'WHATSAPP' },
                select: { id: true },
              });
              if (channel) {
                conv = await prisma.conversation.create({
                  data: {
                    organizationId: campaign.organizationId,
                    customerId: r.customer.id,
                    channelId: channel.id,
                    channelType: 'WHATSAPP',
                    status: 'NEW',
                    assignedTo: 'WOO',
                    lastMessageAt: new Date(),
                  },
                  select: { id: true },
                });
              }
            }
            if (conv) {
              const created = await prisma.conversationMessage.create({
                data: {
                  conversationId: conv.id,
                  senderType: 'WOO',
                  body: text.slice(0, 4000),
                  messageType: poster ? 'IMAGE' : 'TEXT',
                  metadata: '{}',
                },
              });
              // simpan poster agar bisa ditampilkan di inbox
              let imageUrl: string | null = null;
              if (poster) {
                try {
                  const { writeFile, mkdir } = await import('fs/promises');
                  const { join } = await import('path');
                  const dir = join(process.cwd(), 'uploads', 'messages');
                  await mkdir(dir, { recursive: true });
                  // deteksi ekstensi dari magic bytes
                  const ext = poster[0] === 0x89 ? '.png' : poster[0] === 0xff ? '.jpg' : '.webp';
                  const fname = `${created.id}${ext}`;
                  await writeFile(join(dir, fname), poster);
                  imageUrl = `/api/messages/${created.id}/image`;
                  await prisma.conversationMessage.update({
                    where: { id: created.id },
                    data: { metadata: JSON.stringify({ imageUrl }) },
                  });
                } catch {}
              }
              await prisma.conversation.update({
                where: { id: conv.id },
                data: { lastMessageAt: new Date() },
              });
              // siarkan real-time agar inbox langsung menampilkan pesan broadcast
              try {
                const { publishMessage, publishConversation } = await import('@/lib/realtime');
                publishMessage(campaign.organizationId, {
                  id: created.id,
                  conversationId: conv.id,
                  senderType: 'WOO',
                  sender: { name: 'Broadcast' },
                  body: created.body,
                  createdAt: created.createdAt.toISOString(),
                  messageType: poster ? 'IMAGE' : 'TEXT',
                  metadata: imageUrl ? JSON.stringify({ imageUrl }) : '{}',
                } as any);
                publishConversation(campaign.organizationId, conv.id);
              } catch {}
            }
          }
        } catch {}
      } else {
        failed++;
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'FAILED', error: res.error || 'Gagal dikirim via WhatsApp' },
        });
      }
    } catch (e: any) {
      failed++;
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { status: 'FAILED', error: String(e?.message || e).slice(0, 300) },
      });
    }

    await new Promise((res) => setTimeout(res, DELAY_MS));
  }

  const remaining = await prisma.campaignRecipient.count({
    where: { campaignId: campaign.id, status: { in: ['PENDING', 'SENDING'] } },
  });

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: remaining === 0 ? 'SENT' : 'SENDING',
      sentCount: { increment: sent },
      deliveredCount: { increment: sent },
    },
  });

  await audit({
    organizationId: campaign.organizationId,
    userId: campaign.createdById,
    action: 'SEND_CAMPAIGN',
    module: 'BROADCAST',
    description: `Mengirim campaign "${campaign.name}": ${sent} terkirim, ${failed} gagal`,
  });

  return { sent, failed };
}

/**
 * Proses semua campaign terjadwal yang sudah jatuh tempo, plus campaign yang
 * macet di status SENDING (mis. server restart di tengah pengiriman).
 */
export async function processDueCampaigns(): Promise<{ processed: number; sent: number; failed: number }> {
  const now = new Date();
  const stuckBefore = new Date(now.getTime() - STUCK_MINUTES * 60_000);
  const due = await prisma.campaign.findMany({
    where: {
      channelType: 'WHATSAPP',
      OR: [
        { status: 'SCHEDULED', scheduledAt: { lte: now } },
        { status: 'SENDING', updatedAt: { lt: stuckBefore } },
      ],
    },
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;
  for (const c of due) {
    try {
      const r = await sendCampaign(c.id);
      sent += r.sent;
      failed += r.failed;
    } catch (e: any) {
      console.error('[broadcast] gagal memproses campaign', c.id, e?.message || e);
    }
  }
  return { processed: due.length, sent, failed };
}
