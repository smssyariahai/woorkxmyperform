// GET /api/admin/kantor/catalog — daftar template katalog agent (master DB).
// Guard mengikuti layout admin-kantor: Super Admin atau salah satu dari
// USERS_VIEW / ROLES_VIEW / DEPARTMENTS_VIEW / SETTINGS_MANAGE.
// Query: ?q= (cari nama/deskripsi) &category= (divisi repo) &limit= (default 200, maks 500).
import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { masterPrisma } from '@/lib/tenant/master';
import { apiOk, apiErr } from '@/lib/utils';
import { CATALOG_ATTRIBUTION } from '@/lib/kantor/catalog-importer';

export const dynamic = 'force-dynamic';

const ALLOWED = ['USERS_VIEW', 'ROLES_VIEW', 'DEPARTMENTS_VIEW', 'SETTINGS_MANAGE'];

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return apiErr('Silakan masuk terlebih dahulu.', 401);
    const keys = await getUserPermissions(ctx);
    const allowed = ctx.isSuperAdmin || ALLOWED.some((k) => keys.has(k));
    if (!allowed) return apiErr('Anda tidak memiliki akses Admin Kantor.', 403);

    const url = new URL(req.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const category = (url.searchParams.get('category') ?? '').trim();
    const limitRaw = Number(url.searchParams.get('limit') ?? '200');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    const templates = await masterPrisma.agentTemplate.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        category: true,
        description: true,
        personality: true,
        suggestedDepartment: true,
        suggestedFloor: true,
        templateVersion: true,
        updatedAt: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      take: limit,
    });

    const grouped = await masterPrisma.agentTemplate.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    });
    const categories = grouped.map((g) => ({ id: g.category, count: g._count._all }));

    return apiOk({ templates, categories, total: templates.length, attribution: CATALOG_ATTRIBUTION });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal memuat katalog.', 500);
  }
}
