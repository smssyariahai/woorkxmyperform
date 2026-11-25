// GET/PUT /api/daily/preferences — preferensi tampilan Daily Workspace
// (layout, widget yang terlihat, urutan widget, quick actions). Upsert per
// (userId, organizationId). Timezone dibaca dari preferensi kalender.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function serializePref(p: any) {
  return {
    layoutConfiguration: (p.layoutConfiguration ?? {}) as Record<string, unknown>,
    visibleWidgets: (p.visibleWidgets ?? []) as string[],
    widgetOrder: (p.widgetOrder ?? []) as string[],
    quickActions: (p.quickActions ?? []) as string[],
    updatedAt: p.updatedAt.toISOString(),
  };
}

const DEFAULT_PREF = {
  layoutConfiguration: {},
  visibleWidgets: [],
  widgetOrder: [],
  quickActions: [],
};

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const pref = await prisma.dailyWorkspacePreference.findUnique({
      where: {
        organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId },
      },
    });
    return apiOk(pref ? serializePref(pref) : DEFAULT_PREF);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/preferences GET]', e);
    return apiErr('Gagal memuat preferensi.', 500);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiErr('Body tidak valid.', 400);
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
    const layoutConfiguration =
      body.layoutConfiguration && typeof body.layoutConfiguration === 'object'
        ? body.layoutConfiguration
        : {};

    const pref = await prisma.dailyWorkspacePreference.upsert({
      where: {
        organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId },
      },
      create: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        layoutConfiguration,
        visibleWidgets: strArr(body.visibleWidgets),
        widgetOrder: strArr(body.widgetOrder),
        quickActions: strArr(body.quickActions),
      },
      update: {
        layoutConfiguration,
        visibleWidgets: strArr(body.visibleWidgets),
        widgetOrder: strArr(body.widgetOrder),
        quickActions: strArr(body.quickActions),
      },
    });
    return apiOk(serializePref(pref));
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/preferences PUT]', e);
    return apiErr('Gagal menyimpan preferensi.', 500);
  }
}
