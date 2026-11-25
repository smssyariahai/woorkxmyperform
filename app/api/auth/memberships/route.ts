import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/auth/memberships — daftar kantor yang bisa diakses user. */
export async function GET() {
  try {
    const ctx = await requireAuth();
    // Membership TIDAK punya relasi `organization` di tenant client —
    // organisasi diambil terpisah lalu digabung (bentuk hasil sama).
    const rows = await prisma.membership.findMany({
      where: { userId: ctx.userId, status: 'ACTIVE' },
      include: {
        role: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    const orgIds = [...new Set(rows.map((m) => m.organizationId))];
    const orgs = orgIds.length
      ? await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, slug: true, isActive: true },
        })
      : [];
    const orgById = new Map(orgs.map((o) => [o.id, o]));
    const memberships = rows.map((m) => ({
      ...m,
      organization: orgById.get(m.organizationId) ?? {
        id: m.organizationId,
        name: '',
        slug: '',
        isActive: false,
      },
    }));
    return apiOk(
      memberships
        .filter((m) => m.organization.isActive || ctx.isSuperAdmin)
        .map((m) => ({
          organizationId: m.organization.id,
          organizationName: m.organization.name,
          slug: m.organization.slug,
          role: m.role.name,
          department: m.department?.name ?? null,
          jobTitle: m.jobTitle,
          current: m.organization.id === ctx.organizationId,
        }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar kantor.', 500);
  }
}
