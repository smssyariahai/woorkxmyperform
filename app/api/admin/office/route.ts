import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { AVAILABLE_MODULES } from '@/lib/modules';
import { publishModuleAccess } from '@/lib/realtime';

export const dynamic = 'force-dynamic';


/** GET /api/admin/office — profil & pengaturan kantor aktif. */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE', req);
    // Organization mirror di tenant client TIDAK punya relasi/_count —
    // hitungan diambil terpisah (hasil sama: semua membership/department/
    // role/customer milik org, tanpa filter status).
    const [org, counts] = await Promise.all([
      prisma.organization.findUnique({ where: { id: ctx.organizationId } }),
      Promise.all([
        prisma.membership.count({ where: { organizationId: ctx.organizationId } }),
        prisma.department.count({ where: { organizationId: ctx.organizationId } }),
        prisma.role.count({ where: { organizationId: ctx.organizationId } }),
        prisma.customer.count({ where: { organizationId: ctx.organizationId } }),
      ]).then(([memberships, departments, roles, customers]) => ({
        memberships,
        departments,
        roles,
        customers,
      })),
    ]);
    if (!org) return apiErr('Kantor tidak ditemukan.', 404);
    return apiOk({
      id: org.id,
      name: org.name,
      slug: org.slug,
      industry: org.industry,
      teamSize: org.teamSize,
      description: org.description,
      tagline: org.tagline,
      phone: org.phone,
      email: org.email,
      address: org.address,
      website: org.website,
      hasLogo: !!org.logoPath,
      hasCover: !!org.coverPath,
      logoUrl: org.logoPath ? `/api/o/${org.subdomain}/logo` : null,
      coverUrl: org.coverPath ? `/api/o/${org.subdomain}/cover` : null,
      subdomain: org.subdomain,
      siteUrl: org.subdomain ? `https://${org.subdomain}.xsramazys.dev` : null,
      subdomainLocked: !!org.subdomainChangedAt,
      canChangeSubdomain: ctx.isSuperAdmin || ctx.role === 'OWNER',
      isActive: org.isActive,
      modules: JSON.parse(org.modules || '[]'),
      availableModules: AVAILABLE_MODULES,
      counts,
      createdAt: org.createdAt,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan kantor.', 500);
  }
}

/** PATCH /api/admin/office — edit profil & modul kantor. */
export async function PATCH(req: Request) {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE', req);
    const body = await req.json();
    const data: any = {};
    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return apiErr('Nama kantor tidak boleh kosong.', 422);
      data.name = name;
    }
    if (body?.industry !== undefined) data.industry = String(body.industry).trim() || null;
    if (body?.teamSize !== undefined) data.teamSize = String(body.teamSize).trim() || null;
    if (body?.description !== undefined) data.description = String(body.description).trim() || null;
    for (const f of ['tagline', 'phone', 'email', 'address', 'website']) {
      if (body?.[f] !== undefined) (data as any)[f] = String(body[f]).trim() || null;
    }
    if (Array.isArray(body?.modules)) {
      const valid: Set<string> = new Set(AVAILABLE_MODULES.map((m) => m.key));
      data.modules = JSON.stringify([...new Set(body.modules)].filter((k) => valid.has(k as string)));
    }
    const updated = await prisma.organization.update({
      where: { id: ctx.organizationId },
      data,
    });
    // Bila modul tingkat kantor berubah: semua sesi di kantor ini refresh
    // sidebar otomatis (menu yang dimatikan langsung hilang tanpa reload).
    if (Array.isArray(body?.modules)) {
      publishModuleAccess(ctx.organizationId, null);
    }
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_OFFICE',
      module: 'OFFICE',
      description: `Memperbarui pengaturan kantor "${updated.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: updated.id, name: updated.name, modules: JSON.parse(updated.modules || '[]') });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui pengaturan kantor.', 500);
  }
}
