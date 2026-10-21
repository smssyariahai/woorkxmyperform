import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/auth/memberships — daftar kantor yang bisa diakses user. */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const memberships = await prisma.membership.findMany({
      where: { userId: ctx.userId, status: 'ACTIVE' },
      include: {
        organization: { select: { id: true, name: true, slug: true, isActive: true } },
        role: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
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
