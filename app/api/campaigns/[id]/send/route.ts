import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getSessionInfo } from '@/lib/wa/manager';
import { sendCampaign, waitForWaOpen } from '@/lib/campaigns/sender';

export const dynamic = 'force-dynamic';

/**
 * POST /api/campaigns/:id/send — kirim campaign via WhatsApp.
 * Pengiriman berjalan di background (202): tiap penerima dikirim satu per
 * satu dengan jeda anti rate-limit; status per penerima tercatat di DB.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('BROADCAST_CREATE');
    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { _count: { select: { recipients: true } } },
    });
    if (!campaign) return apiErr('Campaign tidak ditemukan.', 404);
    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
      return apiErr(`Campaign sudah ${campaign.status.toLowerCase()}.`, 409);
    }
    if (campaign._count.recipients === 0) {
      return apiErr('Campaign tidak memiliki penerima.', 409);
    }
    if (campaign.channelType !== 'WHATSAPP') {
      return apiErr('Pengiriman nyata saat ini hanya didukung untuk channel WhatsApp.', 422);
    }

    // Cek sesi WA secara sinkron agar error langsung terlihat user.
    let open = getSessionInfo(ctx.organizationId).status === 'open';
    if (!open) open = await waitForWaOpen(ctx.organizationId, 15000);
    if (!open) {
      return apiErr('WhatsApp belum terhubung. Hubungkan dulu di menu Saluran, lalu coba kirim lagi.', 422);
    }

    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SENDING' } });

    // Jalan di background — response langsung kembali.
    sendCampaign(campaign.id).catch((e: any) =>
      console.error('[broadcast] pengiriman manual gagal:', e?.message || e)
    );

    return apiOk({ id: campaign.id, status: 'SENDING', recipients: campaign._count.recipients }, 202);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim campaign.', 500);
  }
}
