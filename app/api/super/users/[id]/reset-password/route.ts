// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { hashPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';

/** POST /api/super/users/:id/reset-password — reset password user. Body: { password } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSuperAdmin(req);
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) return apiErr('User tidak ditemukan.', 404);
    const body = await req.json();
    const password = String(body?.password || '');
    if (password.length < 8) return apiErr('Password baru minimal 8 karakter.', 422);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(password) },
    });
    // Cabut sesi aktif agar password lama tidak bisa dipakai lagi
    await prisma.session.deleteMany({ where: { userId: user.id } });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'RESET_PASSWORD',
      module: 'USERS',
      description: `Administrator Pusat me-reset password ${user.name} (${user.email})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: user.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal me-reset password.', 500);
  }
}
