/**
 * Tema scene Kantor Virtual — state bersama PER KANTOR (per org),
 * disimpan in-memory di server (Wave 15 — sinkronisasi realtime).
 *
 * Dulu tema siang/malam disimpan di localStorage per browser
 * (`woork.kantorSceneTheme` di Office3D), sehingga satu user bisa
 * mengubah ke malam sementara user lain di kantor yang sama tetap
 * melihat siang. Sekarang satu nilai per org, dibaca semua client dari
 * snapshot GET /api/kantor/office dan diubah lewat POST /api/kantor/theme
 * yang menyiarkan event `kantor.theme_changed` lewat SSE — persis pola
 * status Tidur (lib/kantor/sleep.ts, Wave 11).
 *
 * Batasan yang disadari: in-memory = kembali "siang" ('light') saat
 * proses `next start` restart / VM ke-reset. Itu wajar untuk state
 * tampilan sementara — konsisten dengan broker SSE in-process Wave 10
 * yang juga hidup di satu proses dan dengan state Tidur. Bila user nanti
 * minta tema bertahan melewati restart, pindahkan ke tabel (migrasi baru)
 * — jangan ke SystemSetting (itu konfigurasi global, bukan per-org).
 */

export type KantorSceneTheme = 'dark' | 'light';

const themeByOrg = new Map<string, KantorSceneTheme>();

/** Tema scene kantor (org) ini. Default: siang ('light'). */
export function getSceneTheme(organizationId: string): KantorSceneTheme {
  return themeByOrg.get(organizationId) ?? 'light';
}

/** Set eksplisit (dipakai endpoint bila client mengirim nilai). */
export function setSceneTheme(organizationId: string, theme: KantorSceneTheme): KantorSceneTheme {
  themeByOrg.set(organizationId, theme);
  return theme;
}

/** Balik nilai saat ini (dipakai endpoint bila client tidak mengirim nilai). */
export function toggleSceneTheme(organizationId: string): KantorSceneTheme {
  return setSceneTheme(organizationId, getSceneTheme(organizationId) === 'dark' ? 'light' : 'dark');
}
