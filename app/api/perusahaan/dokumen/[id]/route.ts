// DELETE /api/perusahaan/dokumen/[id] — hapus dokumen + file fisiknya.
// Hanya PERUSAHAAN_MANAGE. Baris DB dihapus dulu, file dihapus best-effort.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { deletePerusahaanFile } from '@/lib/perusahaan/server';
import { findDocType } from '@/lib/perusahaan/constants';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('PERUSAHAAN_MANAGE', req);
    // CompanyDocument TIDAK punya relasi `organization` di tenant client —
    // businessType org diambil terpisah (dipakai `findDocType` di bawah).
    const doc = await prisma.companyDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!doc) return apiErr('Dokumen tidak ditemukan.', 404);
    const docOrg = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { businessType: true },
    });

    await prisma.companyDocument.delete({ where: { id: doc.id } });
    await deletePerusahaanFile(doc.filePath);

    const def = findDocType(docOrg?.businessType ?? null, doc.docType);
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'PERUSAHAAN_HAPUS_DOKUMEN',
      module: 'PERUSAHAAN',
      description: `${ctx.name} menghapus dokumen ${def?.label ?? doc.docType} (${doc.originalName})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ removed: doc.id });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus dokumen.', 500);
  }
}
