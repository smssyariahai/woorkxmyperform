import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/approvals — daftar pengajuan persetujuan (pending default) */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'PENDING';
    const items = await prisma.approval.findMany({
      where: { organizationId: ctx.organizationId, status },
      include: {
        task: { select: { id: true, title: true, status: true } },
        requestedBy: { select: { id: true, name: true, avatarColor: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return apiOk(items);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat persetujuan.', 500);
  }
}
