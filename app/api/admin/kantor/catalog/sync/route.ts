// POST /api/admin/kantor/catalog/sync — jalankan importer katalog dari repo
// agency-agents ke master DB. Super Admin ONLY (bukan permission platform —
// sinkronisasi katalog adalah operasi platform global).
// Meng-clone ulang repo tiap sync (clone /tmp dihapus setelah import);
// durasi bisa ~1 menit untuk ~300 template.
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { CATALOG_ATTRIBUTION, syncAgentCatalog } from '@/lib/kantor/catalog-importer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  try {
    const ctx = await requireAuth({ tenantContext: false });
    if (!ctx.isSuperAdmin) return apiErr('Hanya Super Admin yang bisa sinkronisasi katalog.', 403);
    const result = await syncAgentCatalog();
    return apiOk({ ...result, attribution: CATALOG_ATTRIBUTION });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal sinkronisasi katalog.', 500);
  }
}
