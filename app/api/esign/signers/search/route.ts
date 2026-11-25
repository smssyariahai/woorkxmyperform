import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/esign/signers/search?q= — cari pengguna dalam kantor untuk
 * dijadikan penandatangan. Menggabungkan Membership (jabatan/departemen)
 * dan HrEmployee (fallback jabatan/departemen dari data HR).
 */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ESIGN_CREATE');
    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) return apiOk({ items: [] });

    // Cari user tidak bisa memakai filter relasi `user` pada Membership di
    // tenant client — selesaikan dulu user yang cocok, lalu ambil membership
    // mereka dengan `userId in [...]` (Lapisan F).
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true, phone: true },
      take: 100,
    });
    const membershipRows = await prisma.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: 'ACTIVE',
        userId: { in: users.map((u) => u.id) },
      },
      include: {
        department: { select: { name: true } },
      },
      take: 20,
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const memberships = membershipRows
      .filter((m) => byId.has(m.userId))
      .map((m) => ({ ...m, user: byId.get(m.userId)! }));

    const employees = await prisma.hrEmployee.findMany({
      where: {
        organizationId: ctx.organizationId,
        email: { in: memberships.map((m) => m.user.email) },
      },
      select: { email: true, position: true, department: true },
    });
    const empByEmail = new Map(employees.map((e) => [e.email, e]));

    const items = memberships.map((m) => {
      const emp = empByEmail.get(m.user.email);
      return {
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        phone: m.user.phone,
        position: m.jobTitle ?? emp?.position ?? null,
        department: m.department?.name ?? emp?.department ?? null,
      };
    });
    return apiOk({ items });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mencari pengguna.', 500);
  }
}
