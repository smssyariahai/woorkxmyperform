'use client';

/** Pesan error yang ramah untuk kegagalan fetch (dipakai lintas modul). */
export function friendlyFetchError(e: any, fallback: string) {
  const msg = String(e?.message || '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Tidak dapat menghubungi server. Pastikan "npm run dev" masih berjalan di terminal tanpa error.';
  }
  return msg || fallback;
}
