import { prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/super/offices/:id/users — daftar pengguna sebuah kantor. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const org = await prisma.organization.findUnique({ where: { id: params.id } });
    if (!org) return apiErr('Kantor tidak ditemukan.', 404);
    const members = await prisma.membership.findMany({
      where: { organizationId: org.id },
      include: {
        user: { select: { id: true, name: true, email: true, status: true, isSuperAdmin: true } },
        role: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return apiOk({
      office: { id: org.id, name: org.name },
      members: members.map((m) => ({
        id: m.id,
        user: m.user,
        role: m.role.name,
        department: m.department?.name ?? null,
        jobTitle: m.jobTitle,
        status: m.status,
        joinedAt: m.joinedAt,
      })),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengguna kantor.', 500);
  }
}
