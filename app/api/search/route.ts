import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/search?q= — pencarian global */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) return apiOk({ customers: [], conversations: [] });

    const [customers, conversations] = await Promise.all([
      prisma.customer.findMany({
        where: {
          organizationId: ctx.organizationId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, phone: true },
        take: 5,
      }),
      prisma.conversation.findMany({
        where: {
          organizationId: ctx.organizationId,
          customer: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          },
        },
        include: {
          customer: { select: { name: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        take: 5,
      }),
    ]);

    return apiOk({
      customers,
      conversations: conversations.map((c) => ({
        id: c.id,
        customerName: c.customer.name,
        preview: c.messages[0]?.body.slice(0, 60) ?? '',
      })),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Pencarian gagal.', 500);
  }
}
