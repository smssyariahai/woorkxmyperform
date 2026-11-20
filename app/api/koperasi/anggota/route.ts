// GET /api/koperasi/anggota — daftar anggota org (porting
// GET /api/pg/koperasi/anggota backup, src/server/server.ts) + paginasi
// dan filter cabang (tambahan WOORK). POST — buat anggota (porting
// POST /api/pg/koperasi/anggota; validasi koperasiValidate backup
// diperlonggar sesuai kontrak Gelombang 5; foto disimpan sebagai file
// di uploads/koperasi/, bukan data URL di DB).
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  applyAnggotaPhotos,
  deleteKoperasiPhotos,
  getCabangList,
  mapAnggota,
  parseAnggotaInput,
} from '@/lib/koperasi/server';

export const dynamic = 'force-dynamic';

/** GET /api/koperasi/anggota?search=&cabang=&page=&pageSize= — semua user login org boleh baca. */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const q = new URL(req.url).searchParams;
    const search = (q.get('search') ?? '').trim() || undefined;
    const cabang = (q.get('cabang') ?? '').trim() || undefined;
    const pageRaw = Number(q.get('page') ?? 1);
    const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
    const pageSizeRaw = Number(q.get('pageSize') ?? 20);
    const pageSize = Number.isFinite(pageSizeRaw)
      ? Math.min(Math.max(pageSizeRaw, 1), 100)
      : 20;
    const where: Record<string, unknown> = { organizationId: ctx.organizationId };
    if (cabang) where.cabang = cabang;
    if (search) {
      where.OR = [
        { namaLengkap: { contains: search, mode: 'insensitive' } },
        { nik: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.koperasiAnggota.count({ where: where as never }),
      prisma.koperasiAnggota.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return apiOk({
      anggota: rows.map((r: any) => mapAnggota(r)),
      total,
      page,
      pageSize,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar anggota.', 500);
  }
}

/** POST /api/koperasi/anggota — buat anggota baru (NIK duplikat dalam org = 409). */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const cabangList = await getCabangList(ctx.organizationId);
    const { data, error } = parseAnggotaInput(body, { isCreate: true, cabangList });
    if (error || !data) return apiErr(error ?? 'Data anggota tidak valid.', 400);

    const dup = await prisma.koperasiAnggota.findFirst({
      where: { organizationId: ctx.organizationId, nik: data.data.nik as string },
      select: { id: true },
    });
    if (dup) return apiErr('NIK sudah terdaftar sebagai anggota.', 409);

    // Baris dibuat dulu (nama file foto butuh anggotaId), lalu foto ditulis.
    const created = await prisma.koperasiAnggota.create({
      data: {
        ...(data.data as Record<string, unknown>),
        organizationId: ctx.organizationId,
        createdBy: ctx.userId,
        fotoKtpPath: '',
        fotoAnggotaPath: '',
        tandaTanganPath: '',
      } as never,
    });
    try {
      const patch = await applyAnggotaPhotos(created.id, data.photos);
      const saved =
        Object.keys(patch).length > 0
          ? await prisma.koperasiAnggota.update({
              where: { id: created.id },
              data: patch as never,
            })
          : created;
      return apiOk({ anggota: mapAnggota(saved as any) }, 201);
    } catch (e) {
      // Foto gagal ditulis: batalkan pembuatan agar tidak ada baris yatim.
      await prisma.koperasiAnggota.delete({ where: { id: created.id } }).catch(() => {});
      await deleteKoperasiPhotos(created.id).catch(() => {});
      throw e;
    }
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e?.code === 'P2002') return apiErr('NIK sudah terdaftar sebagai anggota.', 409);
    return apiErr('Gagal menyimpan anggota.', 500);
  }
}
