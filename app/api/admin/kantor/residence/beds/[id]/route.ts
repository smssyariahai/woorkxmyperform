// PATCH /api/admin/kantor/residence/beds/[id] — ubah status kasur (Fase 7).
// Body: { status } — AVAILABLE atau MAINTENANCE. MAINTENANCE hanya bila
// kasur kosong (berpenghuni -> 409, agent harus dipindah dulu).
// Guard: auth + modul 'kantor' + hanya OWNER / ADMIN kantor atau Super Admin
// (pola yang sama dengan POST /api/admin/kantor/residence/assign).
import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { canManageAgents } from '@/lib/agents/manage';
import { apiOk, apiErr } from '@/lib/utils';
import { ResidenceAdminError, setResidenceBedStatus } from '@/lib/kantor/residence-admin';

export const dynamic = 'force-dynamic';

const tprisma = prisma as unknown as TenantPrismaClient;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh mengubah status kasur.', 403);
    }
    const body = await req.json().catch(() => null);
    const bed = await setResidenceBedStatus(tprisma, params.id, body?.status);
    return apiOk({ bed });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof ResidenceAdminError) return apiErr(e.message, e.status);
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal mengubah status kasur.', 500);
  }
}
