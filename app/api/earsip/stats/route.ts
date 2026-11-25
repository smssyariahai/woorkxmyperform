// GET /api/earsip/stats — ringkasan dashboard E-Arsip: total dokumen,
// total kategori, dokumen terbaru (5), total upload + total ukuran file.
// Menghormati aturan kerahasiaan: non-manager tidak melihat dokumen
// CONFIDENTIAL dalam hitungan maupun daftar terbaru.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  archiveDocumentInclude,
  canAccessConfidential,
  confidentialWhere,
  hydrateArchiveDocuments,
  mapArchiveDocument,
} from '@/lib/earsip/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('EARSIP_VIEW', req);
    const canConfidential = await canAccessConfidential(ctx);
    const conf = confidentialWhere(canConfidential);
    const [totalDocuments, totalCategories, latest, sizeAgg] = await Promise.all([
      prisma.archiveDocument.count({ where: { organizationId: ctx.organizationId, ...conf } }),
      prisma.archiveCategory.count({ where: { organizationId: ctx.organizationId } }),
      prisma.archiveDocument.findMany({
        where: { organizationId: ctx.organizationId, ...conf },
        orderBy: { uploadedAt: 'desc' },
        take: 5,
        include: archiveDocumentInclude,
      }),
      prisma.archiveDocument.aggregate({
        where: { organizationId: ctx.organizationId, ...conf },
        _sum: { fileSize: true },
      }),
    ]);
    return apiOk({
      totalDocuments,
      totalCategories,
      totalUploads: totalDocuments,
      totalSizeBytes: sizeAgg._sum.fileSize ?? 0,
      latestDocuments: (await hydrateArchiveDocuments(latest)).map((r) => mapArchiveDocument(r as never)),
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat statistik arsip.', 500);
  }
}
