export interface QuranVerse {
  surah: string;
  ayah: string;
  arabic: string;
  latin?: string;
  translation: string;
}

export interface HadithProof {
  narrator: string;
  arabic?: string;
  translation: string;
  reference: string;
}

export interface MalaikatItem {
  id: string;
  order: number;
  name: string;
  arabicName: string;
  title: string;
  category: 'angel';
  duty: string;
  briefSummary: string;
  characteristics: string[];
  fullExplanation: string;
  quranVerses: QuranVerse[];
  hadiths: HadithProof[];
  wisdoms: string[];
  references: string[];
}

export interface KitabSuhufItem {
  id: string;
  order: number;
  category: 'book' | 'suhuf';
  name: string;
  arabicName: string;
  recipient: string;
  language: string;
  era: string;
  briefSummary: string;
  coreContents: string[];
  fullExplanation: string;
  quranVerses: QuranVerse[];
  hadiths?: HadithProof[];
  wisdoms: string[];
  references: string[];
}

export type MalaikatKitabItem = MalaikatItem | KitabSuhufItem;
