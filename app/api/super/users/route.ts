import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/super/users — daftar pengguna SEMUA kantor (khusus Administrator Pusat).
 * Satu baris = satu keanggotaan (user yang terdaftar di 2 kantor muncul 2x).
 * Query: q (nama/email), organizationId, role (nama role), status (membership:
 * ACTIVE/INACTIVE), page, perPage.
 * Catatan: JANGAN samakan dengan GET /api/admin/users — endpoint itu
 * per-kantor (where organizationId = ctx.organizationId) dan tidak diubah.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireSuperAdmin(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const organizationId = searchParams.get('organizationId') ?? '';
    const role = searchParams.get('role') ?? '';
    const status = searchParams.get('status') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('perPage') ?? '20')));

    const where: any = {};
    if (organizationId) where.organizationId = organizationId;
    if (role) where.role = { name: role };
    if (status) where.status = status;
    if (q) {
      where.user = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [total, items, organizations, roleNames] = await Promise.all([
      prisma.membership.count({ where }),
      prisma.membership.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, status: true, isSuperAdmin: true, createdAt: true } },
          role: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { joinedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.organization.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.role.findMany({ select: { name: true }, distinct: ['name'], orderBy: { name: 'asc' } }),
    ]);

    return apiOk({
      items: items.map((m) => ({
        membershipId: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        /** Status akun global (mengunci login bila INACTIVE). */
        userStatus: m.user.status,
        isSuperAdmin: m.user.isSuperAdmin,
        /** Baris ini adalah akun sendiri (tombol super admin disembunyikan). */
        isSelf: m.user.id === ctx.userId,
        /** Status keanggotaan di kantor ini (yang diubah tombol aktif/nonaktif). */
        status: m.status,
        roleId: m.role.id,
        role: m.role.name,
        organizationId: m.organization.id,
        organization: m.organization.name,
        joinedAt: m.joinedAt,
      })),
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
      organizations,
      roles: roleNames.map((r) => r.name),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengguna.', 500);
  }
}
