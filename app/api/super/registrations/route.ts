import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const STATUSES = [
  'PENDING_VERIFICATION',
  'NEEDS_REVISION',
  'APPROVED',
  'REJECTED',
] as const;

interface PackageSnapshotShape {
  userTier?: { name?: string; monthlyPrice?: number | null } | null;
  storageTier?: { name?: string; monthlyPrice?: number | null } | null;
  modules?: { name?: string; monthlyPrice?: number | null }[];
  hasCustomPrice?: boolean;
}

function parseSnapshot(raw: string): PackageSnapshotShape | null {
  try {
    return JSON.parse(raw) as PackageSnapshotShape;
  } catch {
    return null;
  }
}

/**
 * GET /api/super/registrations?status=&q=&page= — antrean verifikasi
 * pendaftaran (guard VIEW). packageSummary diambil dari packageSnapshotJson
 * (tanpa query katalog per item).
 */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_REGISTRATIONS_VIEW', req);
    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? '';
    const q = (url.searchParams.get('q') ?? '').trim();
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const where: Record<string, unknown> = {};
    if ((STATUSES as readonly string[]).includes(status)) {
      where.status = status;
    }
    if (q) {
      where.OR = [
        { companyName: { contains: q, mode: 'insensitive' } },
        { picName: { contains: q, mode: 'insensitive' } },
        { picEmail: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [total, rows, grouped] = await Promise.all([
      masterPrisma.tenantRegistration.count({ where }),
      masterPrisma.tenantRegistration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          companyName: true,
          legalEntityType: true,
          city: true,
          picName: true,
          picEmail: true,
          startChoice: true,
          billingCycle: true,
          packageSnapshotJson: true,
          status: true,
          createdAt: true,
          decidedAt: true,
        },
      }),
      masterPrisma.tenantRegistration.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    const counts: Record<string, number> = {
      PENDING_VERIFICATION: 0,
      NEEDS_REVISION: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    for (const g of grouped) {
      if (g.status in counts) counts[g.status] = g._count._all;
    }
    const items = rows.map((r) => {
      const snap = parseSnapshot(r.packageSnapshotJson);
      const monthlyParts: (number | null | undefined)[] = [
        snap?.userTier?.monthlyPrice,
        snap?.storageTier?.monthlyPrice,
        ...(snap?.modules ?? []).map((m) => m.monthlyPrice),
      ];
      const monthlyPrice =
        snap?.hasCustomPrice || monthlyParts.some((p) => p == null)
          ? null
          : monthlyParts.reduce<number>((a, b) => a + (b ?? 0), 0);
      return {
        id: r.id,
        companyName: r.companyName,
        legalEntityType: r.legalEntityType,
        city: r.city,
        picName: r.picName,
        picEmail: r.picEmail,
        startChoice: r.startChoice,
        billingCycle: r.billingCycle,
        packageSummary: {
          userTierName: snap?.userTier?.name ?? null,
          storageTierName: snap?.storageTier?.name ?? null,
          moduleNames: (snap?.modules ?? []).map((m) => m.name ?? ''),
          monthlyPrice,
        },
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
      };
    });
    return apiOk({ items, counts, page, total });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error('[super/registrations] GET gagal:', e);
    return apiErr('Gagal memuat antrean pendaftaran.', 500);
  }
}
