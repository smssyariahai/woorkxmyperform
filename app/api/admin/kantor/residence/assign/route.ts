// POST /api/admin/kantor/residence/assign — pindahkan agent ke kasur
// (Fase 5a, dipakai Fase 7 — Staff Residence Management).
// Guard: auth + modul 'kantor' + hanya OWNER / ADMIN kantor atau Super Admin
// (pola yang sama dengan POST /api/kantor/agents dan catalog install).
// Body: { agentId, bedId }.
// Aturan (desain §1): satu agent ↔ satu bed aktif — pindah = UPDATE baris
// assignment agent itu (bukan insert baru); kasur yang sudah ditempati
// agent lain -> 409; kasur MAINTENANCE -> 409; agent sudah di kasur itu ->
// 200 idempotent. Logika di lib/kantor/residence-admin.ts (assignAgentToBed)
// supaya bisa diuji langsung oleh scripts/verify-fase5-rest.ts.
import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { canManageAgents } from '@/lib/agents/manage';
import { ResidenceAdminError, assignAgentToBed } from '@/lib/kantor/residence-admin';

export const dynamic = 'force-dynamic';

/** Client tenant — dipakai untuk model Residence (Fase 5a) yang tidak ada
 *  di skema legacy (pola yang sama dengan catalog install). */
const tprisma = prisma as unknown as TenantPrismaClient;

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    if (!canManageAgents(ctx)) {
      return apiErr('Hanya OWNER / ADMIN kantor yang boleh memindahkan agent ke kasur.', 403);
    }

    const body = await req.json().catch(() => null);
    const agentId = typeof body?.agentId === 'string' ? body.agentId.trim() : '';
    const bedId = typeof body?.bedId === 'string' ? body.bedId.trim() : '';
    if (!agentId || !bedId) {
      return apiErr('agentId dan bedId wajib diisi.', 422);
    }

    const result = await assignAgentToBed(tprisma, ctx.organizationId, agentId, bedId);
    return apiOk(result);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof ResidenceAdminError) return apiErr(e.message, e.status);
    // Race penempatan ganda (unique agentId/bedId) -> 409 yang jelas.
    if (e?.code === 'P2002') {
      return apiErr('Penempatan bertabrakan: agent atau kasur sudah terisi.', 409);
    }
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal memindahkan agent.', 500);
  }
}
