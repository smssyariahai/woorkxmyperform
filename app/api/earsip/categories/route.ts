// GET /api/earsip/categories — daftar kategori arsip kantor (+ jumlah
// dokumen & subkategori). POST — buat kategori/subkategori baru.
// Tulis kategori butuh EARSIP_MANAGE; baca butuh EARSIP_VIEW.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import {
  archiveCategoryInclude,
  mapArchiveCategory,
  parseCategoryInput,
  userCanManageEarsip,
} from '@/lib/earsip/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('EARSIP_VIEW', req);
    const canManage = await userCanManageEarsip(ctx);
    const rows = await prisma.archiveCategory.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      include: archiveCategoryInclude,
    });
    return apiOk({ categories: rows.map((r) => mapArchiveCategory(r as never)), canManage });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat kategori arsip.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('EARSIP_MANAGE', req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseCategoryInput(body);
    if (parsed.error) return apiErr(parsed.error, 400);
    const d = parsed.data!;
    if (d.parentId) {
      const parent = await prisma.archiveCategory.findFirst({
        where: { id: d.parentId, organizationId: ctx.organizationId },
        select: { id: true, name: true },
      });
      if (!parent) return apiErr('Kategori induk tidak ditemukan.', 400);
    }
    const saved = await prisma.archiveCategory.create({
      data: {
        organizationId: ctx.organizationId,
        name: d.name,
        description: d.description,
        parentId: d.parentId,
        createdById: ctx.userId,
      },
      include: archiveCategoryInclude,
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_EARSIP_CATEGORY',
      module: 'EARSIP',
      description: `${ctx.name} membuat kategori arsip "${d.name}"${d.parentId ? ' (subkategori)' : ''}`,
      ipAddress: getClientIp(req),
    });
    return apiOk(mapArchiveCategory(saved as never), 201);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat kategori arsip.', 500);
  }
}
