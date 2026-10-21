import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** GET /api/bot/flows */
export async function GET() {
  try {
    const ctx = await requirePermission('BOT_MANAGE');
    const flows = await prisma.botFlow.findMany({
      where: { organizationId: ctx.organizationId },
      include: { nodes: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return apiOk(flows);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat bot flows.', 500);
  }
}

/** POST /api/bot/flows — buat / update flow + nodes */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('BOT_MANAGE');
    const body = await req.json();
    const { name, description, isActive, nodes } = body;
    if (!name?.trim()) return apiErr('Nama flow wajib diisi.', 422);

    const flow = await prisma.botFlow.create({
      data: {
        organizationId: ctx.organizationId,
        name: name.trim(),
        description: description?.trim() || null,
        isActive: isActive !== false,
        nodes: {
          create: (nodes ?? []).map((n: any, i: number) => ({
            type: n.type,
            name: n.name,
            config: JSON.stringify(n.config ?? {}),
            position: JSON.stringify(n.position ?? {}),
            order: i,
          })),
        },
      },
      include: { nodes: true },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'BOT_FLOW_CREATED', module: 'BOT',
      description: `Membuat automation "${flow.name}"`, ipAddress: getClientIp(req),
    });
    return apiOk(flow, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan flow.', 500);
  }
}
