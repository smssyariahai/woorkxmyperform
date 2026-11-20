export interface SurahInfo {
  id: number;
  arabic: string;
  latin: string;
  transliteration: string;
  translation: string;
  num_ayah: number;
  page: number;
  location: 'Makkiyah' | 'Madaniyah' | string;
  juz_start: number;
}

export interface AyahData {
  id: number;
  surah_id: number;
  ayah: number;
  page: number;
  quarter_hizb?: number | null;
  juz: number;
  manzil?: number;
  arabic: string;
  kitabah?: string;
  latin: string;
  arabic_words?: string[];
  translation: string;
  footnotes?: string | null;
  surah?: {
    id: number;
    arabic: string;
    latin: string;
    transliteration: string;
    translation: string;
    num_ayah: number;
    page: number;
    location: string;
  };
}

export interface QuranBookmarkItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  surahId: number;
  surahName: string;
  surahArabic: string;
  ayahNumber: number;
  ayahArabic: string;
  ayahTranslation: string;
  note: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface LastReadPosition {
  surahId: number;
  surahName: string;
  surahArabic: string;
  ayahNumber: number;
  updatedAt: string;
}

export interface AudioReciter {
  id: string;
  name: string;
  arabicName: string;
  urlPrefix: string;
  bitrate: string;
}

export type QuranArabicFontId = 'amiri-quran' | 'scheherazade' | 'noto-naskh' | 'lateef';

export interface QuranArabicFontOption {
  id: QuranArabicFontId;
  name: string;
  subname: string;
  tagline: string;
  fontFamily: string;
  sampleArabic: string;
  badge?: string;
}

export interface CachedAudioItem {
  url: string;
  surahId: number;
  ayahNumber: number;
  surahName: string;
  reciterId: string;
  reciterName: string;
  sizeBytes: number;
  formattedSize: string;
}

export interface QuranReaderSettings {
  arabicFontSize: 'small' | 'medium' | 'large' | 'xlarge';
  latinFontSize?: 'small' | 'medium' | 'large' | 'xlarge';
  translationFontSize?: 'small' | 'medium' | 'large' | 'xlarge';
  arabicFont: QuranArabicFontId;
  showAyahOrnament: boolean;
  showLatin: boolean;
  showTranslation: boolean;
  selectedReciter: string;
  autoPlayNextAyah: boolean;
  playbackSpeed: number;
}

