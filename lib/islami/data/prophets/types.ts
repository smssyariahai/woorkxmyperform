export interface QuranVerse {
  surah: string;
  ayah: string;
  arabic: string;
  latin?: string;
  translation: string;
}

export interface ProphetItem {
  id: string;
  order: number;
  name: string;
  arabicName: string;
  title: string;
  era: string;
  location: string;
  briefSummary: string;
  miracles: string[];
  fullStory: string;
  quranVerses: QuranVerse[];
  wisdoms: string[];
  references: string[];
}
