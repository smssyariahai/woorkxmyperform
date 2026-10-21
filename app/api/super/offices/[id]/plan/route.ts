import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { PLANS, getPlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/** GET /api/super/offices/[id]/plan — paket kantor (Administrator Pusat) */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSuperAdmin(req);
    const sub = await prisma.subscription.findUnique({
      where: { organizationId: params.id },
      select: { plan: true, status: true, currentPeriodEnd: true, trialEndsAt: true },
    });
    return apiOk({
      subscription: sub,
      currentPlan: getPlan(sub?.plan ?? 'FREE'),
      plans: Object.values(PLANS),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat paket.', 500);
  }
}
