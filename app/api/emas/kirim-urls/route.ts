import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Bentuk satu URL — sama dengan backup /api/pg/kirim/urls. */
function mapUrl(r: any) {
  return {
    id: r.id as string,
    judul: r.judul as string,
    url: r.url as string,
    deskripsi: (r.deskripsi || '') as string,
  };
}

async function listUrls(organizationId: string, scope: string) {
  const rows = await prisma.kirimUrl.findMany({
    where: { organizationId, scope },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(mapUrl);
}

/** GET /api/emas/kirim-urls?scope=simulasi — daftar URL tujuan kirim JSON.
 *  canManage: true untuk semua pengguna modul Emas (akses modul adalah gerbangnya;
 *  di backup hanya admin / akses tulis gadai-PKE — disederhanakan karena WOORK
 *  tidak punya permission per-submodul emas).
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'READ');
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') || 'simulasi';
    const urls = await listUrls(ctx.organizationId, scope);
    return apiOk({ urls, canManage: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar URL.', 500);
  }
}

/** POST /api/emas/kirim-urls — tambah URL { scope, judul, url, deskripsi? }. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'WRITE');
    const b = await req.json().catch(() => ({}));
    const scope = String(b.scope || 'simulasi');
    const judul = String(b.judul || '').trim();
    const url = String(b.url || '').trim();
    if (!judul || !url) return apiErr('Judul dan URL wajib diisi.', 400);
    await prisma.kirimUrl.create({
      data: {
        organizationId: ctx.organizationId,
        scope,
        judul,
        url,
        deskripsi: String(b.deskripsi || '').trim() || null,
      },
    });
    return apiOk({ urls: await listUrls(ctx.organizationId, scope) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambah URL.', 500);
  }
}

/** PUT /api/emas/kirim-urls — ubah URL { scope, id, judul, url, deskripsi? }. */
export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'WRITE');
    const b = await req.json().catch(() => ({}));
    const scope = String(b.scope || 'simulasi');
    const judul = String(b.judul || '').trim();
    const url = String(b.url || '').trim();
    if (!b.id || !judul || !url) return apiErr('Data URL tidak lengkap.', 400);
    const row = await prisma.kirimUrl.findFirst({
      where: { id: String(b.id), organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!row) return apiErr('URL tidak ditemukan.', 404);
    await prisma.kirimUrl.update({
      where: { id: row.id },
      data: { judul, url, deskripsi: String(b.deskripsi || '').trim() || null },
    });
    return apiOk({ urls: await listUrls(ctx.organizationId, scope) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah URL.', 500);
  }
}

/** DELETE /api/emas/kirim-urls?scope=simulasi&id=... — hapus URL. */
export async function DELETE(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'WRITE');
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') || 'simulasi';
    const id = searchParams.get('id') || '';
    if (!id) return apiErr('ID URL wajib diisi.', 400);
    await prisma.kirimUrl.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });
    return apiOk({ urls: await listUrls(ctx.organizationId, scope) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus URL.', 500);
  }
}
