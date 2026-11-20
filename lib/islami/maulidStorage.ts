import { MaulidReaderSettings, MaulidBookmarkItem } from './types/maulid';

const SETTINGS_KEY = 'myperform_maulid_reader_settings';
const BOOKMARKS_KEY = 'myperform_maulid_bookmarks';
const LAST_READ_KEY = 'myperform_maulid_last_read';

export const DEFAULT_MAULID_SETTINGS: MaulidReaderSettings = {
  arabicFontSize: 'medium',
  latinFontSize: 'medium',
  translationFontSize: 'medium',
  arabicFont: 'amiri',
  showLatin: true,
  showTranslation: true,
  highlightMahalulQiyam: true,
  autoScroll: false,
  scrollSpeed: 2
};

export class MaulidStorageService {
  static getSettings(): MaulidReaderSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        return { ...DEFAULT_MAULID_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Failed to load maulid settings', e);
    }
    return DEFAULT_MAULID_SETTINGS;
  }

  static saveSettings(settings: MaulidReaderSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save maulid settings', e);
    }
  }

  static getBookmarks(): MaulidBookmarkItem[] {
    try {
      const saved = localStorage.getItem(BOOKMARKS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load maulid bookmarks', e);
    }
    return [];
  }

  static saveBookmark(item: Omit<MaulidBookmarkItem, 'id' | 'timestamp'>): MaulidBookmarkItem {
    const bookmarks = this.getBookmarks();
    const id = `${item.kitabId}_${item.fashlId}_${item.baitNomor}_${Date.now()}`;
    const newBookmark: MaulidBookmarkItem = {
      ...item,
      id,
      timestamp: Date.now()
    };
    
    // Check if already bookmarked
    const existingIndex = bookmarks.findIndex(
      b => b.kitabId === item.kitabId && b.fashlId === item.fashlId && b.baitNomor === item.baitNomor
    );

    if (existingIndex >= 0) {
      bookmarks[existingIndex] = newBookmark;
    } else {
      bookmarks.unshift(newBookmark);
    }

    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    } catch (e) {
      console.error('Failed to save maulid bookmark', e);
    }
    return newBookmark;
  }

  static removeBookmark(id: string): void {
    const bookmarks = this.getBookmarks().filter(b => b.id !== id);
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    } catch (e) {
      console.error('Failed to remove maulid bookmark', e);
    }
  }

  static getLastRead(): { kitabId: string; fashlId: string; baitNomor: number } | null {
    try {
      const saved = localStorage.getItem(LAST_READ_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load maulid last read', e);
    }
    return null;
  }

  static saveLastRead(kitabId: string, fashlId: string, baitNomor: number): void {
    try {
      localStorage.setItem(LAST_READ_KEY, JSON.stringify({ kitabId, fashlId, baitNomor, timestamp: Date.now() }));
    } catch (e) {
      console.error('Failed to save maulid last read', e);
    }
  }
}
