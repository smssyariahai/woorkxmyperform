// GET/POST /api/koperasi/pengaturan — porting
// GET /api/pg/koperasi/pengaturan backup (src/server/server.ts) ke
// KoperasiSetting ('kirim_json' + 'cabang').
// Perbedaan vs backup: defaultUrlId disimpan di level organisasi dalam
// setting 'kirim_json' (backup menyimpannya per user di profile).
// GET terbuka untuk semua user login org; POST admin-only
// (OWNER/ADMIN/isSuperAdmin, pola isTalAdmin lib/tal/server.ts).
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getCabangList,
  getKirimJsonSetting,
  isKoperasiAdmin,
  normalizeKirimUrls,
  saveKoperasiSetting,
  saveKirimJsonSetting,
  validUrlEntry,
} from '@/lib/koperasi/server';

export const dynamic = 'force-dynamic';

/** GET /api/koperasi/pengaturan — { kirimJson: { urls, defaultUrlId }, cabang } */
export async function GET(_req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'koperasi', 'READ');
    const [kirimJson, cabang] = await Promise.all([
      getKirimJsonSetting(ctx.organizationId),
      getCabangList(ctx.organizationId),
    ]);
    return apiOk({ kirimJson, cabang });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan.', 500);
  }
}

/**
 * POST /api/koperasi/pengaturan — simpan kirimJson dan/atau cabang.
 * Body: { kirimJson?: { urls?: [{judul,url,deskripsi}], defaultUrlId?: string|null },
 *         cabang?: string[] }. Bagian yang tidak dikirim dipertahankan.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'koperasi', 'WRITE');
    if (!isKoperasiAdmin(ctx)) {
      return apiErr('Hanya admin kantor yang dapat mengubah pengaturan koperasi.', 403);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.kirimJson !== undefined) {
      const kj = (body.kirimJson ?? {}) as Record<string, unknown>;
      const current = await getKirimJsonSetting(ctx.organizationId);
      let urls = current.urls;
      if (kj.urls !== undefined) {
        if (!Array.isArray(kj.urls)) return apiErr('urls harus berupa array.', 400);
        const parsed: Array<{ judul: string; url: string; deskripsi: string }> = [];
        for (const entry of kj.urls as unknown[]) {
          const v = validUrlEntry(entry);
          if (typeof v === 'string') return apiErr(v, 400);
          parsed.push({ judul: v.judul, url: v.url, deskripsi: v.deskripsi });
        }
        urls = normalizeKirimUrls({ urls: parsed });
      }
      let defaultUrlId = current.defaultUrlId;
      if (kj.defaultUrlId !== undefined) {
        if (kj.defaultUrlId !== null && typeof kj.defaultUrlId !== 'string') {
          return apiErr('defaultUrlId tidak valid.', 400);
        }
        if (kj.defaultUrlId && !urls.some((u) => u.id === kj.defaultUrlId)) {
          return apiErr('URL default tidak ditemukan di daftar.', 400);
        }
        defaultUrlId = (kj.defaultUrlId as string | null) ?? null;
      }
      // Bila daftar URL berubah dan default lama tidak ada lagi, kosongkan.
      if (defaultUrlId && !urls.some((u) => u.id === defaultUrlId)) defaultUrlId = null;
      await saveKirimJsonSetting(ctx.organizationId, { urls, defaultUrlId });
    }

    if (body.cabang !== undefined) {
      if (
        !Array.isArray(body.cabang) ||
        !(body.cabang as unknown[]).every((c) => typeof c === 'string' && c.trim())
      ) {
        return apiErr('cabang harus berupa array string tidak kosong.', 400);
      }
      const cabang = (body.cabang as string[]).map((c) => c.trim());
      await saveKoperasiSetting(ctx.organizationId, 'cabang', { cabang });
    }

    const [kirimJson, cabang] = await Promise.all([
      getKirimJsonSetting(ctx.organizationId),
      getCabangList(ctx.organizationId),
    ]);
    return apiOk({ kirimJson, cabang });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan.', 500);
  }
}
