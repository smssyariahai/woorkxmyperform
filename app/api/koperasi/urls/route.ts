// GET/POST/PUT/DELETE /api/koperasi/urls — CRUD entri URL kirim JSON di
// dalam setting key 'kirim_json'. Porting POST/PUT/DELETE
// /api/pg/koperasi/urls backup (src/server/server.ts; validasi
// validUrlEntry + 409 untuk URL duplikat dipertahankan).
// GET terbuka untuk semua user login org (dibutuhkan modal kirim);
// tulis (POST/PUT/DELETE) admin-only (OWNER/ADMIN/isSuperAdmin).
// Bila entri yang dihapus adalah defaultUrlId, default dikosongkan.
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getKirimJsonSetting,
  isKoperasiAdmin,
  newKirimUrlId,
  saveKirimJsonSetting,
  validUrlEntry,
} from '@/lib/koperasi/server';

export const dynamic = 'force-dynamic';

/** GET /api/koperasi/urls — { urls, defaultUrlId } */
export async function GET(_req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'koperasi', 'READ');
    const setting = await getKirimJsonSetting(ctx.organizationId);
    return apiOk({ urls: setting.urls, defaultUrlId: setting.defaultUrlId });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar URL.', 500);
  }
}

/** POST /api/koperasi/urls — tambah { judul, url, deskripsi } */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'koperasi', 'WRITE');
    if (!isKoperasiAdmin(ctx)) {
      return apiErr('Hanya admin kantor yang dapat mengubah daftar URL.', 403);
    }
    const body = await req.json().catch(() => ({}));
    const parsed = validUrlEntry(body);
    if (typeof parsed === 'string') return apiErr(parsed, 400);
    const setting = await getKirimJsonSetting(ctx.organizationId);
    if (setting.urls.some((u) => u.url === parsed.url)) {
      return apiErr('URL sudah ada di daftar.', 409);
    }
    const next = [...setting.urls, { ...parsed, id: newKirimUrlId() }];
    await saveKirimJsonSetting(ctx.organizationId, { urls: next, defaultUrlId: setting.defaultUrlId });
    return apiOk({ urls: next, defaultUrlId: setting.defaultUrlId });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menambah URL.', 500);
  }
}

/** PUT /api/koperasi/urls?id= — ubah entri */
export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'koperasi', 'WRITE');
    if (!isKoperasiAdmin(ctx)) {
      return apiErr('Hanya admin kantor yang dapat mengubah daftar URL.', 403);
    }
    const id = new URL(req.url).searchParams.get('id') ?? '';
    const body = await req.json().catch(() => ({}));
    const parsed = validUrlEntry(body);
    if (typeof parsed === 'string') return apiErr(parsed, 400);
    const setting = await getKirimJsonSetting(ctx.organizationId);
    const idx = setting.urls.findIndex((u) => u.id === id);
    if (idx < 0) return apiErr('URL tidak ditemukan.', 404);
    if (setting.urls.some((u, i) => i !== idx && u.url === parsed.url)) {
      return apiErr('URL sudah ada di daftar.', 409);
    }
    const next = [...setting.urls];
    next[idx] = { ...parsed, id };
    await saveKirimJsonSetting(ctx.organizationId, { urls: next, defaultUrlId: setting.defaultUrlId });
    return apiOk({ urls: next, defaultUrlId: setting.defaultUrlId });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah URL.', 500);
  }
}

/** DELETE /api/koperasi/urls?id= — hapus entri (kosongkan default bila terhapus) */
export async function DELETE(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'koperasi', 'WRITE');
    if (!isKoperasiAdmin(ctx)) {
      return apiErr('Hanya admin kantor yang dapat menghapus URL.', 403);
    }
    const id = new URL(req.url).searchParams.get('id') ?? '';
    const setting = await getKirimJsonSetting(ctx.organizationId);
    if (!setting.urls.some((u) => u.id === id)) return apiErr('URL tidak ditemukan.', 404);
    const next = setting.urls.filter((u) => u.id !== id);
    const defaultUrlId = setting.defaultUrlId === id ? null : setting.defaultUrlId;
    await saveKirimJsonSetting(ctx.organizationId, { urls: next, defaultUrlId });
    return apiOk({ urls: next, defaultUrlId });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus URL.', 500);
  }
}
