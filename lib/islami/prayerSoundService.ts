// Pengaturan suara shalat disimpan via API WOORK /api/islami/prayer-settings
// (GET 404 = belum ada, pakai default; POST upsert per user dari session NextAuth).
// localStorage dipakai sebagai cache instan; email tidak lagi dipakai sebagai kunci.
async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.message ? `: ${body.message}` : '';
    } catch { /* abaikan, pakai status saja */ }
    const err = new Error(`Permintaan ${path} gagal (${res.status})${detail}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Service to manage and play authentic MP3 audio files & notifications for Prayer Times (Jadwal Shalat):
 * - Suara Bedug Sebelum Adzan (Suara Bedug Sebelum Adzan.mp3)
 * - Sholawat Tarhim Menjelang Adzan Shubuh (Sholawat Tarhim Menjelang Adzan Shubuh.mp3)
 * - Adzan Subuh Makkah (Adzan Subuh Makkah.mp3)
 * - Adzan Madinah (Adzan Madinah.mp3)
 * - Adzan Makkah (Adzan Makkah.mp3)
 * - Notifikasi Bawaan (Digital chime)
 * - Senyap / Tidak Ada
 */

export type PrayerSoundType = 
  | 'none' 
  | 'silent' 
  | 'default' 
  | 'bedug' 
  | 'tarhim'
  | 'adzan_subuh_makkah'
  | 'adzan_madinah'
  | 'adzan_makkah';

export type PrayerTimeKey = 
  | 'imsak' 
  | 'subuh' 
  | 'terbit' 
  | 'dhuha' 
  | 'dzuhur' 
  | 'ashar' 
  | 'maghrib' 
  | 'isya';

export interface PrayerSoundOption {
  id: PrayerSoundType;
  label: string;
  description: string;
  icon: string;
  audioFile?: string;
}

export const SOUND_DEFINITIONS: Record<PrayerSoundType, PrayerSoundOption> = {
  none: { 
    id: 'none', 
    label: 'Tidak Ada', 
    description: 'Nonaktifkan notifikasi dan suara untuk waktu ini', 
    icon: 'BellOff' 
  },
  silent: { 
    id: 'silent', 
    label: 'Senyap', 
    description: 'Hanya notifikasi visual tanpa memutar nada suara', 
    icon: 'VolumeX' 
  },
  default: { 
    id: 'default', 
    label: 'Notifikasi Bawaan', 
    description: 'Nada dering bel notifikasi digital elegan', 
    icon: 'Bell' 
  },
  bedug: { 
    id: 'bedug', 
    label: 'Suara Bedug', 
    description: 'Tabuhan bedug masjid tradisional sebelum adzan (Suara Bedug Sebelum Adzan.mp3)', 
    icon: 'Music',
    audioFile: '/data/islamic/Adzan/Suara Bedug Sebelum Adzan.mp3'
  },
  tarhim: { 
    id: 'tarhim', 
    label: 'Tarhim', 
    description: 'Lantunan Sholawat Tarhim syahdu menjelang Subuh (Sholawat Tarhim Menjelang Adzan Shubuh.mp3)', 
    icon: 'Volume2',
    audioFile: '/data/islamic/Adzan/Sholawat Tarhim Menjelang Adzan Shubuh.mp3'
  },
  adzan_subuh_makkah: { 
    id: 'adzan_subuh_makkah', 
    label: 'Adzan Subuh Makkah', 
    description: 'Lantunan kumandang Adzan Subuh Masjidil Haram Makkah (Adzan Subuh Makkah.mp3)', 
    icon: 'Volume2',
    audioFile: '/data/islamic/Adzan/Adzan Subuh Makkah.mp3'
  },
  adzan_madinah: { 
    id: 'adzan_madinah', 
    label: 'Adzan Madinah', 
    description: 'Lantunan syahdu Adzan Masjid Nabawi Madinah (Adzan Madinah.mp3)', 
    icon: 'Volume2',
    audioFile: '/data/islamic/Adzan/Adzan Madinah.mp3'
  },
  adzan_makkah: { 
    id: 'adzan_makkah', 
    label: 'Adzan Makkah', 
    description: 'Lantunan merdu Adzan Masjidil Haram Makkah (Adzan Makkah.mp3)', 
    icon: 'Volume2',
    audioFile: '/data/islamic/Adzan/Adzan Makkah.mp3'
  },
};

/**
 * Returns specific sound options allowed for each prayer time
 */
export function getSoundOptionsForPrayer(prayerKey: PrayerTimeKey): PrayerSoundOption[] {
  switch (prayerKey) {
    case 'imsak':
      return [
        SOUND_DEFINITIONS.none,
        SOUND_DEFINITIONS.silent,
        SOUND_DEFINITIONS.default,
        SOUND_DEFINITIONS.bedug,
        SOUND_DEFINITIONS.tarhim,
      ];
    case 'subuh':
      return [
        SOUND_DEFINITIONS.none,
        SOUND_DEFINITIONS.silent,
        SOUND_DEFINITIONS.default,
        SOUND_DEFINITIONS.bedug,
        SOUND_DEFINITIONS.adzan_subuh_makkah,
      ];
    case 'terbit':
      return [
        SOUND_DEFINITIONS.none,
        SOUND_DEFINITIONS.silent,
        SOUND_DEFINITIONS.default,
        SOUND_DEFINITIONS.bedug,
      ];
    case 'dhuha':
      return [
        SOUND_DEFINITIONS.none,
        SOUND_DEFINITIONS.silent,
        SOUND_DEFINITIONS.default,
        SOUND_DEFINITIONS.bedug,
      ];
    case 'dzuhur':
    case 'ashar':
    case 'maghrib':
    case 'isya':
    default:
      return [
        SOUND_DEFINITIONS.none,
        SOUND_DEFINITIONS.silent,
        SOUND_DEFINITIONS.default,
        SOUND_DEFINITIONS.bedug,
        SOUND_DEFINITIONS.adzan_madinah,
        SOUND_DEFINITIONS.adzan_makkah,
      ];
  }
}

export interface PrayerNotificationSettings {
  imsak: PrayerSoundType;
  subuh: PrayerSoundType;
  terbit: PrayerSoundType;
  dhuha: PrayerSoundType;
  dzuhur: PrayerSoundType;
  ashar: PrayerSoundType;
  maghrib: PrayerSoundType;
  isya: PrayerSoundType;
  preAlarmMinutes: number;
  enablePreAlarm: boolean;
}

/**
 * Defaults requested by user:
 * - Imsak: Tarhim
 * - Subuh: Adzan Subuh Makkah
 * - Waktu Terbit: Tidak Ada
 * - Waktu Dhuha: Tidak Ada
 * - Dzuhur: Senyap
 * - Ashar: Senyap
 * - Maghrib: Adzan Makkah
 * - Isya: Senyap
 */
export const DEFAULT_PRAYER_SOUND_SETTINGS: PrayerNotificationSettings = {
  imsak: 'tarhim',
  subuh: 'adzan_subuh_makkah',
  terbit: 'none',
  dhuha: 'none',
  dzuhur: 'silent',
  ashar: 'silent',
  maghrib: 'adzan_makkah',
  isya: 'silent',
  preAlarmMinutes: 5,
  enablePreAlarm: false,
};

function getUserStorageKey(_userEmail?: string | null): string {
  // WOORK: satu kunci cache per perangkat; identitas user dipegang session server.
  return 'myperform_prayer_sound_settings_v3_default';
}

/**
 * Load prayer sound settings from local cache or default
 */
export function getPrayerSoundSettings(userEmail?: string | null): PrayerNotificationSettings {
  try {
    const key = getUserStorageKey(userEmail);
    const saved = localStorage.getItem(key);
    if (saved) {
      return { ...DEFAULT_PRAYER_SOUND_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load prayer sound settings from localStorage', e);
  }
  return DEFAULT_PRAYER_SOUND_SETTINGS;
}

/**
 * Fetch and sync user prayer sound settings directly from Postgres
 */
export async function loadPrayerSoundSettingsFromDb(userEmail?: string | null): Promise<PrayerNotificationSettings> {
  const email = (userEmail || '').toLowerCase().trim();

  try {
    const data = await apiJson('/api/islami/prayer-settings');
    const s = (data?.data?.settings) || {};
    const loadedSettings: PrayerNotificationSettings = {
      imsak: s.imsak || DEFAULT_PRAYER_SOUND_SETTINGS.imsak,
      subuh: s.subuh || DEFAULT_PRAYER_SOUND_SETTINGS.subuh,
      terbit: s.terbit || DEFAULT_PRAYER_SOUND_SETTINGS.terbit,
      dhuha: s.dhuha || DEFAULT_PRAYER_SOUND_SETTINGS.dhuha,
      dzuhur: s.dzuhur || DEFAULT_PRAYER_SOUND_SETTINGS.dzuhur,
      ashar: s.ashar || DEFAULT_PRAYER_SOUND_SETTINGS.ashar,
      maghrib: s.maghrib || DEFAULT_PRAYER_SOUND_SETTINGS.maghrib,
      isya: s.isya || DEFAULT_PRAYER_SOUND_SETTINGS.isya,
      preAlarmMinutes: s.preAlarmMinutes ?? DEFAULT_PRAYER_SOUND_SETTINGS.preAlarmMinutes,
      enablePreAlarm: s.enablePreAlarm ?? DEFAULT_PRAYER_SOUND_SETTINGS.enablePreAlarm,
    };

    // Update local storage
    const storageKey = getUserStorageKey(email);
    localStorage.setItem(storageKey, JSON.stringify(loadedSettings));
    window.dispatchEvent(new CustomEvent('prayer_sound_settings_changed', { detail: loadedSettings }));
    return loadedSettings;
  } catch (err: any) {
    // 404 = pengaturan belum pernah disimpan -> pakai default/local cache.
    if (err?.status !== 404) console.warn('[PrayerSound] prayer-settings fetch notice:', err);
  }

  return getPrayerSoundSettings(email);
}

/**
 * Save user prayer sound settings to both LocalStorage and WOORK API
 * (POST /api/islami/prayer-settings, upsert per user dari session NextAuth).
 */
export async function savePrayerSoundSettings(
  settings: PrayerNotificationSettings,
  userEmail?: string | null
): Promise<void> {
  const email = (userEmail || '').toLowerCase().trim();
  const storageKey = getUserStorageKey(email);

  // 1. Immediately persist to localStorage & dispatch event for instant UI update
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('prayer_sound_settings_changed', { detail: settings }));
  } catch (e) {
    console.warn('Failed to save prayer sound settings to localStorage', e);
  }

  // 2. Persist ke API WOORK
  try {
    await apiJson('/api/islami/prayer-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  } catch (dbErr) {
    console.warn('[PrayerSound] prayer-settings save notice:', dbErr);
  }
}

// Audio state
let currentAudioElement: HTMLAudioElement | null = null;
let currentOnStopCallback: (() => void) | null = null;
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a soothing fallback digital chime
 */
export function playDefaultChime(): void {
  try {
    const ctx = getAudioContext();
    const startTime = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

    freqs.forEach((freq, idx) => {
      const noteStart = startTime + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteStart);

      gain.gain.setValueAtTime(0.01, noteStart);
      gain.gain.linearRampToValueAtTime(0.25, noteStart + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteStart);
      osc.stop(noteStart + 0.8);
    });
  } catch (err) {
    console.warn('Audio synthesis error (Default chime):', err);
  }
}

/**
 * Stop any playing prayer sound audio immediately
 */
export function stopPrayerSound(): void {
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch (e) {
      // ignore
    }
    currentAudioElement = null;
  }
  if (currentOnStopCallback) {
    currentOnStopCallback();
    currentOnStopCallback = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    try {
      audioCtx.close();
    } catch (e) {
      // ignore
    }
    audioCtx = null;
  }
}

/**
 * Play selected sound type (MP3 audio file or synthesized fallback)
 */
export function playPrayerSound(
  type: PrayerSoundType, 
  onEnded?: () => void,
  onError?: (err: any) => void
): void {
  stopPrayerSound();
  if (type === 'none' || type === 'silent') {
    if (onEnded) onEnded();
    return;
  }

  const soundDef = SOUND_DEFINITIONS[type];
  if (soundDef && soundDef.audioFile) {
    try {
      const audio = new Audio(encodeURI(soundDef.audioFile));
      currentAudioElement = audio;
      currentOnStopCallback = onEnded || null;

      audio.onended = () => {
        currentAudioElement = null;
        currentOnStopCallback = null;
        if (onEnded) onEnded();
      };

      audio.onerror = (err) => {
        console.warn(`[PrayerSound] Could not play audio file ${soundDef.audioFile}, fallback to chime:`, err);
        currentAudioElement = null;
        playDefaultChime();
        if (onError) onError(err);
        if (onEnded) setTimeout(onEnded, 1500);
      };

      audio.play().catch((playErr) => {
        console.warn(`[PrayerSound] Playback error or autoplay prevented:`, playErr);
        playDefaultChime();
        if (onEnded) setTimeout(onEnded, 1500);
      });
      return;
    } catch (err) {
      console.warn('Failed creating Audio element:', err);
    }
  }

  // Fallback to synthesized chime
  playDefaultChime();
  if (onEnded) {
    setTimeout(onEnded, 1500);
  }
}
