export interface BaitMaulid {
  nomorBait: number;
  teksArab: string;
  latin?: string;
  terjemahan: string;
  penjelasan?: string;
  isMahalulQiyam?: boolean;
}

export interface FashlMaulid {
  id: string;
  nomor: number;
  judul: string;
  judulArab: string;
  deskripsi?: string;
  isMahalulQiyam?: boolean;
  baits: BaitMaulid[];
}

export interface KitabMaulidInfo {
  id: string;
  nama: string;
  namaArab: string;
  pengarang: string;
  pengarangGelar: string;
  tahunWafat: string;
  kotaKelahiran: string;
  deskripsi: string;
  latarBelakang: string;
  keutamaan: string[];
  totalFashl: number;
  totalBait: number;
  audioUrl?: string;
  audioReciter?: string;
  fashls: FashlMaulid[];
}

export interface MaulidBookmarkItem {
  id: string;
  kitabId: string;
  kitabNama: string;
  fashlId: string;
  fashlJudul: string;
  baitNomor: number;
  teksArab: string;
  terjemahan: string;
  catatan?: string;
  timestamp: number;
}

export interface MaulidReaderSettings {
  arabicFontSize: 'small' | 'medium' | 'large' | 'extralarge';
  latinFontSize: 'small' | 'medium' | 'large';
  translationFontSize: 'small' | 'medium' | 'large';
  arabicFont: 'amiri' | 'scheherazade' | 'uthmani' | 'indopak';
  showLatin: boolean;
  showTranslation: boolean;
  highlightMahalulQiyam: boolean;
  autoScroll: boolean;
  scrollSpeed: number; // 1 to 5
}
