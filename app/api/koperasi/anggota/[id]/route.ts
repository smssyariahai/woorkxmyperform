// GET/PATCH/DELETE /api/koperasi/anggota/[id] — porting
// GET/PUT/DELETE /api/pg/koperasi/anggota/:id backup (src/server/server.ts).
// Semua org-scoped (404 bila bukan org sendiri). DELETE admin-only
// (OWNER/ADMIN/isSuperAdmin, pola isTalAdmin lib/tal/server.ts).
// Foto PATCH: data URL baru = ganti file, tidak ada field = pertahankan,
// string kosong = hapus foto.
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  applyAnggotaPhotos,
  deleteKoperasiPhotos,
  getCabangList,
  isKoperasiAdmin,
  mapAnggota,
  parseAnggotaInput,
} from '@/lib/koperasi/server';

export const dynamic = 'force-dynamic';

/** GET /api/koperasi/anggota/[id] — detail lengkap 1 anggota. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    const row = await prisma.koperasiAnggota.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!row) return apiErr('Anggota tidak ditemukan.', 404);
    return apiOk({ anggota: mapAnggota(row as any) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat detail anggota.', 500);
  }
}

/** PATCH /api/koperasi/anggota/[id] — update (NIK berubah dicek duplikat = 409). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    const existing = await prisma.koperasiAnggota.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!existing) return apiErr('Anggota tidak ditemukan.', 404);
    const body = await req.json().catch(() => ({}));
    const cabangList = await getCabangList(ctx.organizationId);
    const { data, error } = parseAnggotaInput(body, { isCreate: false, cabangList });
    if (error || !data) return apiErr(error ?? 'Data anggota tidak valid.', 400);

    if (data.data.nik && data.data.nik !== (existing as any).nik) {
      const dup = await prisma.koperasiAnggota.findFirst({
        where: {
          organizationId: ctx.organizationId,
          nik: data.data.nik as string,
          id: { not: params.id },
        },
        select: { id: true },
      });
      if (dup) return apiErr('NIK sudah terdaftar pada anggota lain.', 409);
    }

    const photoPatch = await applyAnggotaPhotos(params.id, data.photos);
    const updated = await prisma.koperasiAnggota.update({
      where: { id: params.id },
      data: { ...(data.data as Record<string, unknown>), ...photoPatch } as never,
    });
    return apiOk({ anggota: mapAnggota(updated as any) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e?.code === 'P2002') return apiErr('NIK sudah terdaftar pada anggota lain.', 409);
    return apiErr('Gagal mengubah anggota.', 500);
  }
}

/** DELETE /api/koperasi/anggota/[id] — admin-only; hapus baris + file foto. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    if (!isKoperasiAdmin(ctx)) {
      return apiErr('Hanya admin kantor yang dapat menghapus anggota.', 403);
    }
    const existing = await prisma.koperasiAnggota.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) return apiErr('Anggota tidak ditemukan.', 404);
    await prisma.koperasiAnggota.delete({ where: { id: params.id } });
    await deleteKoperasiPhotos(params.id).catch(() => {});
    return apiOk({ success: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus anggota.', 500);
  }
}
