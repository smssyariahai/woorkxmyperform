import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { hashPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';

/** POST /api/admin/users/:id/reset-password — reset password anggota kantor. Body: { password } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('USERS_UPDATE', req);
    const membership = await prisma.membership.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { user: true },
    });
    if (!membership) return apiErr('Pengguna tidak ditemukan.', 404);
    if (membership.user.isSuperAdmin && !ctx.isSuperAdmin) {
      return apiErr('Tidak dapat me-reset password Administrator Pusat.', 403);
    }

    const body = await req.json();
    const password = String(body?.password || '');
    if (password.length < 8) return apiErr('Password baru minimal 8 karakter.', 422);

    await prisma.user.update({
      where: { id: membership.userId },
      data: { password: await hashPassword(password) },
    });
    await prisma.session.deleteMany({ where: { userId: membership.userId } });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'RESET_PASSWORD',
      module: 'USERS',
      description: `Me-reset password ${membership.user.name} (${membership.user.email})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: membership.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal me-reset password.', 500);
  }
}
