import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { isCustomFieldType, parseFieldOptions } from '@/lib/user-profile';

export const dynamic = 'force-dynamic';

/** GET /api/admin/users/custom-fields — daftar definisi field custom kantor. */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('USERS_VIEW', req);
    const defs = await prisma.userCustomFieldDef.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { sortOrder: 'asc' },
    });
    return apiOk(defs);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat field tambahan.', 500);
  }
}

/**
 * POST /api/admin/users/custom-fields — tambah definisi field custom.
 * Body: label, type, options? (array string, untuk SELECT), required?
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('USERS_UPDATE', req);
    const body = await req.json();
    const label = String(body?.label || '').trim();
    if (!label) return apiErr('Nama field wajib diisi.', 422);
    const type = String(body?.type || '');
    if (!isCustomFieldType(type)) return apiErr('Jenis field tidak dikenal.', 422);
    let options: string | null = null;
    if (type === 'SELECT') {
      const arr = Array.isArray(body?.options) ? body.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
      if (arr.length < 2) return apiErr('Pilihan (dropdown) butuh minimal 2 pilihan.', 422);
      options = JSON.stringify(arr);
    }
    const count = await prisma.userCustomFieldDef.count({ where: { organizationId: ctx.organizationId } });
    const def = await prisma.userCustomFieldDef.create({
      data: {
        organizationId: ctx.organizationId,
        label,
        type,
        options,
        required: body?.required === true,
        sortOrder: count,
      },
    });
    return apiOk(def, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambah field tambahan.', 500);
  }
}
