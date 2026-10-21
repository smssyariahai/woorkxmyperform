import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/users/:id/super-admin — atur status Administrator Pusat seorang pengguna.
 * :id adalah membershipId (sama seperti endpoint role/reset-password/deactivate).
 * Body: { isSuperAdmin: boolean }
 * Hanya boleh dipanggil oleh Administrator Pusat. Status ini berlaku global untuk
 * akun pengguna (bukan per kantor): akses semua kantor, billing/paket, Saldo Master,
 * Pengaturan Sistem, dan hapus kantor.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSuperAdmin(req);

    const membership = await prisma.membership.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { user: true },
    });
    if (!membership) return apiErr('Pengguna tidak ditemukan.', 404);

    const body = await req.json().catch(() => null);
    const target = body?.isSuperAdmin === true;

    // Sudah sesuai → idempotent, tidak perlu perubahan
    if (target === membership.user.isSuperAdmin) {
      return apiOk({ id: membership.id, isSuperAdmin: target });
    }

    if (!target) {
      // Anti-lockout: tidak bisa mencabut status akun sendiri
      if (membership.userId === ctx.userId) {
        return apiErr('Anda tidak dapat mencabut status Administrator Pusat akun Anda sendiri.', 409);
      }
      // Jangan cabut Administrator Pusat terakhir
      const others = await prisma.user.count({
        where: { isSuperAdmin: true, NOT: { id: membership.userId } },
      });
      if (others === 0) {
        return apiErr('Tidak dapat mencabut Administrator Pusat terakhir.', 409);
      }
    }

    await prisma.user.update({
      where: { id: membership.userId },
      data: { isSuperAdmin: target },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: target ? 'GRANT_SUPER_ADMIN' : 'REVOKE_SUPER_ADMIN',
      module: 'USERS',
      description: target
        ? `Menjadikan ${membership.user.name} (${membership.user.email}) sebagai Administrator Pusat`
        : `Mencabut status Administrator Pusat dari ${membership.user.name} (${membership.user.email})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: membership.id, isSuperAdmin: target });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah status Administrator Pusat.', 500);
  }
}
