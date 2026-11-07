import { prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/super/invoices/[id] — detail invoice + item + langganan terkait. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const inv = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: {
        organization: { select: { id: true, name: true, subdomain: true } },
        subscription: {
          select: { id: true, status: true, billingCycle: true, userQuota: true, startDate: true, endDate: true },
        },
        items: true,
      },
    });
    if (!inv) return apiErr('Invoice tidak ditemukan.', 404);
    return apiOk({
      ...inv,
      organizationName: inv.organization.name,
      isOverdue: inv.status === 'PENDING' && new Date(inv.dueDate).getTime() < Date.now(),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat invoice.', 500);
  }
}
