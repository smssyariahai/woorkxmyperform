// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/super/users/:id/superadmin — beri/cabut status Administrator Pusat.
 * Body: { isSuperAdmin: boolean }. Hanya Administrator Pusat; tidak bisa untuk diri sendiri.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSuperAdmin(req);
    if (params.id === ctx.userId) {
      return apiErr('Anda tidak dapat mengubah status Administrator Pusat akun sendiri.', 409);
    }
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) return apiErr('User tidak ditemukan.', 404);

    const body = await req.json();
    const isSuperAdmin = body?.isSuperAdmin === true;
    await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin } });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: isSuperAdmin ? 'GRANT_SUPERADMIN' : 'REVOKE_SUPERADMIN',
      module: 'USERS',
      description: `Administrator Pusat ${isSuperAdmin ? 'memberi' : 'mencabut'} status Administrator Pusat untuk ${user.name} (${user.email})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: user.id, isSuperAdmin });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah status Administrator Pusat.', 500);
  }
}
