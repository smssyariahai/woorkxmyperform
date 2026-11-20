// GET /api/earsip/documents/[id] — detail dokumen (cek kerahasiaan:
// CONFIDENTIAL + bukan manager = 404, supaya keberadaannya tidak bocor).
// PUT — edit metadata + arsipkan (status ACTIVE/ARCHIVED). Butuh EARSIP_MANAGE.
// DELETE — hapus dokumen + file fisiknya. Butuh EARSIP_MANAGE.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import {
  archiveDocumentInclude,
  canAccessConfidential,
  deleteEarsipFile,
  mapArchiveDocument,
  parseDocumentUpdate,
} from '@/lib/earsip/server';

export const dynamic = 'force-dynamic';

async function findDocument(ctx: { organizationId: string }, id: string, canConfidential: boolean) {
  const row = await prisma.archiveDocument.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: archiveDocumentInclude,
  });
  if (!row) return null;
  if (row.confidentiality === 'CONFIDENTIAL' && !canConfidential) return null;
  return row;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('EARSIP_VIEW', req);
    const canConfidential = await canAccessConfidential(ctx);
    const row = await findDocument(ctx, params.id, canConfidential);
    if (!row) return apiErr('Dokumen tidak ditemukan.', 404);
    return apiOk(mapArchiveDocument(row as never));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat dokumen arsip.', 500);
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('EARSIP_MANAGE', req);
    const canConfidential = await canAccessConfidential(ctx);
    const row = await findDocument(ctx, params.id, canConfidential);
    if (!row) return apiErr('Dokumen tidak ditemukan.', 404);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseDocumentUpdate(body);
    if (parsed.error) return apiErr(parsed.error, 400);
    const d = parsed.data!;
    if (d.categoryId !== undefined) {
      const category = await prisma.archiveCategory.findFirst({
        where: { id: d.categoryId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!category) return apiErr('Kategori tidak ditemukan.', 400);
    }
    const wasArchived = row.status === 'ARCHIVED';
    const updated = await prisma.archiveDocument.update({
      where: { id: row.id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.documentNumber !== undefined ? { documentNumber: d.documentNumber } : {}),
        ...(d.documentDate !== undefined ? { documentDate: d.documentDate } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.categoryId !== undefined ? { categoryId: d.categoryId } : {}),
        ...(d.confidentiality !== undefined ? { confidentiality: d.confidentiality } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
      },
      include: archiveDocumentInclude,
    });
    const archivedNow = d.status === 'ARCHIVED' && !wasArchived;
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: archivedNow ? 'ARCHIVE_EARSIP_DOCUMENT' : 'UPDATE_EARSIP_DOCUMENT',
      module: 'EARSIP',
      description: `${ctx.name} ${archivedNow ? 'mengarsipkan' : 'mengubah'} dokumen arsip "${updated.title}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk(mapArchiveDocument(updated as never));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah dokumen arsip.', 500);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('EARSIP_MANAGE', req);
    const canConfidential = await canAccessConfidential(ctx);
    const row = await findDocument(ctx, params.id, canConfidential);
    if (!row) return apiErr('Dokumen tidak ditemukan.', 404);
    await prisma.archiveDocument.delete({ where: { id: row.id } });
    await deleteEarsipFile(row.filePath);
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_EARSIP_DOCUMENT',
      module: 'EARSIP',
      description: `${ctx.name} menghapus dokumen arsip "${row.title}" (${row.fileName})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ deleted: true });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus dokumen arsip.', 500);
  }
}
