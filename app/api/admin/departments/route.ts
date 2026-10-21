import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** GET /api/admin/departments — struktur divisi kantor. */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_VIEW', req);
    const items = await prisma.department.findMany({
      where: { organizationId: ctx.organizationId },
      include: { _count: { select: { memberships: true } } },
      orderBy: { name: 'asc' },
    });
    return apiOk(
      items.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        memberCount: d._count.memberships,
        createdAt: d.createdAt,
      }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat divisi.', 500);
  }
}

/** POST /api/admin/departments — buat divisi. Body: { name, description? } */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_MANAGE', req);
    const body = await req.json();
    const name = String(body?.name || '').trim();
    if (!name) return apiErr('Nama divisi wajib diisi.', 422);
    const dept = await prisma.department.create({
      data: {
        organizationId: ctx.organizationId,
        name,
        description: body?.description ? String(body.description).trim() : null,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_DEPARTMENT',
      module: 'DEPARTMENTS',
      description: `Membuat divisi "${name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk(dept, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if ((e as any)?.code === 'P2002') return apiErr('Divisi dengan nama tersebut sudah ada.', 409);
    return apiErr('Gagal membuat divisi.', 500);
  }
}
