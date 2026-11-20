/**
 * Status "Tidur" Kantor Virtual — state bersama PER KANTOR (per org),
 * disimpan in-memory di server (Wave 11 — sinkronisasi realtime).
 *
 * Dulu status tidur disimpan di localStorage per browser
 * (`woork.kantorSleep` di Office3D), sehingga satu user bisa melihat
 * semua agent tidur sementara user lain di kantor yang sama melihat
 * mereka bangun. Sekarang satu nilai per org, dibaca semua client dari
 * snapshot GET /api/kantor/office dan diubah lewat POST /api/kantor/sleep
 * yang menyiarkan event `kantor.sleep_changed` lewat SSE.
 *
 * Batasan yang disadari: in-memory = kembali "bangun" (false) saat proses
 * `next start` restart / VM ke-reset. Itu wajar untuk state tampilan
 * sementara — konsisten dengan broker SSE in-process Wave 10 yang juga
 * hidup di satu proses. Bila user nanti minta tidur bertahan melewati
 * restart, pindahkan ke tabel (migrasi baru) — jangan ke SystemSetting
 * (itu konfigurasi global, bukan per-org) atau OfficeLayout (itu posisi
 * x/y per agent, bukan pengaturan kantor).
 */

const sleepingByOrg = new Map<string, boolean>();

/** Apakah kantor (org) ini sedang dalam mode tidur? Default: bangun. */
export function isSleeping(organizationId: string): boolean {
  return sleepingByOrg.get(organizationId) ?? false;
}

/** Set eksplisit (dipakai endpoint bila client mengirim nilai). */
export function setSleeping(organizationId: string, sleeping: boolean): boolean {
  sleepingByOrg.set(organizationId, sleeping);
  return sleeping;
}

/** Balik nilai saat ini (dipakai endpoint bila client tidak mengirim nilai). */
export function toggleSleeping(organizationId: string): boolean {
  return setSleeping(organizationId, !isSleeping(organizationId));
}
