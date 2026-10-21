import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { AVAILABLE_MODULES } from '@/lib/modules';

export const dynamic = 'force-dynamic';


/** GET /api/admin/office — profil & pengaturan kantor aktif. */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE', req);
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      include: {
        _count: {
          select: {
            memberships: true,
            departments: true,
            roles: true,
            customers: true,
          },
        },
      },
    });
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
      counts: org._count,
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
