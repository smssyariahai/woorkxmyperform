import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { ensureAgents } from '@/lib/agents/scheduler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/office-layout — tata letak meja agent milik organisasi.
 * Isolasi per tenant via ctx.organizationId.
 */
export async function GET() {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    await ensureAgents(ctx.organizationId);
    const rows = await prisma.officeLayout.findMany({
      where: { organizationId: ctx.organizationId },
    });
    const layout: Record<string, { x: number; y: number }> = {};
    for (const r of rows) layout[r.agentId] = { x: r.x, y: r.y };
    return apiOk(layout);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tata letak.', 500);
  }
}

/**
 * PUT /api/office-layout — simpan tata letak (admin kantor ke atas).
 * Body: { items: [{ agentId, x, y }] } dengan x,y persen 0–100.
 */
export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE');
    const body = await req.json().catch(() => ({}));
    const items: { agentId: string; x: number; y: number }[] = Array.isArray(body.items) ? body.items : [];
    if (items.length > 50) return apiErr('Terlalu banyak item.', 400);

    // pastikan agent milik organisasi ini
    const agents = await prisma.agent.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true },
    });
    const own = new Set(agents.map((a) => a.id));
    const clean = items
      .filter((it) => it && own.has(it.agentId))
      .map((it) => ({
        agentId: it.agentId,
        x: Math.min(100, Math.max(0, Number(it.x) || 50)),
        y: Math.min(100, Math.max(0, Number(it.y) || 50)),
      }));

    await prisma.$transaction(
      clean.map((it) =>
        prisma.officeLayout.upsert({
          where: { organizationId_agentId: { organizationId: ctx.organizationId, agentId: it.agentId } },
          create: { organizationId: ctx.organizationId, agentId: it.agentId, x: it.x, y: it.y },
          update: { x: it.x, y: it.y },
        })
      )
    );
    return apiOk({ saved: clean.length });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan tata letak.', 500);
  }
}

/**
 * DELETE /api/office-layout — kembalikan ke tata letak awal (admin kantor ke atas).
 */
export async function DELETE() {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE');
    await prisma.officeLayout.deleteMany({ where: { organizationId: ctx.organizationId } });
    return apiOk({ reset: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mereset tata letak.', 500);
  }
}
