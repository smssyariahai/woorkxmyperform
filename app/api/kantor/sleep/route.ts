// POST /api/kantor/sleep — ubah status "Tidur" Kantor Virtual kantor ini
// (Staff Residence Fase 5b — sesi per-agent di DB tenant).
//
// Dulu (Wave 11): satu boolean org-wide in-memory (lib/kantor/sleep.ts).
// Kini: tombol Tidur membuat/mengakhiri sesi istirahat MANUAL per agent
// (`setManualRest` di lib/kantor/rest.ts) — agent berjalan ke kasur
// assignment-nya di mess. Body opsional `{ sleeping: boolean }` — bila
// dikirim, nilai itu yang dipakai (tombol client mengirim kebalikan dari
// state snapshot, jadi klik ganda tidak membalik dua kali); bila tidak
// dikirim, nilai dibalik (toggle, dari state DB). Setelah diubah, event
// `kantor.sleep_changed` disiarkan lewat SSE ke semua client kantor ini,
// jadi semua layar berubah dalam ~1 dtk. Client yang baru membuka halaman
// mendapat nilai dari snapshot GET /api/kantor/office (`sleep`).
//
// Guard: auth + modul 'kantor' — TIDAK ada permission baru; tombol Tidur
// sudah bisa dipakai semua yang melihat kantor, dan ini hanya mengubah
// keadaan tampilan bersama (bukan data bisnis / bukan perintah agent).
import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { publishAgentEvent } from '@/lib/agents/events';
import { setManualRest } from '@/lib/kantor/rest';

export const dynamic = 'force-dynamic';

/** Client tenant — dipakai untuk model AgentRestSession (Fase 5b) yang
 *  tidak ada di skema legacy (pola yang sama dengan /api/kantor/office). */
const tprisma = prisma as unknown as TenantPrismaClient;

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');

    let wanted: boolean | undefined;
    try {
      const body: unknown = await req.json();
      const value = (body as { sleeping?: unknown } | null)?.sleeping;
      wanted = typeof value === 'boolean' ? value : undefined;
    } catch {
      // Body kosong / bukan JSON -> toggle.
      wanted = undefined;
    }

    const result = await setManualRest(tprisma, wanted);
    await publishAgentEvent(ctx.organizationId, 'kantor.sleep_changed', { sleeping: result.sleeping });
    return apiOk({
      sleeping: result.sleeping,
      started: result.started,
      ended: result.ended,
      startedCount: result.started.length,
      endedCount: result.ended.length,
    });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah status tidur.', 500);
  }
}
