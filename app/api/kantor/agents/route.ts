// GET /api/kantor/agents — daftar Agent kantor (read-only).
// Guard: auth + modul 'kantor' (tidak ada permission KANTOR_* di v1).
import { prisma } from '@/lib/db';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    const agents = await prisma.agent.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: 'asc' },
      take: 100,
      select: {
        id: true,
        name: true,
        role: true,
        avatarColor: true,
        currentStatus: true,
        isEnabled: true,
        description: true,
      },
    });
    return apiOk({ agents });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar agent.', 500);
  }
}
