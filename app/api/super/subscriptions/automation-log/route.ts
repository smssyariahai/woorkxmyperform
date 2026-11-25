import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';

export const dynamic = 'force-dynamic';

/** GET /api/super/subscriptions/automation-log — log tindakan otomatis.
 *  Guard: PLATFORM_TENANTS_VIEW. Query ?tenantId=&action=&page= (50/halaman). */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId') || undefined;
    const action = url.searchParams.get('action') || undefined;
    const page = Math.max(
      1,
      parseInt(url.searchParams.get('page') ?? '1', 10) || 1,
    );
    const take = 50;
    const where: { tenantId?: string; action?: string } = {};
    if (tenantId) where.tenantId = tenantId;
    if (action) where.action = action;
    const [items, total] = await Promise.all([
      masterPrisma.subscriptionAutoActionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      masterPrisma.subscriptionAutoActionLog.count({ where }),
    ]);
    return apiOk({
      items: items.map((a) => ({
        id: a.id,
        tenantId: a.tenantId,
        subscriptionId: a.subscriptionId,
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
      page,
      total,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat log otomasi.', 500);
  }
}
