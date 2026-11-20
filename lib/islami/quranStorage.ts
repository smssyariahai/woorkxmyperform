import { 
  SurahInfo, AyahData, AudioReciter, 
  QuranArabicFontOption, CachedAudioItem 
} from './types/quran';

export const QURAN_ARABIC_FONTS: QuranArabicFontOption[] = [
  {
    id: 'amiri-quran',
    name: 'Amiri Quran',
    subname: 'Mushaf Klasik (Sesuai Foto)',
    tagline: 'Gaya Naskh mushaf klasik dengan harakat & ligatur indah seperti rujukan foto',
    fontFamily: "'Amiri Quran', 'Amiri', serif",
    sampleArabic: 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ',
    badge: 'Pilihan Populer'
  },
  {
    id: 'scheherazade',
    name: 'Scheherazade New',
    subname: 'Mushaf Utsmani Madinah',
    tagline: 'Kaligrafi mushaf Al-Madinah yang sangat anggun, halus, dan berjarak lega',
    fontFamily: "'Scheherazade New', serif",
    sampleArabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  },
  {
    id: 'noto-naskh',
    name: 'Noto Naskh Arabic',
    subname: 'Standar Digital Kemenag',
    tagline: 'Huruf Naskh modern yang tegas, tebal, dan sangat nyaman dibaca di layar digital',
    fontFamily: "'Noto Naskh Arabic', serif",
    sampleArabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  },
  {
    id: 'lateef',
    name: 'Lateef Arabic',
    subname: 'Gaya Kaligrafi Luwes',
    tagline: 'Karakter tipografi Timur Tengah yang mengalir lembut dengan harakat ekspresif',
    fontFamily: "'Lateef', serif",
    sampleArabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  },
];

export const AUDIO_RECITERS: AudioReciter[] = [
  {
    id: 'alafasy',
    name: 'Misyari Rasyid Al-Afasy',
    arabicName: 'مشاري راشد العفاسي',
    urlPrefix: 'https://everyayah.com/data/Alafasy_128kbps',
    bitrate: '128 kbps'
  },
  {
    id: 'shaatree',
    name: 'Abu Bakr Ash-Shaatree',
    arabicName: 'أبو بكر الشاطري',
    urlPrefix: 'https://everyayah.com/data/Abu_Bakr_Ash-Shaatree_128kbps',
    bitrate: '128 kbps'
  },
  {
    id: 'hussary',
    name: 'Mahmud Khalil Al-Hussary',
    arabicName: 'محمود خليل الحصري',
    urlPrefix: 'https://everyayah.com/data/Husary_128kbps',
    bitrate: '128 kbps'
  },
  {
    id: 'sudais',
    name: 'Abdur-Rahman As-Sudais',
    arabicName: 'عبد الرحمن السديس',
    urlPrefix: 'https://everyayah.com/data/Abdurrahmaan_As-Sudais_192kbps',
    bitrate: '192 kbps'
  }
];

const AUDIO_CACHE_NAME = 'murottal-audio-cache-v1';
const surahsInfoCache: { data: SurahInfo[] | null } = { data: null };
const surahDetailCache = new Map<number, AyahData[]>();

/**
 * Fetch list of all 114 surahs from local storage / static asset
 */
