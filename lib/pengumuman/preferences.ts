// lib/pengumuman/preferences.ts — bentuk KANONIK preferensi notifikasi
// pengumuman (WAVE03_DESIGN.md §3.2). Satu-satunya bentuk yang dipakai
// Wave 3; dua model preferensi backup yang bertentangan (DND, ringtone
// per modul, 10 modul — lihat WAVE03_FRONTEND_BRIEF.md §4.3) DI-DEFER
// dan TIDAK diimplementasikan di gelombang ini.
//
//   {
//     announcement:       { app: true,  email: false },  // prioritas normal/penting
//     announcementUrgent: { app: true,  email: true  },  // prioritas mendesak
//   }
//
// Default mengikuti rencana-notifikasi-email.md backup §3: email aktif
// hanya untuk yang mendesak; pengumuman biasa cukup in-app. Kunci baru
// (peristiwa modul lain) bisa ditambah nanti tanpa migrasi (Json bebas).

export interface ChannelPrefs {
  app: boolean;
  email: boolean;
}

export interface AnnouncementPrefs {
  announcement: ChannelPrefs;
  announcementUrgent: ChannelPrefs;
}

export const DEFAULT_PREFS: AnnouncementPrefs = {
  announcement: { app: true, email: false },
  announcementUrgent: { app: true, email: true },
};

const KNOWN_KEYS = ['announcement', 'announcementUrgent'] as const;

function normalizeChannel(
  raw: unknown,
  fallback: ChannelPrefs
): ChannelPrefs {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const r = raw as Record<string, unknown>;
  return {
    app: typeof r.app === 'boolean' ? r.app : fallback.app,
    email: typeof r.email === 'boolean' ? r.email : fallback.email,
  };
}

/** Normalisasi prefs mentah (dari body POST / kolom Json) ke bentuk kanonik. */
export function normalizePrefs(raw: unknown): AnnouncementPrefs {
  const r =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    announcement: normalizeChannel(
      r.announcement,
      DEFAULT_PREFS.announcement
    ),
    announcementUrgent: normalizeChannel(
      r.announcementUrgent,
      DEFAULT_PREFS.announcementUrgent
    ),
  };
}

/** Gabung prefs tersimpan di atas default (kunci yang hilang = default). */
export function mergePrefs(raw: unknown): AnnouncementPrefs {
  return normalizePrefs(raw);
}

/** Kunci peristiwa yang dipakai untuk satu prioritas pengumuman. */
export function prefsKeyForPriority(
  priority: string
): 'announcement' | 'announcementUrgent' {
  return priority === 'mendesak' ? 'announcementUrgent' : 'announcement';
}

/** Apakah kanal app diizinkan untuk prioritas ini (default true). */
export function isAppAllowed(prefs: AnnouncementPrefs, priority: string): boolean {
  const key = prefsKeyForPriority(priority);
  return (prefs[key] ?? DEFAULT_PREFS[key]).app !== false;
}

/** Apakah kanal email diizinkan untuk prioritas ini (default ikut §3.2). */
export function isEmailAllowed(
  prefs: AnnouncementPrefs,
  priority: string
): boolean {
  const key = prefsKeyForPriority(priority);
  return (prefs[key] ?? DEFAULT_PREFS[key]).email === true;
}

/** Daftar kunci yang dikenal — dipakai validasi body POST (kunci lain diabaikan). */
export function knownPrefKeys(): string[] {
  return [...KNOWN_KEYS];
}
