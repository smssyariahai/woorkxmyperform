import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { getNineRouterConfig } from '@/lib/bot/ninerouter';
import { getOrCreateBotConfig, getOwnerStats } from '@/lib/bot/credits';
import { prisma } from '@/lib/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** GET /api/bot/ai — status bot, saldo, statistik milik owner */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('BOT_MANAGE', req);
    const [stats, cfg, global] = await Promise.all([
      getOwnerStats(ctx.organizationId),
      getOrCreateBotConfig(ctx.organizationId),
      getNineRouterConfig(),
    ]);
    return apiOk({
      ...stats,
      systemPrompt: cfg.systemPrompt,
      globalSystemPrompt: global.systemPrompt,
      globalEnabled: global.enabled,
      pricePerReply: global.pricePerReply,
      lowBalance: stats.balance < global.pricePerReply,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat status bot.', 500);
  }
}

const schema = z.object({
  isEnabled: z.boolean().optional(),
  systemPrompt: z.string().max(4000).nullable().optional(),
});

/** PUT /api/bot/ai — owner atur bot sendiri (ON/OFF, instruksi) */
export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('BOT_MANAGE', req);
    const body = await req.json().catch(() => ({}));
    const p = schema.safeParse(body);
    if (!p.success) return apiErr('Data tidak valid.', 422);

    const data: any = {};
    if (p.data.isEnabled !== undefined) data.isEnabled = p.data.isEnabled;
    if (p.data.systemPrompt !== undefined) {
      data.systemPrompt = p.data.systemPrompt?.trim() ? p.data.systemPrompt.trim() : null;
    }
    const cfg = await prisma.botConfig.upsert({
      where: { organizationId: ctx.organizationId },
      update: data,
      create: { organizationId: ctx.organizationId, ...data },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_BOT_AI',
      module: 'BOT',
      description: `Mengatur Bot AI: ${Object.keys(data).join(', ')}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ isEnabled: cfg.isEnabled, systemPrompt: cfg.systemPrompt });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan.', 500);
  }
}
