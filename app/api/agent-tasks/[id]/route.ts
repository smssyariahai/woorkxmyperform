import { prisma } from '@/lib/db';
import { requirePermission, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/agent-tasks/:id — detail tugas + log event */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    await requireModule(ctx, 'kantor');
    const task = await prisma.agentTask.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: {
        agent: { select: { id: true, name: true, role: true, avatarColor: true } },
        events: { orderBy: { createdAt: 'asc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!task) return apiErr('Tugas tidak ditemukan.', 404);
    // Wave 16 — riwayat per-user: tugas milik user lain (createdById
    // terisi dan bukan milik peminta) tidak bisa dibaca lewat ID, sama
    // seperti tidak ada (404). Tugas lama tanpa createdById (NULL) tetap
    // bisa dibaca anggota kantor.
    if (task.createdById && task.createdById !== ctx.userId) return apiErr('Tugas tidak ditemukan.', 404);
    return apiOk(task);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tugas.', 500);
  }
}
