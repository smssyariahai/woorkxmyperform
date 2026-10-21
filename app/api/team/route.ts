import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { inviteSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/team — daftar anggota */
export async function GET() {
  try {
    const ctx = await requirePermission('TEAM_MANAGE');
    const [members, invitations] = await Promise.all([
      prisma.membership.findMany({
        where: { organizationId: ctx.organizationId },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true, status: true, createdAt: true } },
          role: { select: { id: true, name: true } },
        },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.invitation.findMany({
        where: { organizationId: ctx.organizationId, acceptedAt: null },
        include: { role: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return apiOk({ members, invitations });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tim.', 500);
  }
}

/** POST /api/team — undang anggota */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('TEAM_MANAGE');
    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);

    const email = parsed.data.email.toLowerCase().trim();
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const m = await prisma.membership.findFirst({
        where: { userId: existingUser.id, organizationId: ctx.organizationId },
      });
      if (m) return apiErr('Email sudah menjadi anggota workspace.', 409);
    }

    const role = await prisma.role.findFirst({
      where: { organizationId: ctx.organizationId, name: parsed.data.role },
    });
    if (!role) return apiErr('Role tidak valid.', 422);

    const invitation = await prisma.invitation.upsert({
      where: { organizationId_email: { organizationId: ctx.organizationId, email } },
      update: { roleId: role.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), acceptedAt: null },
      create: {
        organizationId: ctx.organizationId,
        email,
        roleId: role.id,
        token: randomUUID().replace(/-/g, ''),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        invitedById: ctx.userId,
      },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'INVITE_USER',
      module: 'TEAM',
      description: `Mengundang ${email} sebagai ${role.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk(invitation, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengundang anggota.', 500);
  }
}
