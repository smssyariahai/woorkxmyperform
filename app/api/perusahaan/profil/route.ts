// GET /api/perusahaan/profil — profil perusahaan + akun master + pajak +
// dokumen ringkas + kelengkapan. PUT — simpan informasi perusahaan.
//
// Otorisasi: orgId selalu dari sesi (requirePermission), bukan dari request.
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import {
  BUSINESS_TYPES,
  ENTITY_FORMS,
  INDUSTRY_KEYS,
  isValidPhone,
} from '@/lib/perusahaan/constants';
import { computeCompleteness } from '@/lib/perusahaan/completeness';
import { getOrgOwner, getOrgProfile } from '@/lib/perusahaan/server';

export const dynamic = 'force-dynamic';

const profileSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama perusahaan minimal 2 karakter.').max(200),
    phone: z
      .string()
      .trim()
      .refine((v) => isValidPhone(v), 'Nomor telepon perusahaan tidak valid.'),
    businessType: z.enum(BUSINESS_TYPES as unknown as [string, ...string[]], {
      errorMap: () => ({ message: 'Jenis usaha wajib dipilih.' }),
    }),
    entityForm: z.string().trim().nullable().optional(),
    industry: z.string().refine((v) => INDUSTRY_KEYS.includes(v), 'Industri wajib dipilih.'),
    email: z
      .string()
      .trim()
      .nullable()
      .optional()
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Format email perusahaan tidak valid.'),
    address: z.string().trim().max(500).nullable().optional(),
    country: z.string().trim().max(100).nullable().optional(),
    province: z.string().trim().max(100).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    district: z.string().trim().max(100).nullable().optional(),
    village: z.string().trim().max(100).nullable().optional(),
    postalCode: z
      .string()
      .trim()
      .nullable()
      .optional()
      .refine((v) => !v || /^[0-9]{3,10}$/.test(v), 'Kode pos hanya boleh berisi angka.'),
    latitude: z.number().min(-90, 'Latitude harus -90 s.d. 90.').max(90).nullable().optional(),
    longitude: z.number().min(-180, 'Longitude harus -180 s.d. 180.').max(180).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.businessType === 'BADAN_USAHA') {
      if (!data.entityForm || !(ENTITY_FORMS as readonly string[]).includes(data.entityForm)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entityForm'],
          message: 'Bentuk badan usaha wajib dipilih untuk jenis usaha Badan Usaha.',
        });
      }
    }
  });

function mapProfile(org: NonNullable<Awaited<ReturnType<typeof getOrgProfile>>>) {
  return {
    organization: {
      id: org.id,
      name: org.name,
      phone: org.phone,
      email: org.email,
      address: org.address,
      businessType: org.businessType,
      entityForm: org.entityForm,
      industry: org.industry,
      country: org.country,
      province: org.province,
      city: org.city,
      district: org.district,
      village: org.village,
      postalCode: org.postalCode,
      latitude: org.latitude,
      longitude: org.longitude,
      logoPath: org.logoPath,
      profileStatus: org.profileStatus,
      profileCompletedAt: org.profileCompletedAt ? org.profileCompletedAt.toISOString() : null,
    },
    tax: org.companyTax
      ? {
          npwp15: org.companyTax.npwp15,
          npwp16: org.companyTax.npwp16,
          taxDate: org.companyTax.taxDate ? org.companyTax.taxDate.toISOString().slice(0, 10) : null,
          taxpayerName: org.companyTax.taxpayerName,
          isTaxpayer: org.companyTax.isTaxpayer,
          taxIdNumber: org.companyTax.taxIdNumber,
        }
      : null,
    documents: org.companyDocuments.map((d) => ({
      id: d.id,
      docType: d.docType,
      label: d.label,
      originalName: d.originalName,
      mimeType: d.mimeType,
      originalSize: d.originalSize,
      compressedSize: d.compressedSize,
      status: d.status,
      uploadedByName: d.uploadedBy?.name ?? 'Pengguna',
      uploadedAt: d.uploadedAt.toISOString(),
    })),
  };
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('PERUSAHAAN_VIEW', req);
    const org = await getOrgProfile(ctx.organizationId);
    if (!org) return apiErr('Perusahaan tidak ditemukan.', 404);
    const owner = await getOrgOwner(ctx.organizationId);
    const completeness = computeCompleteness(org, org.companyTax, org.companyDocuments);
    return apiOk({
      ...mapProfile(org),
      masterAccount: owner
        ? {
            id: owner.userId,
            name: owner.name,
            email: owner.email,
            phone: owner.phone,
            jobTitle: owner.jobTitle,
          }
        : null,
      completeness,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat profil perusahaan.', 500);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('PERUSAHAAN_MANAGE', req);
    const body = (await req.json().catch(() => null)) as unknown;
    if (!body || typeof body !== 'object') return apiErr('Data tidak valid.', 400);
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return apiErr(first?.message || 'Data tidak valid.', 400, parsed.error.issues);
    }
    const d = parsed.data;
    const isBadanUsaha = d.businessType === 'BADAN_USAHA';

    const updated = await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: {
        name: d.name,
        phone: d.phone,
        businessType: d.businessType,
        // Bila jenis usaha berubah ke UMKM, bentuk badan usaha dikosongkan
        // (dokumen yang sudah diunggah TIDAK dihapus — hanya tidak lagi
        // masuk daftar wajib).
        entityForm: isBadanUsaha ? d.entityForm! : null,
        industry: d.industry,
        email: d.email || null,
        address: d.address || null,
        country: d.country || 'Indonesia',
        province: d.province || null,
        city: d.city || null,
        district: d.district || null,
        village: d.village || null,
        postalCode: d.postalCode || null,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
      },
    });

    // Hitung ulang kelengkapan dari data terbaru + dokumen yang ada.
    const docs = await prisma.companyDocument.findMany({
      where: { organizationId: ctx.organizationId },
      select: { docType: true },
    });
    const completeness = computeCompleteness(updated, null, docs);
    const statusUpdate: { profileStatus: string; profileCompletedAt?: Date } = {
      profileStatus: completeness.status,
    };
    if (completeness.status === 'LENGKAP' && !updated.profileCompletedAt) {
      statusUpdate.profileCompletedAt = new Date();
    }
    if (updated.profileStatus !== completeness.status || statusUpdate.profileCompletedAt) {
      await prisma.organization.update({
        where: { id: ctx.organizationId },
        data: statusUpdate,
      });
    }

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'PERUSAHAAN_UPDATE_PROFIL',
      module: 'PERUSAHAAN',
      description: `${ctx.name} memperbarui profil perusahaan "${updated.name}" (kelengkapan ${completeness.percent}%, ${completeness.status})`,
      ipAddress: getClientIp(req),
    });
    const fresh = await getOrgProfile(ctx.organizationId);
    const owner = await getOrgOwner(ctx.organizationId);
    return apiOk({
      ...mapProfile(fresh!),
      masterAccount: owner
        ? {
            id: owner.userId,
            name: owner.name,
            email: owner.email,
            phone: owner.phone,
            jobTitle: owner.jobTitle,
          }
        : null,
      completeness,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan profil perusahaan.', 500);
  }
}
