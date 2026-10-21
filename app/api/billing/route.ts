import { prisma } from '@/lib/db';
import { requireAuth, requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { PLANS, PLAN_KEYS, getPlan } from '@/lib/plans';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** GET /api/billing — paket aktif + daftar paket (read-only untuk user) */
export async function GET() {
  try {
    const ctx = await requireAuth();
    let sub = await prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
    });
    if (!sub) {
      sub = await prisma.subscription.create({
        data: { organizationId: ctx.organizationId, plan: 'FREE', status: 'ACTIVE' },
      });
    }
    return apiOk({
      subscription: sub,
      currentPlan: getPlan(sub.plan),
      plans: Object.values(PLANS),
      canManage: false, // perubahan paket hanya oleh Administrator Pusat
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat billing.', 500);
  }
}

const changePlanSchema = z.object({
  plan: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as [string, ...string[]]),
  organizationId: z.string().min(1),
});

/**
 * PUT /api/billing — ganti paket (HANYA Administrator Pusat).
 * Body: { organizationId, plan }
 */
export async function PUT(req: Request) {
  try {
    const ctx = await requireSuperAdmin(req);
    const body = await req.json();
    const parsed = changePlanSchema.safeParse(body);
    if (!parsed.success) return apiErr('Data tidak valid.', 422);
    if (!PLAN_KEYS.includes(parsed.data.plan)) return apiErr('Paket tidak valid.', 422);

    const org = await prisma.organization.findUnique({
      where: { id: parsed.data.organizationId },
      select: { id: true, name: true },
    });
    if (!org) return apiErr('Kantor tidak ditemukan.', 404);

    const plan = getPlan(parsed.data.plan);
    const isPaid = parsed.data.plan !== 'FREE';
    const sub = await prisma.subscription.upsert({
      where: { organizationId: org.id },
      update: {
        plan: parsed.data.plan,
        status: 'ACTIVE',
        currentPeriodEnd: isPaid ? new Date(Date.now() + 30 * 24 * 3600 * 1000) : null,
        // Paket yang ditentukan admin = bukan trial
        trialEndsAt: null,
      },
      create: {
        organizationId: org.id,
        plan: parsed.data.plan,
        status: 'ACTIVE',
        currentPeriodEnd: isPaid ? new Date(Date.now() + 30 * 24 * 3600 * 1000) : null,
      },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CHANGE_PLAN',
      module: 'BILLING',
      description: `Administrator Pusat mengubah paket "${org.name}" ke ${plan.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ subscription: sub, plan });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah paket.', 500);
  }
}
