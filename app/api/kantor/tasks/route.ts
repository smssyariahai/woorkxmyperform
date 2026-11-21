// GET /api/kantor/tasks — daftar AgentTask kantor terbaru + pemetaan status
// Kanban ala Ruang (yugienugraha/ruang v0.2.0, MIT © 2026 yugienugraha).
// Read-only. Guard: auth + modul 'kantor' (tidak ada permission KANTOR_* di v1).
import { prisma } from '@/lib/db';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { KANTOR_KANBAN_MAP, type KantorTaskStatus } from '@/lib/kantor/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    // Wave 16 — riwayat chat per-user: `mine=1` hanya mengembalikan tugas
    // yang dibuat user yang sedang login (createdById dari sesi). Tanpa
    // `mine`, perilaku lama dipertahankan (daftar org, mis. kanban KantorClient).
    const { searchParams } = new URL(req.url);
    const where: any = { organizationId: ctx.organizationId };
    if (searchParams.get('mine') === '1') where.createdById = ctx.userId;
    const tasks = await prisma.agentTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { agent: { select: { id: true, name: true } } },
    });
    return apiOk({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        agentId: t.agentId,
        agentName: t.agent?.name ?? null,
        createdById: t.createdById,
        priority: t.priority,
        status: t.status,
        kanbanStatus: KANTOR_KANBAN_MAP[t.status as KantorTaskStatus] ?? 'todo',
        progress: t.progress,
        createdAt: t.createdAt.toISOString(),
        startedAt: t.startedAt ? t.startedAt.toISOString() : null,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      })),
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar tugas.', 500);
  }
}
