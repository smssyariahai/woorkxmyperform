// GET /api/admin/kantor/catalog/[slug] — detail satu template katalog.
// Guard mengikuti layout admin-kantor (lihat route.ts list).
// systemInstructions disertakan APA ADANYA untuk di-review sebelum install —
// template diperlakukan sebagai data tak tepercaya, TIDAK PERNAH dieksekusi mentah.
import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { masterPrisma } from '@/lib/tenant/master';
import { apiOk, apiErr } from '@/lib/utils';
import { CATALOG_ATTRIBUTION } from '@/lib/kantor/catalog-importer';

export const dynamic = 'force-dynamic';

const ALLOWED = ['USERS_VIEW', 'ROLES_VIEW', 'DEPARTMENTS_VIEW', 'SETTINGS_MANAGE'];

function parseJsonArray(raw: string): unknown[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return apiErr('Silakan masuk terlebih dahulu.', 401);
    const keys = await getUserPermissions(ctx);
    const allowed = ctx.isSuperAdmin || ALLOWED.some((k) => keys.has(k));
    if (!allowed) return apiErr('Anda tidak memiliki akses Admin Kantor.', 403);

    const t = await masterPrisma.agentTemplate.findUnique({ where: { slug: params.slug } });
    if (!t) return apiErr('Template tidak ditemukan.', 404);

    return apiOk({
      id: t.id,
      slug: t.slug,
      name: t.name,
      category: t.category,
      description: t.description,
      expertise: t.expertise,
      personality: t.personality,
      systemInstructions: t.systemInstructions,
      deliverables: parseJsonArray(t.deliverables),
      workflows: parseJsonArray(t.workflows),
      requiredTools: t.requiredTools ? parseJsonArray(t.requiredTools) : null,
      suggestedDepartment: t.suggestedDepartment,
      suggestedFloor: t.suggestedFloor,
      templateVersion: t.templateVersion,
      isActive: t.isActive,
      isInstallable: t.isActive,
      updatedAt: t.updatedAt,
      attribution: CATALOG_ATTRIBUTION,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal memuat template.', 500);
  }
}
