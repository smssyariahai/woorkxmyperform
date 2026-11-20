// PUT /api/earsip/categories/[id] — ubah kategori (nama/deskripsi/induk).
// Menolak siklus (induk baru tidak boleh turunan dari kategori ini sendiri).
// DELETE — hapus kategori HANYA bila tidak ada dokumen terkait dan tidak
// ada subkategori; bila ada, kembalikan error yang jelas (bukan 500).
// Keduanya butuh EARSIP_MANAGE.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import {
  archiveCategoryInclude,
  isCategoryDescendant,
  mapArchiveCategory,
  parseCategoryUpdate,
} from '@/lib/earsip/server';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('EARSIP_MANAGE', req);
    const row = await prisma.archiveCategory.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, name: true },
    });
    if (!row) return apiErr('Kategori tidak ditemukan.', 404);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseCategoryUpdate(body);
    if (parsed.error) return apiErr(parsed.error, 400);
    const d = parsed.data!;
    if (d.hasParent && d.parentId) {
      if (d.parentId === row.id) return apiErr('Kategori tidak bisa menjadi induk dirinya sendiri.', 400);
      const parent = await prisma.archiveCategory.findFirst({
        where: { id: d.parentId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!parent) return apiErr('Kategori induk tidak ditemukan.', 400);
      // Induk baru tidak boleh turunan kategori ini (mencegah siklus).
      if (await isCategoryDescendant(ctx.organizationId, d.parentId, row.id)) {
        return apiErr('Kategori induk tidak boleh turunan dari kategori ini.', 400);
      }
    }
    const updated = await prisma.archiveCategory.update({
      where: { id: row.id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.hasParent ? { parentId: d.parentId } : {}),
      },
      include: archiveCategoryInclude,
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_EARSIP_CATEGORY',
      module: 'EARSIP',
      description: `${ctx.name} mengubah kategori arsip "${updated.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk(mapArchiveCategory(updated as never));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah kategori arsip.', 500);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('EARSIP_MANAGE', req);
    const row = await prisma.archiveCategory.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { _count: { select: { documents: true, children: true } } },
    });
    if (!row) return apiErr('Kategori tidak ditemukan.', 404);
    if (row._count.documents > 0) {
      return apiErr(
        `Kategori "${row.name}" tidak bisa dihapus karena masih memiliki ${row._count.documents} dokumen. Pindahkan atau hapus dulu dokumennya.`,
        409
      );
    }
    if (row._count.children > 0) {
      return apiErr(
        `Kategori "${row.name}" tidak bisa dihapus karena masih memiliki ${row._count.children} subkategori. Hapus atau pindahkan dulu subkategorinya.`,
        409
      );
    }
    await prisma.archiveCategory.delete({ where: { id: row.id } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_EARSIP_CATEGORY',
      module: 'EARSIP',
      description: `${ctx.name} menghapus kategori arsip "${row.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ deleted: true });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus kategori arsip.', 500);
  }
}
