// PUT /api/perusahaan/pajak — simpan informasi pajak (upsert CompanyTax).
// Semua field opsional — tidak memblokir penyimpanan bila kosong.
// Sinkronisasi NPWP 16 digit <-> Nomor Identifikasi Wajib Pajak.
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const digitsOnly = (v: string | null | undefined) =>
  !v || /^[0-9]+$/.test(v);

const taxSchema = z.object({
  npwp15: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => digitsOnly(v), 'NPWP 15 digit hanya boleh berisi angka.')
    .refine((v) => !v || v.length <= 15, 'NPWP 15 digit maksimal 15 angka.'),
  npwp16: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => digitsOnly(v), 'NPWP 16 digit hanya boleh berisi angka.')
    .refine((v) => !v || v.length <= 16, 'NPWP 16 digit maksimal 16 angka.'),
  taxDate: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => {
      if (!v) return true;
      const d = new Date(v);
      return !Number.isNaN(d.getTime());
    }, 'Tanggal kena pajak tidak valid.'),
  taxpayerName: z.string().trim().max(200).nullable().optional(),
  isTaxpayer: z.boolean().optional(),
  taxIdNumber: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => digitsOnly(v), 'Nomor Identifikasi Wajib Pajak hanya boleh berisi angka.')
    .refine((v) => !v || v.length <= 16, 'Nomor Identifikasi Wajib Pajak maksimal 16 angka.'),
});

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('PERUSAHAAN_MANAGE', req);
    const body = (await req.json().catch(() => null)) as unknown;
    if (!body || typeof body !== 'object') return apiErr('Data tidak valid.', 400);
    const parsed = taxSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return apiErr(first?.message || 'Data tidak valid.', 400, parsed.error.issues);
    }
    const d = parsed.data;

    // Sinkronisasi dua arah NPWP 16 digit <-> Nomor Identifikasi Wajib Pajak.
    let npwp16 = d.npwp16 || null;
    let taxIdNumber = d.taxIdNumber || null;
    if (npwp16 && !taxIdNumber) taxIdNumber = npwp16;
    if (taxIdNumber && !npwp16) npwp16 = taxIdNumber;

    const tax = await prisma.companyTax.upsert({
      where: { organizationId: ctx.organizationId },
      create: {
        organizationId: ctx.organizationId,
        npwp15: d.npwp15 || null,
        npwp16,
        taxDate: d.taxDate ? new Date(d.taxDate) : null,
        taxpayerName: d.taxpayerName || null,
        isTaxpayer: d.isTaxpayer ?? false,
        taxIdNumber,
      },
      update: {
        npwp15: d.npwp15 || null,
        npwp16,
        taxDate: d.taxDate ? new Date(d.taxDate) : null,
        taxpayerName: d.taxpayerName || null,
        isTaxpayer: d.isTaxpayer ?? false,
        taxIdNumber,
      },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'PERUSAHAAN_UPDATE_PAJAK',
      module: 'PERUSAHAAN',
      description: `${ctx.name} memperbarui informasi pajak perusahaan`,
      ipAddress: getClientIp(req),
    });
    return apiOk({
      tax: {
        npwp15: tax.npwp15,
        npwp16: tax.npwp16,
        taxDate: tax.taxDate ? tax.taxDate.toISOString().slice(0, 10) : null,
        taxpayerName: tax.taxpayerName,
        isTaxpayer: tax.isTaxpayer,
        taxIdNumber: tax.taxIdNumber,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan informasi pajak.', 500);
  }
}
