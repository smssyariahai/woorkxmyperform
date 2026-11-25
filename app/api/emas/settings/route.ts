import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { defaultSettingsData } from '@/lib/emas/defaultSettings';

export const dynamic = 'force-dynamic';

/** GET /api/emas/settings — tarif & pengaturan emas organisasi.
 *  Bentuk sama dengan backup GET /api/pg/gold/settings: { settings: {...} }.
 *  Kunci 'tarif_biaya' yang belum pernah disimpan memakai defaultSettingsData.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'READ');
    const rows = await prisma.goldSetting.findMany({
      where: { organizationId: ctx.organizationId },
    });
    const settings: Record<string, any> = { tarif_biaya: defaultSettingsData };
    for (const r of rows) settings[r.key] = r.value;
    return apiOk({ settings });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan emas.', 500);
  }
}

/** POST /api/emas/settings — simpan satu kunci pengaturan { key, value } (upsert). */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'WRITE');
    const b = await req.json().catch(() => ({}));
    const key = String(b.key || '').trim();
    if (!key) return apiErr('Key pengaturan wajib diisi.', 400);
    await prisma.goldSetting.upsert({
      where: { organizationId_key: { organizationId: ctx.organizationId, key } },
      create: { organizationId: ctx.organizationId, key, value: b.value ?? {} },
      update: { value: b.value ?? {} },
    });
    return apiOk({ success: true, key });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan emas.', 500);
  }
}