export async function getSurahsInfo(): Promise<SurahInfo[]> {
  if (surahsInfoCache.data && surahsInfoCache.data.length > 0) {
    return surahsInfoCache.data;
  }

  // Try from localStorage first for instant offline access
  try {
    const local = localStorage.getItem('quran_surahs_info');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length === 114) {
        surahsInfoCache.data = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  // Fetch from static JSON generated in public/data/quran/surahs-info.json
  const res = await fetch('/data/quran/surahs-info.json');
  if (!res.ok) {
    throw new Error(`Gagal memuat daftar surah: ${res.status}`);
  }

  const list: SurahInfo[] = await res.json();
  surahsInfoCache.data = list;
  try {
    localStorage.setItem('quran_surahs_info', JSON.stringify(list));
  } catch {
    // ignore
  }
  return list;
}

/**
 * Fetch ayat for specific surah (1 - 114)
 */
export async function getSurahDetail(surahId: number): Promise<AyahData[]> {
  if (surahDetailCache.has(surahId)) {
    return surahDetailCache.get(surahId)!;
  }

  // Check indexedDB or localStorage
  const storageKey = `quran_surah_${surahId}`;
  try {
    const local = localStorage.getItem(storageKey);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        surahDetailCache.set(surahId, parsed);
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  const res = await fetch(`/data/quran/surah/${surahId}.json`);
  if (!res.ok) {
    throw new Error(`Gagal memuat surah ${surahId}: ${res.status}`);
  }

  const data: AyahData[] = await res.json();
  surahDetailCache.set(surahId, data);
  try {
    // Only cache reasonable sizes in localStorage
    if (data.length <= 150) {
      localStorage.setItem(storageKey, JSON.stringify(data));
    }
  } catch {
    // ignore quota exceeded
  }
  return data;
}

/**
 * Construct EveryAyah MP3 URL
 * e.g., surah 1 ayah 1 -> 001001.mp3
 */
export function getAyahAudioUrl(reciterPrefix: string, surahId: number, ayahNumber: number): string {
  const s = String(surahId).padStart(3, '0');
  const a = String(ayahNumber).padStart(3, '0');
  return `${reciterPrefix}/${s}${a}.mp3`;
}

/**
 * Fetch and cache an audio file into CacheStorage on user demand
 * Returns a playable URL (either ObjectURL from cache or standard URL)
 */
export async function getOrCacheAudioBlobUrl(audioUrl: string): Promise<string> {
  if (!('caches' in window)) {
    return audioUrl;
  }

  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const cachedResponse = await cache.match(audioUrl);

    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      return URL.createObjectURL(blob);
    }

    // Not cached yet: fetch and store into CacheStorage
    const res = await fetch(audioUrl, { mode: 'cors' });
    if (res.ok) {
      // Clone response to put into cache
      await cache.put(audioUrl, res.clone());
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
  } catch (err) {
    console.warn('Audio caching skipped, falling back to direct stream:', err);
  }

  return audioUrl;
}

/**
 * Check if a specific audio URL is already in browser cache
 */
export async function isAudioCached(audioUrl: string): Promise<boolean> {
  if (!('caches' in window)) return false;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const match = await cache.match(audioUrl);
    return !!match;
  } catch {
    return false;
  }
}

/**
 * Get statistics of cached Murottal audio
 */
