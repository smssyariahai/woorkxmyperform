import { prisma } from '@/lib/db';
import { requirePermission, requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';

/** GET /api/settings — profil org + user */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const [org, user, sessions] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        include: { subscription: true },
      }),
      prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { id: true, name: true, email: true, phone: true, avatar: true },
      }),
      prisma.session.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    return apiOk({ org, user, role: ctx.role, sessions });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan.', 500);
  }
}

/** PUT /api/settings — ubah workspace / profil / password */
export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json();
    const { scope } = body;

    if (scope === 'workspace') {
      await requirePermission('SETTINGS_MANAGE');
      const org = await prisma.organization.update({
        where: { id: ctx.organizationId },
        data: {
          name: body.name?.trim(),
          industry: body.industry || null,
          teamSize: body.teamSize || null,
        },
      });
      await audit({
        organizationId: ctx.organizationId, userId: ctx.userId,
        action: 'UPDATE_SETTINGS', module: 'SETTINGS',
        description: 'Mengubah pengaturan workspace', ipAddress: getClientIp(req),
      });
      return apiOk(org);
    }

    if (scope === 'profile') {
      const user = await prisma.user.update({
        where: { id: ctx.userId },
        data: { name: body.name?.trim(), phone: body.phone?.trim() || null },
        select: { id: true, name: true, email: true, phone: true, avatar: true },
      });
      return apiOk(user);
    }

    if (scope === 'password') {
      const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
      if (!user?.password || !(await verifyPassword(body.currentPassword ?? '', user.password))) {
        return apiErr('Password saat ini salah.', 422);
      }
      if (!body.newPassword || body.newPassword.length < 8) {
        return apiErr('Password baru minimal 8 karakter.', 422);
      }
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { password: await hashPassword(body.newPassword) },
      });
      await audit({
        organizationId: ctx.organizationId, userId: ctx.userId,
        action: 'CHANGE_PASSWORD', module: 'SECURITY',
        description: `${ctx.name} mengubah password`, ipAddress: getClientIp(req),
      });
      return apiOk({ ok: true });
    }

    return apiErr('Scope tidak valid.', 422);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan.', 500);
  }
}
