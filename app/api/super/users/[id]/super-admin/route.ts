import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/super/users/:id/super-admin — jadikan / cabut Administrator Pusat.
 * Body: { isSuperAdmin: boolean }. Khusus Administrator Pusat.
 * Pengaman: tidak bisa mengubah status akun sendiri; tidak bisa mencabut
 * Administrator Pusat terakhir. Sesi aktif pengguna dicabut agar perubahan
 * langsung berlaku — pengguna harus login ulang lewat pintu admin (/admin),
 * karena sesi pintu kantor tidak mendapat efek super admin.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSuperAdmin(req);
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) return apiErr('User tidak ditemukan.', 404);
    if (user.id === ctx.userId) {
      return apiErr('Anda tidak dapat mengubah status Administrator Pusat akun sendiri.', 409);
    }

    const body = await req.json();
    const makeSuper = body?.isSuperAdmin === true;

    // Jangan cabut Administrator Pusat terakhir.
    if (!makeSuper && user.isSuperAdmin) {
      const others = await prisma.user.count({
        where: { isSuperAdmin: true, NOT: { id: user.id } },
      });
      if (others === 0) {
        return apiErr('Tidak dapat mencabut Administrator Pusat terakhir.', 409);
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: makeSuper } });
    // Cabut sesi aktif agar perubahan langsung berlaku.
    await prisma.session.deleteMany({ where: { userId: user.id } });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: makeSuper ? 'GRANT_SUPERADMIN' : 'REVOKE_SUPERADMIN',
      module: 'USERS',
      description: `Administrator Pusat ${makeSuper ? 'menjadikan' : 'mencabut status Administrator Pusat dari'} pengguna ${user.name} (${user.email})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: user.id, isSuperAdmin: makeSuper });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah status Administrator Pusat.', 500);
  }
}
