export interface NiatVariant {
  id: string;
  name: string;
  arabic: string;
  latin: string;
  translation: string;
  note?: string;
}

export interface NiatShalatItem {
  id: string;
  category: 'fardhu' | 'sunnah';
  name: string;
  rakaat: string;
  timeInfo: string;
  description: string;
  variants: NiatVariant[];
}

export const NIAT_SHALAT_DATA: NiatShalatItem[] = [
  // ================= FARDHU PRAYERS =================
  {
    id: 'subuh',
    category: 'fardhu',
    name: 'Salat Subuh',
    rakaat: '2 Rakaat',
    timeInfo: 'Waktu Subuh dimulai sejak fajar shadiq terbit di ufuk timur hingga sesaat sebelum piringan matahari terbit (syuruq).',
    description: 'Salat fardhu dua rakaat yang wajib dikerjakan pada waktu fajar. Disunnahkan membaca doa Qunut pada iktidal rakaat kedua menurut Mazhab Syafi\'i.',
    variants: [
      {
        id: 'subuh-munfarid',
        name: 'Sendiri (Munfarid)',
        arabic: 'أُصَلِّيْ فَرْضَ الصُّبْحِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhash-shubhi rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Subuh dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
      {
        id: 'subuh-imam',
        name: 'Sebagai Imam',
        arabic: 'أُصَلِّيْ فَرْضَ الصُّبْحِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً إِمَامًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhash-shubhi rak'ataini mustaqbilal qiblati adaa-an imaaman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Subuh dua rakaat menghadap kiblat, sebagai imam karena Allah Ta\'ala.',
      },
      {
        id: 'subuh-makmum',
        name: 'Sebagai Makmum',
        arabic: 'أُصَلِّيْ فَرْضَ الصُّبْحِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً مَأْمُوْمًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhash-shubhi rak'ataini mustaqbilal qiblati adaa-an ma'muuman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Subuh dua rakaat menghadap kiblat, sebagai makmum karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'dzuhur',
    category: 'fardhu',
    name: 'Salat Dzuhur',
    rakaat: '4 Rakaat',
    timeInfo: 'Waktu Dzuhur dimulai saat matahari tergelincir ke arah barat dari titik tengah langit (zawal) hingga bayangan benda sama panjang dengan aslinya.',
    description: 'Salat fardhu empat rakaat di siang hari yang dikerjakan dengan bacaan sirr (suara pelan / lirih).',
    variants: [
      {
        id: 'dzuhur-munfarid',
        name: 'Sendiri (Munfarid)',
        arabic: 'أُصَلِّيْ فَرْضَ الظُّهْرِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhazh-zhuhri arba'a raka'aatin mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Dzuhur empat rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
      {
        id: 'dzuhur-imam',
        name: 'Sebagai Imam',
        arabic: 'أُصَلِّيْ فَرْضَ الظُّهْرِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً إِمَامًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhazh-zhuhri arba'a raka'aatin mustaqbilal qiblati adaa-an imaaman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Dzuhur empat rakaat menghadap kiblat, sebagai imam karena Allah Ta\'ala.',
      },
      {
        id: 'dzuhur-makmum',
        name: 'Sebagai Makmum',
        arabic: 'أُصَلِّيْ فَرْضَ الظُّهْرِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً مَأْمُوْمًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhazh-zhuhri arba'a raka'aatin mustaqbilal qiblati adaa-an ma'muuman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Dzuhur empat rakaat menghadap kiblat, sebagai makmum karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'ashar',
    category: 'fardhu',
    name: 'Salat Ashar',
    rakaat: '4 Rakaat',
    timeInfo: 'Waktu Ashar dimulai saat panjang bayangan benda melebihi ukuran aslinya hingga terbenamnya piringan matahari.',
    description: 'Salat fardhu empat rakaat di sore hari dengan bacaan sirr (lirih). Disebut juga sebagai Shalat Wustha dalam Al-Qur\'an.',
    variants: [
      {
        id: 'ashar-munfarid',
        name: 'Sendiri (Munfarid)',
        arabic: 'أُصَلِّيْ فَرْضَ الْعَصْرِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-'ashri arba'a raka'aatin mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Ashar empat rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
      {
        id: 'ashar-imam',
        name: 'Sebagai Imam',
        arabic: 'أُصَلِّيْ فَرْضَ الْعَصْرِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً إِمَامًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-'ashri arba'a raka'aatin mustaqbilal qiblati adaa-an imaaman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Ashar empat rakaat menghadap kiblat, sebagai imam karena Allah Ta\'ala.',
      },
      {
        id: 'ashar-makmum',
        name: 'Sebagai Makmum',
        arabic: 'أُصَلِّيْ فَرْضَ الْعَصْرِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً مَأْمُوْمًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-'ashri arba'a raka'aatin mustaqbilal qiblati adaa-an ma'muuman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Ashar empat rakaat menghadap kiblat, sebagai makmum karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'maghrib',
    category: 'fardhu',
    name: 'Salat Maghrib',
    rakaat: '3 Rakaat',
    timeInfo: 'Waktu Maghrib dimulai sejak seluruh bulatan matahari tenggelam sempurna hingga hilangnya mega merah (syafaq ahmar) di langit barat.',
    description: 'Salat fardhu tiga rakaat saat senja hari. Dua rakaat pertama dibaca jahr (lantang bagi imam/munfarid) dan rakaat ketiga dibaca sirr.',
    variants: [
      {
        id: 'maghrib-munfarid',
        name: 'Sendiri (Munfarid)',
        arabic: 'أُصَلِّيْ فَرْضَ الْمَغْرِبِ ثَلَاثَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-maghribi tsalaatsa raka'aatin mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Maghrib tiga rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
      {
        id: 'maghrib-imam',
        name: 'Sebagai Imam',
        arabic: 'أُصَلِّيْ فَرْضَ الْمَغْرِبِ ثَلَاثَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً إِمَامًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-maghribi tsalaatsa raka'aatin mustaqbilal qiblati adaa-an imaaman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Maghrib tiga rakaat menghadap kiblat, sebagai imam karena Allah Ta\'ala.',
      },
      {
        id: 'maghrib-makmum',
        name: 'Sebagai Makmum',
        arabic: 'أُصَلِّيْ فَرْضَ الْمَغْرِبِ ثَلَاثَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً مَأْمُوْمًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-maghribi tsalaatsa raka'aatin mustaqbilal qiblati adaa-an ma'muuman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Maghrib tiga rakaat menghadap kiblat, sebagai makmum karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'isya',
    category: 'fardhu',
    name: 'Salat Isya',
    rakaat: '4 Rakaat',
    timeInfo: 'Waktu Isya dimulai setelah hilangnya mega merah di ufuk barat hingga pertengahan malam / sebelum fajar shadiq terbit.',
    description: 'Salat fardhu empat rakaat di malam hari. Dua rakaat pertama dibaca jahr (lantang bagi imam/munfarid) dan dua rakaat berikutnya dibaca sirr.',
    variants: [
      {
        id: 'isya-munfarid',
        name: 'Sendiri (Munfarid)',
        arabic: 'أُصَلِّيْ فَرْضَ الْعِشَاءِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-'isyaa-i arba'a raka'aatin mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Isya empat rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
      {
        id: 'isya-imam',
        name: 'Sebagai Imam',
        arabic: 'أُصَلِّيْ فَرْضَ الْعِشَاءِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً إِمَامًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-'isyaa-i arba'a raka'aatin mustaqbilal qiblati adaa-an imaaman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Isya empat rakaat menghadap kiblat, sebagai imam karena Allah Ta\'ala.',
      },
      {
        id: 'isya-makmum',
        name: 'Sebagai Makmum',
        arabic: 'أُصَلِّيْ فَرْضَ الْعِشَاءِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً مَأْمُوْمًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-'isyaa-i arba'a raka'aatin mustaqbilal qiblati adaa-an ma'muuman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Isya empat rakaat menghadap kiblat, sebagai makmum karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'jumat',
    category: 'fardhu',
    name: 'Salat Jumat',
    rakaat: '2 Rakaat',
    timeInfo: 'Waktu pelaksanaan sama dengan waktu Dzuhur pada hari Jumat, didahului dengan dua khutbah.',
    description: 'Salat fardhu \'ain bagi laki-laki muslim mukallaf yang mukim, dilaksanakan secara berjamaah dua rakaat menggantikan shalat Dzuhur.',
    variants: [
      {
        id: 'jumat-makmum',
        name: 'Sebagai Makmum',
        arabic: 'أُصَلِّيْ فَرْضَ الْجُمُعَةِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً مَأْمُوْمًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-jumu'ati rak'ataini mustaqbilal qiblati adaa-an ma'muuman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Jumat dua rakaat menghadap kiblat, tunai sebagai makmum karena Allah Ta\'ala.',
      },
      {
        id: 'jumat-imam',
        name: 'Sebagai Imam',
        arabic: 'أُصَلِّيْ فَرْضَ الْجُمُعَةِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً إِمَامًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii fardhal-jumu'ati rak'ataini mustaqbilal qiblati adaa-an imaaman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat fardhu Jumat dua rakaat menghadap kiblat, tunai sebagai imam karena Allah Ta\'ala.',
      },
    ],
  },

  // ================= SUNNAH PRAYERS =================
  {
    id: 'rawatib',
    category: 'sunnah',
    name: 'Salat Sunnah Rawatib',
    rakaat: '2 atau 4 Rakaat per waktu',
    timeInfo: 'Dikerjakan sebelum (Qabliyah) atau sesudah (Ba\'diyah) salat fardhu.',
    description: 'Salat sunnah yang mengiringi salat fardhu. Terdapat yang berstatus Mu\'akkad (sangat dianjurkan: 2 rakaat sebelum Subuh, 2/4 sebelum Dzuhur, 2 sesudah Dzuhur, 2 sesudah Maghrib, 2 sesudah Isya) dan Ghairu Mu\'akkad.',
    variants: [
      {
        id: 'rawatib-qabliyah-subuh',
        name: 'Qabliyah Subuh (Fajar - 2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ الصُّبْحِ رَكْعَتَيْنِ قَبْلِيَّةً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatash-shubhi rak'ataini qabliyyatan lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah sebelum Subuh dua rakaat karena Allah Ta\'ala.',
        note: 'Pahalanya lebih baik daripada dunia dan seisinya (HR. Muslim).'
      },
      {
        id: 'rawatib-qabliyah-dzuhur',
        name: 'Qabliyah Dzuhur (2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ الظُّهْرِ رَكْعَتَيْنِ قَبْلِيَّةً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatazh-zhuhri rak'ataini qabliyyatan lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah sebelum Dzuhur dua rakaat karena Allah Ta\'ala.',
      },
      {
        id: 'rawatib-badiyah-dzuhur',
        name: 'Ba\'diyah Dzuhur (2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ الظُّهْرِ رَكْعَتَيْنِ بَعْدِيَّةً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatazh-zhuhri rak'ataini ba'diyyatan lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah sesudah Dzuhur dua rakaat karena Allah Ta\'ala.',
      },
      {
        id: 'rawatib-qabliyah-ashar',
        name: 'Qabliyah Ashar (2 Rakaat - Ghairu Mu\'akkad)',
        arabic: 'أُصَلِّيْ سُنَّةَ الْعَصْرِ رَكْعَتَيْنِ قَبْلِيَّةً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatal-'ashri rak'ataini qabliyyatan lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah sebelum Ashar dua rakaat karena Allah Ta\'ala.',
      },
      {
        id: 'rawatib-qabliyah-maghrib',
        name: 'Qabliyah Maghrib (2 Rakaat - Ghairu Mu\'akkad)',
        arabic: 'أُصَلِّيْ سُنَّةَ الْمَغْرِبِ رَكْعَتَيْنِ قَبْلِيَّةً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatal-maghribi rak'ataini qabliyyatan lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah sebelum Maghrib dua rakaat karena Allah Ta\'ala.',
      },
      {
        id: 'rawatib-badiyah-maghrib',
        name: 'Ba\'diyah Maghrib (2 Rakaat - Mu\'akkad)',
        arabic: 'أُصَلِّيْ سُنَّةَ الْمَغْرِبِ رَكْعَتَيْنِ بَعْدِيَّةً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatal-maghribi rak'ataini ba'diyyatan lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah sesudah Maghrib dua rakaat karena Allah Ta\'ala.',
      },
      {
        id: 'rawatib-qabliyah-isya',
        name: 'Qabliyah Isya (2 Rakaat - Ghairu Mu\'akkad)',
        arabic: 'أُصَلِّيْ سُنَّةَ الْعِشَاءِ رَكْعَتَيْنِ قَبْلِيَّةً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatal-'isyaa-i rak'ataini qabliyyatan lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah sebelum Isya dua rakaat karena Allah Ta\'ala.',
      },
      {
        id: 'rawatib-badiyah-isya',
        name: 'Ba\'diyah Isya (2 Rakaat - Mu\'akkad)',
        arabic: 'أُصَلِّيْ سُنَّةَ الْعِشَاءِ رَكْعَتَيْنِ بَعْدِيَّةً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatal-'isyaa-i rak'ataini ba'diyyatan lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah sesudah Isya dua rakaat karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'witr',
    category: 'sunnah',
    name: 'Salat Witir',
    rakaat: '1, 3, 5, atau hingga 11 Rakaat (Ganjil)',
    timeInfo: 'Dikerjakan setelah salat Isya hingga sebelum masuk waktu Subuh, biasanya sebagai penutup salat malam.',
    description: 'Salat sunnah berbilangan rakaat ganjil yang sangat dianjurkan (mu\'akkad). Bisa dikerjakan 1 rakaat atau 3 rakaat (2 rakaat salam + 1 rakaat, atau 3 rakaat sekaligus).',
    variants: [
      {
        id: 'witr-1-rakaat',
        name: 'Witir 1 Rakaat',
        arabic: 'أُصَلِّيْ سُنَّةَ الْوِتْرِ رَكْعَةً مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatal-witri rak'atan mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah witir satu rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
      {
        id: 'witr-2-rakaat',
        name: 'Witir 2 Rakaat (Awal dari 3 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةً مِنَ الْوِتْرِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatan minal-witri rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah dua rakaat bagian dari shalat witir menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
      {
        id: 'witr-3-rakaat',
        name: 'Witir 3 Rakaat (Sekaligus)',
        arabic: 'أُصَلِّيْ سُنَّةَ الْوِتْرِ ثَلَاثَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatal-witri tsalaatsa raka'aatin mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah witir tiga rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'tahajjud',
    category: 'sunnah',
    name: 'Salat Tahajud',
    rakaat: 'Minimal 2 Rakaat (Kelipatan 2)',
    timeInfo: 'Dikerjakan pada malam hari sesudah tidur terlebih dahulu. Waktu paling utama adalah pada sepertiga malam terakhir.',
    description: 'Salat sunnah malam hari (Qiyamul Lail) yang dilakukan setelah bangun tidur. Memiliki kedudukan mulia di sisi Allah SWT dan mustajab doa.',
    variants: [
      {
        id: 'tahajjud-2-rakaat',
        name: 'Salat Tahajud (2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ التَّهَجُّدِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatat-tahajjudi rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah tahajud dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'duha',
    category: 'sunnah',
    name: 'Salat Duha',
    rakaat: '2, 4, 6, 8, hingga 12 Rakaat',
    timeInfo: 'Dimulai sejak matahari meninggi setinggi tombak (sekitar 15-20 menit setelah terbit) hingga menjelang waktu zawal (masuk Dzuhur).',
    description: 'Salat sunnah di waktu pagi yang menjadi sedekah atas setiap persendian tubuh dan pembuka pintu rezeki yang berkah.',
    variants: [
      {
        id: 'duha-2-rakaat',
        name: 'Salat Duha (2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ الضُّحَى رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatadh-dhuhaa rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah dhuha dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'tarawih',
    category: 'sunnah',
    name: 'Salat Tarawih',
    rakaat: '8 Rakaat (4x2 rakaat) atau 20 Rakaat (10x2 rakaat)',
    timeInfo: 'Dikerjakan pada malam hari selama bulan suci Ramadan setelah salat Isya hingga sebelum waktu Subuh.',
    description: 'Salat sunnah khusus di bulan Ramadan yang sangat dianjurkan, dapat dilakukan berjamaah di masjid maupun sendirian di rumah.',
    variants: [
      {
        id: 'tarawih-munfarid',
        name: 'Sendiri (Munfarid)',
        arabic: 'أُصَلِّيْ سُنَّةَ التَّرَاوِيْحِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatat-taraawiihi rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah tarawih dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
      {
        id: 'tarawih-imam',
        name: 'Sebagai Imam',
        arabic: 'أُصَلِّيْ سُنَّةَ التَّرَاوِيْحِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً إِمَامًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatat-taraawiihi rak'ataini mustaqbilal qiblati adaa-an imaaman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah tarawih dua rakaat menghadap kiblat, sebagai imam karena Allah Ta\'ala.',
      },
      {
        id: 'tarawih-makmum',
        name: 'Sebagai Makmum',
        arabic: 'أُصَلِّيْ سُنَّةَ التَّرَاوِيْحِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً مَأْمُوْمًا لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatat-taraawiihi rak'ataini mustaqbilal qiblati adaa-an ma'muuman lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah tarawih dua rakaat menghadap kiblat, sebagai makmum karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'tahiyyat-al-masjid',
    category: 'sunnah',
    name: 'Salat Tahiyatul Masjid',
    rakaat: '2 Rakaat',
    timeInfo: 'Dikerjakan sesaat setelah memasuki masjid dan sebelum duduk.',
    description: 'Salat sunnah dua rakaat sebagai bentuk penghormatan dan pemuliaan terhadap baitullah (rumah Allah / masjid).',
    variants: [
      {
        id: 'tahiyyat-2-rakaat',
        name: 'Salat Tahiyatul Masjid (2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ تَحِيَّةِ الْمَسْجِدِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnata tahiyyatil-masjidi rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah tahiyatul masjid dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'istikharah',
    category: 'sunnah',
    name: 'Salat Istikharah',
    rakaat: '2 Rakaat',
    timeInfo: 'Dapat dikerjakan kapan saja di luar waktu-waktu yang diharamkan untuk shalat, lebih utama di malam hari.',
    description: 'Salat sunnah dua rakaat untuk memohon ketetapan dan petunjuk pilihan terbaik dari Allah SWT atas suatu urusan yang halal.',
    variants: [
      {
        id: 'istikharah-2-rakaat',
        name: 'Salat Istikharah (2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ الْاِسْتِخَارَةِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatal-istikhārati rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah istikharah dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'hajah',
    category: 'sunnah',
    name: 'Salat Hajat',
    rakaat: '2 hingga 12 Rakaat',
    timeInfo: 'Dapat dilakukan siang atau malam hari ketika sedang mengharapkan suatu hajat kebaikan atau menghadapi kesulitan hidup.',
    description: 'Salat sunnah yang dikerjakan saat seorang hamba memiliki keperluan atau hajat khusus, baik urusan duniawi yang baik maupun urusan ukhrawi.',
    variants: [
      {
        id: 'hajah-2-rakaat',
        name: 'Salat Hajat (2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ الْحَاجَةِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatal-haajati rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah hajat dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'tawbah',
    category: 'sunnah',
    name: 'Salat Tobat',
    rakaat: '2 Rakaat',
    timeInfo: 'Dapat dikerjakan kapan saja segera setelah menyadari kekhilafan atau dosa, di luar waktu makruh shalat.',
    description: 'Salat sunnah dua rakaat yang dikerjakan dengan penuh penyesalan atas dosa, diiringi istighfar dan tekad bulat untuk tidak mengulangi maksiat.',
    variants: [
      {
        id: 'tawbah-2-rakaat',
        name: 'Salat Tobat (2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ التَّوْبَةِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatat-taubati rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah tobat dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'eclipse',
    category: 'sunnah',
    name: 'Salat Gerhana (Kusuf & Khusuf)',
    rakaat: '2 Rakaat (Masing-masing dengan 2 kali ruku\')',
    timeInfo: 'Dikerjakan selama fenomena gerhana matahari (Kusuf) atau gerhana bulan (Khusuf) sedang berlangsung.',
    description: 'Salat sunnah mu\'akkad saat terjadi peristiwa gerhana. Memiliki tata cara khusus dengan 2 kali rukuk dan 2 kali berdiri membaca surat pada setiap rakaatnya.',
    variants: [
      {
        id: 'kusuf-matahari',
        name: 'Gerhana Matahari (Salat Kusuf)',
        arabic: 'أُصَلِّيْ سُنَّةَ كُسُوْفِ الشَّمْسِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnata kusuufisy-syamsi rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah gerhana matahari dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
        note: 'Jika berjamaah sebagai makmum ganti "adaa-an" dengan "ma\'muuman", jika imam gunakan "imaaman".'
      },
      {
        id: 'khusuf-bulan',
        name: 'Gerhana Bulan (Salat Khusuf)',
        arabic: 'أُصَلِّيْ سُنَّةَ خُسُوْفِ الْقَمَرِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnata khusuufil-qamari rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah gerhana bulan dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
        note: 'Jika berjamaah sebagai makmum ganti "adaa-an" dengan "ma\'muuman", jika imam gunakan "imaaman".'
      },
    ],
  },
  {
    id: 'tasbih',
    category: 'sunnah',
    name: 'Salat Tasbih',
    rakaat: '4 Rakaat (1 salam siang hari, atau 2 salam malam hari)',
    timeInfo: 'Dapat dikerjakan kapan saja (siang atau malam). Dianjurkan dikerjakan setiap hari, seminggu sekali, sebulan sekali, setahun sekali, atau seumur hidup sekali.',
    description: 'Salat sunnah dengan membaca kalimat tasbih sebanyak 300 kali sepanjang 4 rakaat (75 kali per rakaat).',
    variants: [
      {
        id: 'tasbih-4-rakaat',
        name: 'Salat Tasbih (4 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ التَّسْبِيْحِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatat-tasbiihi arba'a raka'aatin mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah tasbih empat rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'wudhu',
    category: 'sunnah',
    name: 'Salat Syukrul Wudhu',
    rakaat: '2 Rakaat',
    timeInfo: 'Dikerjakan langsung sesudah menyempurnakan wudhu dan membaca doa setelah wudhu.',
    description: 'Salat sunnah dua rakaat sebagai ungkapan syukur atas kesucian wudhu. Menjadi amalan sahabat Bilal bin Rabah r.a. yang terdengar derap sandalnya di surga.',
    variants: [
      {
        id: 'wudhu-2-rakaat',
        name: 'Salat Wudhu (2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ الْوُضُوْءِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatal-wudhuu-i rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah wudhu dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
    ],
  },
  {
    id: 'safar',
    category: 'sunnah',
    name: 'Salat Safar',
    rakaat: '2 Rakaat',
    timeInfo: 'Dikerjakan sebelum berangkat bepergian atau sesaat setelah tiba kembali dari perjalanan.',
    description: 'Salat sunnah dua rakaat untuk memohon keselamatan, kemudahan, dan perlindungan Allah SWT selama dalam perjalanan.',
    variants: [
      {
        id: 'safar-2-rakaat',
        name: 'Salat Safar (2 Rakaat)',
        arabic: 'أُصَلِّيْ سُنَّةَ السَّفَرِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلّٰهِ تَعَالَى',
        latin: "Ushallii sunnatas-safari rak'ataini mustaqbilal qiblati adaa-an lillaahi ta'aalaa.",
        translation: 'Aku niat shalat sunnah bepergian (safar) dua rakaat menghadap kiblat, tunai karena Allah Ta\'ala.',
      },
    ],
  },
];

export const getFardhuNiatList = () => NIAT_SHALAT_DATA.filter((item) => item.category === 'fardhu');

export const getSunnahNiatList = () => NIAT_SHALAT_DATA.filter((item) => item.category === 'sunnah');

export const getNiatById = (id: string) => NIAT_SHALAT_DATA.find((item) => item.id.toLowerCase() === id.toLowerCase());
