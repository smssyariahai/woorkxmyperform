import { prisma } from '@/lib/db';
import { requirePermission, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** GET /api/channels — daftar channel organisasi */
export async function GET() {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE');
    await requireModule(ctx, 'channels');
    const channels = await prisma.channel.findMany({
      where: { organizationId: ctx.organizationId },
      include: { accounts: true },
      orderBy: { type: 'asc' },
    });
    return apiOk(
      channels.map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        status: c.status,
        accounts: c.accounts.map((a) => ({
          id: a.id,
          displayName: a.displayName,
          status: a.status,
          lastTestOk: a.lastTestOk,
          lastTestAt: a.lastTestAt,
          connectedAt: a.connectedAt,
        })),
      }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat channel.', 500);
  }
}

/** POST /api/channels — hubungkan channel (simpan konfigurasi) */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE');
    await requireModule(ctx, 'channels');
    const body = await req.json();
    const { type, displayName, externalId } = body;
    if (!['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE'].includes(type)) {
      return apiErr('Tipe channel tidak valid.', 422);
    }
    const channel = await prisma.channel.findFirst({
      where: { organizationId: ctx.organizationId, type },
    });
    if (!channel) return apiErr('Channel tidak ditemukan.', 404);

    const account = await prisma.channelAccount.create({
      data: {
        organizationId: ctx.organizationId,
        channelId: channel.id,
        displayName: displayName || `${channel.name} Account`,
        externalId: externalId || null,
        status: 'CONNECTED',
        connectedAt: new Date(),
        lastTestAt: new Date(),
        lastTestOk: true,
      },
    });
    await prisma.channel.update({ where: { id: channel.id }, data: { status: 'CONNECTED' } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CHANNEL_CONNECT',
      module: 'CHANNELS',
      description: `Menghubungkan channel ${channel.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk(account, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghubungkan channel.', 500);
  }
}
