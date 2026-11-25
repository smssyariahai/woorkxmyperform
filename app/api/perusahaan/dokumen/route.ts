// GET /api/perusahaan/dokumen — daftar dokumen legalitas org ini.
// POST — upload dokumen baru (multipart: docType, label?, originalSize?, file).
//
// Aturan:
// - docType harus berlaku untuk businessType org saat ini.
// - Foto dikompres client-side sebelum upload; server memvalidasi ulang
//   ukuran akhir + MIME + magic bytes. PDF di atas batas dicoba optimasi
//   via pdf-lib dulu; bila tetap di atas batas -> 400.
// - docType non-multiple yang sudah ada -> GANTI: file lama dihapus HANYA
//   setelah file baru berhasil disimpan + baris DB diperbarui.
// - docType multiple -> tambah baris baru.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { findDocType, formatBytes } from '@/lib/perusahaan/constants';
import { computeCompleteness } from '@/lib/perusahaan/completeness';
import {
  deletePerusahaanFile,
  optimizePdf,
  savePerusahaanFile,
  validatePerusahaanFile,
} from '@/lib/perusahaan/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('PERUSAHAAN_VIEW', req);
    // CompanyDocument TIDAK punya relasi `uploadedBy` di tenant client —
    // nama pengunggah diambil terpisah dari mirror User.
    const rows = await prisma.companyDocument.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { uploadedAt: 'desc' },
    });
    const uploaderIds = [...new Set(rows.map((d) => d.uploadedById))];
    const uploaders = uploaderIds.length
      ? await prisma.user.findMany({
          where: { id: { in: uploaderIds } },
          select: { id: true, name: true },
        })
      : [];
    const uploaderById = new Map(uploaders.map((u) => [u.id, u]));
    const documents = rows.map((d) => ({
      ...d,
      uploadedBy: uploaderById.get(d.uploadedById) ?? null,
    }));
    return apiOk({
      documents: documents.map((d) => ({
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
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat dokumen perusahaan.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('PERUSAHAAN_MANAGE', req);
    const form = await req.formData();
    const docType = String(form.get('docType') ?? '').trim();
    if (!docType) return apiErr('Jenis dokumen wajib dipilih.', 400);
    const label = String(form.get('label') ?? '').trim() || null;
    if (label && label.length > 100) return apiErr('Keterangan maksimal 100 karakter.', 400);
    const originalSizeRaw = Number(form.get('originalSize') ?? 0);
    const originalSize = Number.isFinite(originalSizeRaw) && originalSizeRaw > 0 ? Math.round(originalSizeRaw) : null;

    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, businessType: true, name: true, profileStatus: true, profileCompletedAt: true },
    });
    if (!org) return apiErr('Perusahaan tidak ditemukan.', 404);
    const def = findDocType(org.businessType, docType);
    if (!def) {
      return apiErr(
        org.businessType
          ? `Dokumen ${docType} tidak berlaku untuk jenis usaha ${org.businessType === 'UMKM' ? 'Usaha Perorangan / UMKM' : 'Badan Usaha'}.`
          : 'Pilih Jenis Usaha di tab Informasi Perusahaan terlebih dahulu.',
        400
      );
    }
    if (def.labelOptions && label && !def.labelOptions.includes(label)) {
      return apiErr(`Keterangan harus salah satu dari: ${def.labelOptions.join(', ')}.`, 400);
    }

    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return apiErr('Tidak ada file yang diunggah.', 422);
    }
    // `Buffer` tanpa argumen tipe = Buffer<ArrayBufferLike> (TS 5.7+);
    // anotasi eksplisit agar penugasan dari optimizePdf tetap cocok.
    let buffer: Buffer = Buffer.from(await file.arrayBuffer());

    // PDF di atas batas: coba optimasi dulu sebelum menolak.
    if (def.category === 'PDF' && buffer.length > def.maxBytes) {
      buffer = await optimizePdf(buffer);
    }
    const checked = validatePerusahaanFile(file, buffer, def);
    if (checked.error) return apiErr(checked.error, 422);

    // Simpan file baru dulu (nama dibuat server-side).
    const { storedName, filePath } = await savePerusahaanFile(
      ctx.organizationId,
      buffer,
      checked.ext!
    );

    const existing =
      def.multiple
        ? null
        : await prisma.companyDocument.findFirst({
            where: { organizationId: ctx.organizationId, docType },
            select: { id: true, filePath: true },
          });

    let saved;
    try {
      if (existing) {
        saved = await prisma.companyDocument.update({
          where: { id: existing.id },
          data: {
            label,
            originalName: file.name,
            storedName,
            filePath,
            mimeType: checked.mime!,
            originalSize: originalSize ?? buffer.length,
            compressedSize: buffer.length,
            status: 'DIAJUKAN',
            uploadedById: ctx.userId,
            uploadedAt: new Date(),
            verifiedById: null,
            verifiedAt: null,
            verifyNote: null,
          },
        });
      } else {
        saved = await prisma.companyDocument.create({
          data: {
            organizationId: ctx.organizationId,
            docType,
            label,
            originalName: file.name,
            storedName,
            filePath,
            mimeType: checked.mime!,
            originalSize: originalSize ?? buffer.length,
            compressedSize: buffer.length,
            status: 'DIAJUKAN',
            uploadedById: ctx.userId,
          },
        });
      }
    } catch (e) {
      // Baris DB gagal: bersihkan file baru yang sudah tersimpan.
      await deletePerusahaanFile(filePath);
      throw e;
    }

    // Berhasil: baru sekarang hapus file lama (bila penggantian).
    if (existing) {
      await deletePerusahaanFile(existing.filePath);
    }

    // Kelengkapan bisa berubah karena dokumen wajib terpenuhi.
    const orgFresh = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: {
        name: true,
        phone: true,
        businessType: true,
        entityForm: true,
        industry: true,
        profileStatus: true,
        profileCompletedAt: true,
      },
    });
    const docs = await prisma.companyDocument.findMany({
      where: { organizationId: ctx.organizationId },
      select: { docType: true },
    });
    if (orgFresh) {
      const completeness = computeCompleteness(orgFresh, null, docs);
      const statusUpdate: { profileStatus: string; profileCompletedAt?: Date } = {
        profileStatus: completeness.status,
      };
      if (completeness.status === 'LENGKAP' && !orgFresh.profileCompletedAt) {
        statusUpdate.profileCompletedAt = new Date();
      }
      if (orgFresh.profileStatus !== completeness.status || statusUpdate.profileCompletedAt) {
        await prisma.organization.update({
          where: { id: ctx.organizationId },
          data: statusUpdate,
        });
      }
    }

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'PERUSAHAAN_UPLOAD_DOKUMEN',
      module: 'PERUSAHAAN',
      description: `${ctx.name} mengunggah dokumen ${def.label} (${file.name}, ${formatBytes(buffer.length)})${existing ? ' — menggantikan dokumen lama' : ''}`,
      ipAddress: getClientIp(req),
    });
    return apiOk(
      {
        id: saved.id,
        docType: saved.docType,
        label: saved.label,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
        originalSize: saved.originalSize,
        compressedSize: saved.compressedSize,
        status: saved.status,
        uploadedAt: saved.uploadedAt.toISOString(),
      },
      201
    );
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengunggah dokumen perusahaan.', 500);
  }
}
