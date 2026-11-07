import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { isCustomFieldType } from '@/lib/user-profile';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/users/custom-fields/:id — ubah definisi field custom.
 * Body: label?, type?, options?, required? — mengubah type/options tidak
 * mengubah nilai yang sudah tersimpan (nilai lama tetap tampil apa adanya).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('USERS_UPDATE', req);
    const def = await prisma.userCustomFieldDef.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!def) return apiErr('Field tidak ditemukan.', 404);
    const body = await req.json();
    const data: any = {};
    if (body?.label !== undefined) {
      const label = String(body.label).trim();
      if (!label) return apiErr('Nama field tidak boleh kosong.', 422);
      data.label = label;
    }
    if (body?.type !== undefined) {
      const type = String(body.type);
      if (!isCustomFieldType(type)) return apiErr('Jenis field tidak dikenal.', 422);
      data.type = type;
      if (type === 'SELECT') {
        const arr = Array.isArray(body?.options) ? body.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
        if (arr.length < 2) return apiErr('Pilihan (dropdown) butuh minimal 2 pilihan.', 422);
        data.options = JSON.stringify(arr);
      } else {
        data.options = null;
      }
    }
    if (body?.options !== undefined && (body?.type === 'SELECT' || def.type === 'SELECT')) {
      const arr = Array.isArray(body.options) ? body.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
      if (arr.length < 2) return apiErr('Pilihan (dropdown) butuh minimal 2 pilihan.', 422);
      data.options = JSON.stringify(arr);
    }
    if (body?.required !== undefined) data.required = body.required === true;
    const updated = await prisma.userCustomFieldDef.update({ where: { id: def.id }, data });
    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah field tambahan.', 500);
  }
}

/** DELETE /api/admin/users/custom-fields/:id — hapus definisi + semua nilainya. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('USERS_UPDATE', req);
    const def = await prisma.userCustomFieldDef.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!def) return apiErr('Field tidak ditemukan.', 404);
    await prisma.userCustomFieldDef.delete({ where: { id: def.id } });
    return apiOk({ id: def.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus field tambahan.', 500);
  }
}
