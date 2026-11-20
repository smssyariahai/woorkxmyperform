// GET /api/kantor/workspace — data AI Workspace kantor: saldo kredit AI + model AI aktif.
// Guard: auth + modul 'kantor' (sama seperti /api/kantor/agents).
// Saldo dari BotConfig.creditBalance milik organisasi; model dari konfigurasi
// publik 9Router (tanpa apiKey — getNineRouterPublicConfig sudah aman).
import { prisma } from '@/lib/db';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { getNineRouterPublicConfig } from '@/lib/bot/ninerouter';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    const botConfig = await prisma.botConfig.findFirst({
      where: { organizationId: ctx.organizationId },
      select: { creditBalance: true },
    });
    const pub = await getNineRouterPublicConfig();
    return apiOk({
      creditBalance: botConfig ? botConfig.creditBalance : null,
      aiModel: pub.model || '',
      aiEnabled: pub.enabled,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat data AI Workspace.', 500);
  }
}
