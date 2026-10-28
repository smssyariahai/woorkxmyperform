import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/super/platform-admins/users?q= — cari pengguna untuk penugasan (khusus super admin). */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) return apiOk([]);
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        isSuperAdmin: true,
        platformRoleAssignments: { include: { role: { select: { id: true, name: true } } } },
      },
      take: 20,
      orderBy: { email: 'asc' },
    });
    return apiOk(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        isSuperAdmin: u.isSuperAdmin,
        platformRoles: u.platformRoleAssignments.map((a) => ({ id: a.role.id, name: a.role.name })),
      }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mencari pengguna.', 500);
  }
}
