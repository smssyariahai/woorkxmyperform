export interface JuzItem {
  juz: number;
  startSurahId: number;
  startSurahName: string;
  startAyah: number;
  endSurahId: number;
  endSurahName: string;
  endAyah: number;
  arabicPhrase: string;
}

export const QURAN_JUZ_LIST: JuzItem[] = [
  { juz: 1, startSurahId: 1, startSurahName: 'Al-Fatihah', startAyah: 1, endSurahId: 2, endSurahName: 'Al-Baqarah', endAyah: 141, arabicPhrase: 'الم' },
  { juz: 2, startSurahId: 2, startSurahName: 'Al-Baqarah', startAyah: 142, endSurahId: 2, endSurahName: 'Al-Baqarah', endAyah: 252, arabicPhrase: 'سيقول' },
  { juz: 3, startSurahId: 2, startSurahName: 'Al-Baqarah', startAyah: 253, endSurahId: 3, endSurahName: 'Ali \'Imran', endAyah: 92, arabicPhrase: 'تلك الرسل' },
  { juz: 4, startSurahId: 3, startSurahName: 'Ali \'Imran', startAyah: 93, endSurahId: 4, endSurahName: 'An-Nisa\'', endAyah: 23, arabicPhrase: 'لن تنالوا' },
  { juz: 5, startSurahId: 4, startSurahName: 'An-Nisa\'', startAyah: 24, endSurahId: 4, endSurahName: 'An-Nisa\'', endAyah: 147, arabicPhrase: 'والمحصنات' },
  { juz: 6, startSurahId: 4, startSurahName: 'An-Nisa\'', startAyah: 148, endSurahId: 5, endSurahName: 'Al-Ma\'idah', endAyah: 81, arabicPhrase: 'لا يحب الله' },
  { juz: 7, startSurahId: 5, startSurahName: 'Al-Ma\'idah', startAyah: 82, endSurahId: 6, endSurahName: 'Al-An\'am', endAyah: 110, arabicPhrase: 'لتجدن' },
  { juz: 8, startSurahId: 6, startSurahName: 'Al-An\'am', startAyah: 111, endSurahId: 7, endSurahName: 'Al-A\'raf', endAyah: 87, arabicPhrase: 'ولو أننا' },
  { juz: 9, startSurahId: 7, startSurahName: 'Al-A\'raf', startAyah: 88, endSurahId: 8, endSurahName: 'Al-Anfal', endAyah: 40, arabicPhrase: 'قال الملأ' },
  { juz: 10, startSurahId: 8, startSurahName: 'Al-Anfal', startAyah: 41, endSurahId: 9, endSurahName: 'At-Taubah', endAyah: 92, arabicPhrase: 'واعلموا' },
  { juz: 11, startSurahId: 9, startSurahName: 'At-Taubah', startAyah: 93, endSurahId: 11, endSurahName: 'Hud', endAyah: 5, arabicPhrase: 'يعتذرون' },
  { juz: 12, startSurahId: 11, startSurahName: 'Hud', startAyah: 6, endSurahId: 12, endSurahName: 'Yusuf', endAyah: 52, arabicPhrase: 'وما من دابة' },
  { juz: 13, startSurahId: 12, startSurahName: 'Yusuf', startAyah: 53, endSurahId: 14, endSurahName: 'Ibrahim', endAyah: 52, arabicPhrase: 'وما أبرئ' },
  { juz: 14, startSurahId: 15, startSurahName: 'Al-Hijr', startAyah: 1, endSurahId: 16, endSurahName: 'An-Nahl', endAyah: 128, arabicPhrase: 'ربما' },
  { juz: 15, startSurahId: 17, startSurahName: 'Al-Isra\'', startAyah: 1, endSurahId: 18, endSurahName: 'Al-Kahf', endAyah: 74, arabicPhrase: 'سبحان الذي' },
  { juz: 16, startSurahId: 18, startSurahName: 'Al-Kahf', startAyah: 75, endSurahId: 20, endSurahName: 'Taha', endAyah: 135, arabicPhrase: 'قال ألم' },
  { juz: 17, startSurahId: 21, startSurahName: 'Al-Anbiya\'', startAyah: 1, endSurahId: 22, endSurahName: 'Al-Hajj', endAyah: 78, arabicPhrase: 'اقترب للناس' },
  { juz: 18, startSurahId: 23, startSurahName: 'Al-Mu\'minun', startAyah: 1, endSurahId: 25, endSurahName: 'Al-Furqan', endAyah: 20, arabicPhrase: 'قد أفلح' },
  { juz: 19, startSurahId: 25, startSurahName: 'Al-Furqan', startAyah: 21, endSurahId: 27, endSurahName: 'An-Naml', endAyah: 55, arabicPhrase: 'وقال الذين' },
  { juz: 20, startSurahId: 27, startSurahName: 'An-Naml', startAyah: 56, endSurahId: 29, endSurahName: 'Al-\'Ankabut', endAyah: 45, arabicPhrase: 'فما كان' },
  { juz: 21, startSurahId: 29, startSurahName: 'Al-\'Ankabut', startAyah: 46, endSurahId: 33, endSurahName: 'Al-Ahzab', endAyah: 30, arabicPhrase: 'ولا تجادلوا' },
  { juz: 22, startSurahId: 33, startSurahName: 'Al-Ahzab', startAyah: 31, endSurahId: 36, endSurahName: 'Ya Sin', endAyah: 27, arabicPhrase: 'ومن يقنت' },
  { juz: 23, startSurahId: 36, startSurahName: 'Ya Sin', startAyah: 28, endSurahId: 39, endSurahName: 'Az-Zumar', endAyah: 31, arabicPhrase: 'وما أنزلنا' },
  { juz: 24, startSurahId: 39, startSurahName: 'Az-Zumar', startAyah: 32, endSurahId: 41, endSurahName: 'Fussilat', endAyah: 46, arabicPhrase: 'فمن أظلم' },
  { juz: 25, startSurahId: 41, startSurahName: 'Fussilat', startAyah: 47, endSurahId: 45, endSurahName: 'Al-Jasiyah', endAyah: 37, arabicPhrase: 'إليه يرد' },
  { juz: 26, startSurahId: 46, startSurahName: 'Al-Ahqaf', startAyah: 1, endSurahId: 51, endSurahName: 'Az-Zariyat', endAyah: 30, arabicPhrase: 'حم' },
  { juz: 27, startSurahId: 51, startSurahName: 'Az-Zariyat', startAyah: 31, endSurahId: 57, endSurahName: 'Al-Hadid', endAyah: 29, arabicPhrase: 'قال فما خطبكم' },
  { juz: 28, startSurahId: 58, startSurahName: 'Al-Mujadilah', startAyah: 1, endSurahId: 66, endSurahName: 'At-Tahrim', endAyah: 12, arabicPhrase: 'قد سمع الله' },
  { juz: 29, startSurahId: 67, startSurahName: 'Al-Mulk', startAyah: 1, endSurahId: 77, endSurahName: 'Al-Mursalat', endAyah: 50, arabicPhrase: 'تبارك الذي' },
  { juz: 30, startSurahId: 78, startSurahName: 'An-Naba\'', startAyah: 1, endSurahId: 114, endSurahName: 'An-Nas', endAyah: 6, arabicPhrase: 'عمّ يتساءلون' }
];