export async function getMurottalCacheStats(): Promise<{ count: number; totalBytes: number; formattedSize: string }> {
  if (!('caches' in window)) {
    return { count: 0, totalBytes: 0, formattedSize: '0 MB' };
  }

  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    let totalBytes = 0;

    // Estimate size from responses (sample or estimate average ~150KB per verse)
    for (const req of keys) {
      const resp = await cache.match(req);
      if (resp) {
        const cl = resp.headers.get('content-length');
        if (cl) {
          totalBytes += parseInt(cl, 10);
        } else {
          totalBytes += 160 * 1024; // default estimate 160 KB
        }
      }
    }

    const mb = totalBytes / (1024 * 1024);
    const formattedSize = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(totalBytes / 1024)} KB`;

    return {
      count: keys.length,
      totalBytes,
      formattedSize
    };
  } catch (err) {
    console.error('Error reading audio cache stats:', err);
    return { count: 0, totalBytes: 0, formattedSize: '0 MB' };
  }
}

/**
 * Delete all cached murottal audio files to free device memory
 */
export async function clearMurottalAudioCache(): Promise<{ success: boolean; deletedCount: number }> {
  if (!('caches' in window)) {
    return { success: true, deletedCount: 0 };
  }

  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    const count = keys.length;

    await caches.delete(AUDIO_CACHE_NAME);
    return { success: true, deletedCount: count };
  } catch (err) {
    console.error('Error clearing audio cache:', err);
    return { success: false, deletedCount: 0 };
  }
}

/**
 * Get detailed list of each cached audio file
 */
export async function getCachedAudioList(): Promise<CachedAudioItem[]> {
  if (!('caches' in window)) return [];
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    const surahs = await getSurahsInfo();
    const surahMap = new Map<number, string>();
    surahs.forEach((s) => surahMap.set(s.id, s.latin));

    const items: CachedAudioItem[] = [];

    for (const req of keys) {
      const url = req.url;
      // Typical URL: https://everyayah.com/data/Alafasy_128kbps/001001.mp3
      const match = url.match(/\/([^\/]+)\/(\d{3})(\d{3})\.mp3/i);
      let surahId = 1;
      let ayahNumber = 1;
      let reciterId = 'alafasy';
      let reciterName = 'Misyari Rasyid Al-Afasy';

      if (match) {
        const reciterPath = match[1];
        surahId = parseInt(match[2], 10);
        ayahNumber = parseInt(match[3], 10);

        const foundReciter = AUDIO_RECITERS.find((r) => r.urlPrefix.includes(reciterPath));
        if (foundReciter) {
          reciterId = foundReciter.id;
          reciterName = foundReciter.name;
        } else {
          reciterName = reciterPath.replace(/_/g, ' ');
        }
      }

      let sizeBytes = 160 * 1024;
      const resp = await cache.match(req);
      if (resp) {
        const cl = resp.headers.get('content-length');
        if (cl) {
          sizeBytes = parseInt(cl, 10);
        } else {
          try {
            const b = await resp.clone().blob();
            sizeBytes = b.size;
          } catch {
            // fallback
          }
        }
      }

      const formattedSize =
        sizeBytes >= 1024 * 1024
          ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(sizeBytes / 1024)} KB`;

      items.push({
        url,
        surahId,
        ayahNumber,
        surahName: surahMap.get(surahId) || `Surah ${surahId}`,
        reciterId,
        reciterName,
        sizeBytes,
        formattedSize,
      });
    }

    // Sort by surahId, then ayahNumber
    items.sort((a, b) => {
      if (a.surahId !== b.surahId) return a.surahId - b.surahId;
      return a.ayahNumber - b.ayahNumber;
    });

    return items;
  } catch (err) {
    console.error('Error getting cached audio list:', err);
    return [];
  }
}

/**
 * Delete specific cached audio URLs
 */
export async function deleteCachedAudioByUrls(urls: string[]): Promise<number> {
  if (!('caches' in window) || urls.length === 0) return 0;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    let deletedCount = 0;
    for (const u of urls) {
      const deleted = await cache.delete(u);
      if (deleted) deletedCount++;
    }
    return deletedCount;
  } catch (err) {
    console.error('Error deleting cached audio by urls:', err);
    return 0;
  }
}


/**
 * Search Ayahs in local surah files
 */
export async function searchInQuran(query: string, maxResults: number = 50): Promise<{
  surah: SurahInfo;
  ayah: AyahData;
}[]> {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ || cleanQ.length < 2) return [];

  const surahs = await getSurahsInfo();
  const results: { surah: SurahInfo; ayah: AyahData }[] = [];

  // Loop through surahs
  for (const s of surahs) {
    if (results.length >= maxResults) break;

    try {
      const ayahs = await getSurahDetail(s.id);
      for (const a of ayahs) {
        if (
          a.translation.toLowerCase().includes(cleanQ) ||
          a.latin.toLowerCase().includes(cleanQ)
        ) {
          results.push({ surah: s, ayah: a });
          if (results.length >= maxResults) break;
        }
      }
    } catch {
      // ignore
    }
  }

  return results;
}
