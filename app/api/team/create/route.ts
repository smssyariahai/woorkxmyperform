import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { hashPassword } from '@/lib/password';
import { z } from 'zod';
import { checkUserQuota } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

const createUserSchema = z.object({
  name: z.string().min(3, 'Nama minimal 3 karakter').max(100),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter').max(100),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'AGENT', 'VIEWER']),
});

/** POST /api/team/create — buat akun anggota langsung (tanpa undangan) */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('TEAM_MANAGE');
    // Kuota karyawan langganan (Sistem Modular menggantikan batas trial).
    await checkUserQuota(ctx.organizationId);
    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    }

    const email = parsed.data.email.toLowerCase().trim();
    const role = await prisma.role.findFirst({
      where: { organizationId: ctx.organizationId, name: parsed.data.role },
    });
    if (!role) return apiErr('Role tidak valid.', 422);

    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const existing = await prisma.membership.findFirst({
        where: { userId: user.id, organizationId: ctx.organizationId },
      });
      if (existing) return apiErr('Email sudah menjadi anggota workspace.', 409);
    } else {
      user = await prisma.user.create({
        data: {
          name: parsed.data.name.trim(),
          email,
          password: await hashPassword(parsed.data.password),
          emailVerified: new Date(),
        },
      });
    }

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: ctx.organizationId,
        roleId: role.id,
        status: 'ACTIVE',
      },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_USER',
      module: 'TEAM',
      description: `Membuat akun ${email} sebagai ${role.name}`,
      ipAddress: getClientIp(req),
    });
    // Membership TIDAK punya relasi `user`/`role` di tenant client — bentuk
    // respons sama seperti include lama (Lapisan F).
    return apiOk(
      {
        ...membership,
        user: { id: user.id, name: user.name, email: user.email },
        role: { name: role.name },
      },
      201
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat akun.', 500);
  }
}
