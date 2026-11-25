import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  LifecycleError,
  getSubscriptionLifecycle,
  shapeSubscription,
} from '@/lib/tenant/subscription-lifecycle';
import {
  getAutomationSettings,
  shapeAutomationSettings,
  shapeInvoice,
} from '@/lib/tenant/subscription-automation';

export const dynamic = 'force-dynamic';

/** GET /api/super/subscriptions/monitoring/[tenantId] — detail satu tenant.
 *  Guard: PLATFORM_TENANTS_VIEW. Subscription + riwayat status (50) +
 *  log otomasi (50) + invoice (10 terbaru) + pengaturan. */
export async function GET(
  req: Request,
  { params }: { params: { tenantId: string } },
) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const { subscription, tenant, history } =
      await getSubscriptionLifecycle(params.tenantId);
    const [autoActions, invoices, settings] = await Promise.all([
      masterPrisma.subscriptionAutoActionLog.findMany({
        where: { tenantId: params.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      masterPrisma.subscriptionInvoice.findMany({
        where: { tenantId: params.tenantId },
        orderBy: { issuedAt: 'desc' },
        take: 10,
      }),
      getAutomationSettings(),
    ]);
    return apiOk({
      subscription: {
        ...shapeSubscription(subscription),
        graceEndsAt: subscription.graceEndsAt,
      },
      tenant: {
        id: tenant.id,
        tenantCode: tenant.tenantCode,
        companyName: tenant.companyName,
        tenantStatus: tenant.tenantStatus,
      },
      history: history.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        reason: h.reason,
        changedByUserId: h.changedByUserId,
        createdAt: h.createdAt,
      })),
      autoActions: autoActions.map((a) => ({
        id: a.id,
        action: a.action,
        detail: a.detail,
        reason: a.reason,
        actorType: a.actorType,
        actorUserId: a.actorUserId,
        metadata: (() => {
          try {
            return a.metadataJson ? JSON.parse(a.metadataJson) : null;
          } catch {
            return null;
          }
        })(),
        createdAt: a.createdAt,
      })),
      invoices: invoices.map(shapeInvoice),
      settings: shapeAutomationSettings(settings),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal memuat detail langganan tenant.', 500);
  }
}
