import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const resetSchema = z.object({
  newPassword: z.string().min(8, 'Password baru minimal 8 karakter').max(100),
});

/** POST /api/team/:id/reset-password — admin mereset password anggota */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('TEAM_MANAGE');
    const body = await req.json();
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    }

    const membership = await prisma.membership.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { user: true, role: true },
    });
    if (!membership) return apiErr('Anggota tidak ditemukan.', 404);
    if (membership.userId === ctx.userId) {
      return apiErr('Gunakan halaman Profil untuk mengubah password sendiri.', 409);
    }
    if (membership.role.name === 'OWNER' && ctx.role !== 'OWNER') {
      return apiErr('Hanya owner yang dapat mereset password owner lain.', 403);
    }

    await prisma.user.update({
      where: { id: membership.userId },
      data: { password: await hashPassword(parsed.data.newPassword) },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'RESET_PASSWORD',
      module: 'TEAM',
      description: `Mereset password ${membership.user.name} (${membership.user.email})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mereset password.', 500);
  }
}
