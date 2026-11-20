import { QuranBookmarkItem, LastReadPosition } from './types/quran';

// ---------------------------------------------------------------------------
// Pengganti quranBookmarksService backup (dulu memakai Firestore, lalu
// endpoint Postgres di aplikasi backup — keduanya sudah tidak dipakai).
// Di WOORK bookmark disimpan via API /api/islami/bookmarks (NextAuth, session
// dibaca server dari cookie — user TIDAK perlu dioper ke API).
// Respons API dibungkus { success, data: { bookmarks } } / { success, data: { id } }.
// Pengganti onSnapshot: fetch langsung + polling 30 detik.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30000;

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `Permintaan ${path} gagal (${res.status})`);
  }
  return body;
}

/** Daftar bookmark milik user saat ini. */
export async function fetchUserBookmarks(): Promise<QuranBookmarkItem[]> {
  const body = await apiJson('/api/islami/bookmarks');
  const list: QuranBookmarkItem[] = body?.data?.bookmarks || body?.bookmarks || [];
  return sortUserBookmarks(list);
}

/** Catatan publik (bookmark ber-catatan yang ditandai publik). */
export async function fetchPublicQuranNotes(): Promise<QuranBookmarkItem[]> {
  const body = await apiJson('/api/islami/bookmarks?public=true');
  const list: QuranBookmarkItem[] = (body?.data?.bookmarks || body?.bookmarks || []).filter(
    (item: QuranBookmarkItem) => item.note && item.note.trim().length > 0
  );
  list.sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
  return list;
}

/**
 * Simpan atau perbarui bookmark / catatan (upsert per user+surah+ayat di server).
 */
export async function saveQuranBookmark(
  item: Omit<QuranBookmarkItem, 'id' | 'createdAt' | 'userId' | 'userEmail' | 'userName'>
): Promise<string> {
  const body = await apiJson('/api/islami/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  return (body?.data?.id || body?.id) as string;
}

/** Hapus bookmark. */
export async function deleteQuranBookmark(bookmarkId: string): Promise<void> {
  await apiJson(`/api/islami/bookmarks/${encodeURIComponent(bookmarkId)}`, {
    method: 'DELETE',
  });
}

function sortUserBookmarks(list: QuranBookmarkItem[]): QuranBookmarkItem[] {
  return [...list].sort((a, b) => {
    if (a.surahId !== b.surahId) return a.surahId - b.surahId;
    return a.ayahNumber - b.ayahNumber;
  });
}

/**
 * Polling pengganti onSnapshot untuk bookmark pengguna saat ini.
 * Mengembalikan fungsi unsubscribe seperti sebelumnya.
 */
export function subscribeUserBookmarks(
  onData: (bookmarks: QuranBookmarkItem[]) => void,
  onError?: (err: unknown) => void
) {
  let stopped = false;
  const fetchOnce = async () => {
    try {
      const list = await fetchUserBookmarks();
      if (!stopped) onData(list);
    } catch (err) {
      if (onError) onError(err);
      console.warn('Bookmarks poll warning:', err);
    }
  };
  void fetchOnce();
  const timer = setInterval(fetchOnce, POLL_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** Polling pengganti onSnapshot untuk catatan publik / refleksi Al-Qur'an. */
export function subscribePublicQuranNotes(
  onData: (notes: QuranBookmarkItem[]) => void,
  onError?: (err: unknown) => void
) {
  let stopped = false;
  const fetchOnce = async () => {
    try {
      const list = await fetchPublicQuranNotes();
      if (!stopped) onData(list);
    } catch (err) {
      if (onError) onError(err);
      console.warn('Public Quran notes poll warning:', err);
    }
  };
  void fetchOnce();
  const timer = setInterval(fetchOnce, POLL_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** Posisi terakhir dibaca — tetap localStorage (instant offline). */
const LAST_READ_KEY = 'quran_last_read_position';

export function saveLastRead(pos: LastReadPosition): void {
  try {
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

export function getLastRead(): LastReadPosition | null {
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return null;
}
