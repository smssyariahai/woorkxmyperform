// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { PLANS, getPlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/** GET /api/super/offices/[id]/plan — paket kantor (Administrator Pusat) */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
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
