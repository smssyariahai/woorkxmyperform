// PUT /api/perusahaan/akun-master — simpan identitas Akun Master.
//
// Akun Master = user yang Membership-nya ber-role OWNER di org ini (orgId
// selalu dari sesi). Yang boleh mengubah: OWNER itu sendiri, ADMIN, atau
// Administrator Pusat. Email login TIDAK bisa diubah dari modul ini.
// Password diubah lewat PUT /api/settings scope=password (sudah ada).
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { POSITIONS, POSITION_OTHER, isValidPhone } from '@/lib/perusahaan/constants';
import { getOrgOwner } from '@/lib/perusahaan/server';

export const dynamic = 'force-dynamic';

const masterSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter.').max(200),
    position: z.string().refine((v) => (POSITIONS as readonly string[]).includes(v), {
      message: 'Posisi jabatan wajib dipilih.',
    }),
    customPosition: z.string().trim().max(100).nullable().optional(),
    phone: z
      .string()
      .trim()
      .refine((v) => isValidPhone(v), 'Nomor HP PIC tidak valid.'),
  })
  .superRefine((data, ctx) => {
    if (data.position === POSITION_OTHER) {
      if (!data.customPosition || data.customPosition.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customPosition'],
          message: 'Nama jabatan wajib diisi bila memilih Lainnya.',
        });
      }
    }
  });

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('PERUSAHAAN_MANAGE', req);
    const body = (await req.json().catch(() => null)) as unknown;
    if (!body || typeof body !== 'object') return apiErr('Data tidak valid.', 400);
    const parsed = masterSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return apiErr(first?.message || 'Data tidak valid.', 400, parsed.error.issues);
    }
    const d = parsed.data;
    const jobTitle = d.position === POSITION_OTHER ? d.customPosition!.trim() : d.position;

    const owner = await getOrgOwner(ctx.organizationId);
    if (!owner) return apiErr('Akun master perusahaan tidak ditemukan.', 404);

    // Hanya OWNER itu sendiri, ADMIN kantor, atau Administrator Pusat.
    const allowed =
      ctx.isSuperAdmin || ctx.role === 'ADMIN' || ctx.userId === owner.userId;
    if (!allowed) {
      return apiErr('Hanya Akun Master sendiri atau ADMIN yang boleh mengubah data ini.', 403);
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: owner.userId },
        data: { name: d.name, phone: d.phone },
      }),
      prisma.membership.update({
        where: { id: owner.membershipId },
        data: { jobTitle },
      }),
    ]);

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'PERUSAHAAN_UPDATE_AKUN_MASTER',
      module: 'PERUSAHAAN',
      description: `${ctx.name} memperbarui Akun Master (${d.name}, ${jobTitle})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({
      masterAccount: {
        id: owner.userId,
        name: d.name,
        email: owner.email,
        phone: d.phone,
        jobTitle,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan Akun Master.', 500);
  }
}
