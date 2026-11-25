// POST /api/admin/kantor/residence/activate — aktifkan mess untuk tenant
// ini (Fase 7). Membuat 1 Residence kosong (0 kamar). JANGAN seed kamar /
// kasur otomatis — geometri kamar milik WOORK.ID, bukan template umum
// (desain FASE7 §1). Residence sudah ada -> 409.
// Guard: auth + modul 'kantor' + hanya OWNER / ADMIN kantor atau Super Admin
// (pola yang sama dengan POST /api/admin/kantor/residence/assign).
import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { canManageAgents } from '@/lib/agents/manage';
import { apiOk, apiErr } from '@/lib/utils';
import { ResidenceAdminError, activateResidence } from '@/lib/kantor/residence-admin';

export const dynamic = 'force-dynamic';

const tprisma = prisma as unknown as TenantPrismaClient;

export async function POST() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengaktifkan mess.', 403);
    }
    const residence = await activateResidence(tprisma);
    return apiOk({ residence });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof ResidenceAdminError) return apiErr(e.message, e.status);
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal mengaktifkan mess.', 500);
  }
}
