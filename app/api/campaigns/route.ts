import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { getTrialStatus, countCampaignsSentToday, TRIAL_BROADCAST_MAX_RECIPIENTS, TRIAL_BROADCAST_MAX_PER_DAY } from '@/lib/trial';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { campaignSchema } from '@/lib/validation';
import { processDueCampaigns } from '@/lib/campaigns/sender';

export const dynamic = 'force-dynamic';

/** GET /api/campaigns */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('BROADCAST_CREATE');
    // Best-effort: kirim campaign terjadwal yang jatuh tempo (tanpa menunggu).
    processDueCampaigns().catch((e: any) => console.error('[broadcast] process-due gagal:', e?.message || e));
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const perPage = 10;
    const where = { organizationId: ctx.organizationId };
    const [total, items] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { recipients: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return apiOk({ items, page, perPage, total, totalPages: Math.ceil(total / perPage) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat campaign.', 500);
  }
}

/** POST /api/campaigns — buat campaign (draft / terjadwal) */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('BROADCAST_CREATE');
    const body = await req.json();
    const parsed = campaignSchema.safeParse(body);
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    // bangun audience dari kontak inbox:
    // - inbox_all: semua kontak yang pernah chat (punya percakapan) + bernomor HP
    // - inbox_selected: kontak yang dipilih manual
    const audience = d.audience ?? 'inbox_all';
    let customers: { id: string; phone: string | null }[];
    if (audience === 'inbox_selected') {
      const ids = [...new Set((d.customerIds ?? []) as string[])];
      if (ids.length === 0) return apiErr('Pilih minimal 1 kontak.', 422);
      customers = await prisma.customer.findMany({
        where: { id: { in: ids }, organizationId: ctx.organizationId, phone: { not: null } },
        select: { id: true, phone: true },
        take: 10000,
      });
    } else {
      customers = await prisma.customer.findMany({
        where: {
          organizationId: ctx.organizationId,
          phone: { not: null },
          conversations: { some: {} },
        },
        select: { id: true, phone: true },
        take: 10000,
      });
    }

    // Batasan trial: maks 20 penerima & 1 pengiriman per hari
    const trial = await getTrialStatus(ctx.organizationId);
    if (trial.isTrial) {
      if (customers.length > TRIAL_BROADCAST_MAX_RECIPIENTS) {
        return apiErr(`Paket Trial dibatasi ${TRIAL_BROADCAST_MAX_RECIPIENTS} penerima per broadcast. Upgrade untuk mengirim ke lebih banyak kontak.`, 403);
      }
      const sentToday = await countCampaignsSentToday(ctx.organizationId);
      if (sentToday >= TRIAL_BROADCAST_MAX_PER_DAY) {
        return apiErr(`Paket Trial dibatasi ${TRIAL_BROADCAST_MAX_PER_DAY} broadcast per hari. Coba lagi besok atau upgrade paket.`, 403);
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: ctx.organizationId,
        name: d.name.trim(),
        channelType: d.channelType,
        message: d.message.trim(),
        status: d.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        audienceFilter: JSON.stringify({ audience, count: customers.length }),
        scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
        createdById: ctx.userId,
        recipients: {
          create: customers
            .filter((c) => c.phone)
            .map((c) => ({ customerId: c.id, phone: c.phone! })),
        },
      },
      include: { _count: { select: { recipients: true } } },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_CAMPAIGN',
      module: 'BROADCAST',
      description: `Membuat campaign "${campaign.name}" (${campaign._count.recipients} penerima)`,
      ipAddress: getClientIp(req),
    });
    return apiOk(campaign, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat campaign.', 500);
  }
}
