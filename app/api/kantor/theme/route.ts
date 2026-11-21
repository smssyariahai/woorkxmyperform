// POST /api/kantor/theme — ubah tema scene (siang/malam) Kantor Virtual kantor ini
// (Wave 15 — sinkronisasi realtime).
//
// Tema scene adalah state BERSAMA per kantor (bukan preferensi per
// browser): satu nilai per org di server (lib/kantor/theme.ts, in-memory).
// Body opsional `{ theme: 'dark' | 'light' }` — bila dikirim dan valid,
// nilai itu yang dipakai (tombol client mengirim kebalikan dari state
// snapshot, jadi klik ganda tidak membalik dua kali); bila tidak dikirim
// atau tidak valid, nilai dibalik (toggle). Setelah diubah, event
// `kantor.theme_changed` disiarkan lewat SSE ke semua client kantor ini,
// jadi semua layar berubah dalam ~1 dtk. Client yang baru membuka halaman
// mendapat nilai dari snapshot GET /api/kantor/office (`theme`).
//
// Guard: auth + modul 'kantor' — TIDAK ada permission baru; tombol
// Siang/Malam sudah bisa dipakai semua yang melihat kantor, dan ini hanya
// mengubah keadaan tampilan bersama (bukan data bisnis / bukan perintah
// agent). Pola yang sama dengan POST /api/kantor/sleep (Wave 11).
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { publishAgentEvent } from '@/lib/agents/events';
import { setSceneTheme, toggleSceneTheme, type KantorSceneTheme } from '@/lib/kantor/theme';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');

    let theme: KantorSceneTheme;
    try {
      const body: unknown = await req.json();
      const wanted = (body as { theme?: unknown } | null)?.theme;
      theme =
        wanted === 'dark' || wanted === 'light'
          ? setSceneTheme(ctx.organizationId, wanted)
          : toggleSceneTheme(ctx.organizationId);
    } catch {
      // Body kosong / bukan JSON -> toggle.
      theme = toggleSceneTheme(ctx.organizationId);
    }

    await publishAgentEvent(ctx.organizationId, 'kantor.theme_changed', { theme });
    return apiOk({ theme });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah tema scene.', 500);
  }
}
