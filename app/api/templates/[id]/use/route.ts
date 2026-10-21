import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** POST /api/templates/:id/use — catat pemakaian template (naikkan usageCount) */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    const existing = await prisma.replyTemplate.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!existing) return apiErr('Template tidak ditemukan.', 404);

    const tpl = await prisma.replyTemplate.update({
      where: { id: params.id },
      data: { usageCount: { increment: 1 } },
    });
    return apiOk({ id: tpl.id, usageCount: tpl.usageCount });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mencatat pemakaian.', 500);
  }
}
