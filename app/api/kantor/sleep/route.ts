// POST /api/kantor/sleep — ubah status "Tidur" Kantor Virtual kantor ini
// (Wave 11 — sinkronisasi realtime).
//
// Status tidur adalah state BERSAMA per kantor (bukan preferensi per
// browser): satu nilai per org di server (lib/kantor/sleep.ts, in-memory).
// Body opsional `{ sleeping: boolean }` — bila dikirim, nilai itu yang
// dipakai (tombol client mengirim kebalikan dari state snapshot, jadi
// klik ganda tidak membalik dua kali); bila tidak dikirim, nilai dibalik
// (toggle). Setelah diubah, event `kantor.sleep_changed` disiarkan lewat
// SSE ke semua client kantor ini, jadi semua layar berubah dalam ~1 dtk.
// Client yang baru membuka halaman mendapat nilai dari snapshot
// GET /api/kantor/office (`sleep`).
//
// Guard: auth + modul 'kantor' — TIDAK ada permission baru; tombol Tidur
// sudah bisa dipakai semua yang melihat kantor, dan ini hanya mengubah
// keadaan tampilan bersama (bukan data bisnis / bukan perintah agent).
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { publishAgentEvent } from '@/lib/agents/events';
import { isSleeping, setSleeping, toggleSleeping } from '@/lib/kantor/sleep';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');

    let sleeping: boolean;
    try {
      const body: unknown = await req.json();
      const wanted = (body as { sleeping?: unknown } | null)?.sleeping;
      sleeping = typeof wanted === 'boolean' ? setSleeping(ctx.organizationId, wanted) : toggleSleeping(ctx.organizationId);
    } catch {
      // Body kosong / bukan JSON -> toggle.
      sleeping = toggleSleeping(ctx.organizationId);
    }

    await publishAgentEvent(ctx.organizationId, 'kantor.sleep_changed', { sleeping });
    return apiOk({ sleeping });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah status tidur.', 500);
  }
}
