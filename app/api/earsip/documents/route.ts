// GET /api/earsip/documents — daftar dokumen arsip kantor
// (pencarian q, filter categoryId / tanggal dokumen from-to / uploaderId /
// status, pagination page/limit). POST — upload dokumen baru (multipart).
//
// CATATAN: kunci EARSIP_* sudah terdaftar di lib/permissions.ts
// (integrasi 2026-11-19). Sampai sync-rbac + INSERT role custom dijalankan
// saat deploy, endpoint ini 403 untuk user non-Super Admin
// (deny by default) — Super Admin lolos lewat bypass existing.
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import {
  archiveCategoryInclude,
  archiveDocumentInclude,
  canAccessConfidential,
  confidentialWhere,
  formatFileSize,
  hydrateArchiveCategories,
  hydrateArchiveDocuments,
  listEarsipUploaders,
  mapArchiveCategory,
  mapArchiveDocument,
  saveEarsipFile,
  deleteEarsipFile,
  userCanManageEarsip,
  validateEarsipFile,
  EARSIP_CONFIDENTIALITIES,
  EARSIP_STATUSES,
} from '@/lib/earsip/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('EARSIP_VIEW', req);
    const canConfidential = await canAccessConfidential(ctx);
    const canManage = await userCanManageEarsip(ctx);
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const categoryId = url.searchParams.get('categoryId') || undefined;
    const uploaderId = url.searchParams.get('uploaderId') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const from = url.searchParams.get('from') || undefined;
    const to = url.searchParams.get('to') || undefined;
    const pageRaw = Number(url.searchParams.get('page') || 1);
    const limitRaw = Number(url.searchParams.get('limit') || 20);
    const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

    const where: Record<string, unknown> = {
      organizationId: ctx.organizationId,
      ...confidentialWhere(canConfidential),
    };
    if (categoryId) where.categoryId = categoryId;
    if (uploaderId) where.uploaderId = uploaderId;
    if (status && (EARSIP_STATUSES as readonly string[]).includes(status)) where.status = status;
    if (from || to) {
      const range: Record<string, unknown> = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) range.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          range.lte = d;
        }
      }
      // Filter memakai tanggal dokumen (documentDate).
      if (Object.keys(range).length > 0) where.documentDate = range;
    }
    if (q) {
      (where as Record<string, unknown>).AND = [
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { documentNumber: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [rows, total, categories, uploaders] = await Promise.all([
      prisma.archiveDocument.findMany({
        where: where as never,
        orderBy: { uploadedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: archiveDocumentInclude,
      }),
      prisma.archiveDocument.count({ where: where as never }),
      prisma.archiveCategory.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { name: 'asc' },
        include: archiveCategoryInclude,
      }),
      listEarsipUploaders(ctx.organizationId),
    ]);
    const [hydratedRows, hydratedCategories] = await Promise.all([
      hydrateArchiveDocuments(rows),
      hydrateArchiveCategories(categories),
    ]);
    return apiOk({
      documents: hydratedRows.map((r) => mapArchiveDocument(r as never)),
      categories: hydratedCategories.map((c) => mapArchiveCategory(c as never)),
      uploaders,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      canManage,
      canAccessConfidential: canConfidential,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat dokumen arsip.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('EARSIP_CREATE', req);
    const form = await req.formData();
    const title = String(form.get('title') ?? '').trim();
    if (!title) return apiErr('Judul dokumen wajib diisi.', 400);
    if (title.length > 200) return apiErr('Judul dokumen maksimal 200 karakter.', 400);
    const categoryId = String(form.get('categoryId') ?? '').trim();
    if (!categoryId) return apiErr('Kategori wajib dipilih.', 400);
    const category = await prisma.archiveCategory.findFirst({
      where: { id: categoryId, organizationId: ctx.organizationId },
      select: { id: true, name: true },
    });
    if (!category) return apiErr('Kategori tidak ditemukan.', 400);
    const documentNumber = String(form.get('documentNumber') ?? '').trim();
    if (documentNumber.length > 100) return apiErr('Nomor dokumen maksimal 100 karakter.', 400);
    const documentDateRaw = String(form.get('documentDate') ?? '').trim();
    let documentDate: Date | null = null;
    if (documentDateRaw) {
      documentDate = new Date(documentDateRaw);
      if (Number.isNaN(documentDate.getTime())) return apiErr('Tanggal dokumen tidak valid.', 400);
    }
    const description = String(form.get('description') ?? '').trim();
    if (description.length > 2000) return apiErr('Deskripsi maksimal 2000 karakter.', 400);
    const confidentiality = String(form.get('confidentiality') ?? 'INTERNAL');
    if (!(EARSIP_CONFIDENTIALITIES as readonly string[]).includes(confidentiality)) {
      return apiErr('Tingkat kerahasiaan tidak dikenal.', 400);
    }
    // Hanya pemegang EARSIP_MANAGE (atau Super Admin) boleh mengunggah
    // dokumen CONFIDENTIAL — selain itu tolak di sini, jangan tunggu baca.
    if (confidentiality === 'CONFIDENTIAL' && !(await canAccessConfidential(ctx))) {
      return apiErr('Hanya pemegang EARSIP_MANAGE yang boleh mengunggah dokumen rahasia.', 403);
    }
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return apiErr('Tidak ada file yang diunggah.', 422);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const checked = validateEarsipFile(file, buffer);
    if (checked.error) return apiErr(checked.error, 422);

    // Simpan file dulu (nama dibuat server-side), lalu buat baris dokumen.
    // Bila pembuatan baris gagal, file yang sudah tersimpan dibersihkan.
    const fileToken = randomUUID();
    const filePath = await saveEarsipFile(ctx.organizationId, fileToken, buffer, checked.ext!);
    let saved;
    try {
      saved = await prisma.archiveDocument.create({
        data: {
          organizationId: ctx.organizationId,
          categoryId: category.id,
          title,
          documentNumber: documentNumber || null,
          documentDate,
          description: description || null,
          filePath,
          fileName: file.name,
          fileSize: buffer.length,
          mimeType: checked.mime!,
          uploaderId: ctx.userId,
          confidentiality,
        },
        include: archiveDocumentInclude,
      });
    } catch (e) {
      await deleteEarsipFile(filePath);
      throw e;
    }
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_EARSIP_DOCUMENT',
      module: 'EARSIP',
      description: `${ctx.name} mengunggah dokumen arsip "${title}" (kategori ${category.name}, ${file.name}, ${formatFileSize(buffer.length)})`,
      ipAddress: getClientIp(req),
    });
    const [hydrated] = await hydrateArchiveDocuments([saved]);
    return apiOk(mapArchiveDocument(hydrated as never), 201);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengunggah dokumen arsip.', 500);
  }
}
