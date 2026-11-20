export interface ThaharahNiat {
  id: string;
  name: string;
  arabic: string;
  latin: string;
  translation: string;
  note?: string;
}

export interface ThaharahDalil {
  type: 'quran' | 'hadith' | 'kaidah';
  source: string;
  arabic: string;
  latin: string;
  translation: string;
  explanation?: string;
}

export interface ThaharahLegalRuling {
  topic: string;
  ruling: string;
  detail: string;
}

export interface ThaharahDetailItem {
  id: string;
  order: number;
  tab: 'wudu' | 'ghusl' | 'tayammum' | 'impurities';
  title: string;
  badge: string;
  badgeColor?: string;
  summary: string;
  timeInfo?: string;
  detailExplanation: string[];
  niatList?: ThaharahNiat[];
  doaList?: ThaharahNiat[];
  dalilList: ThaharahDalil[];
  legalRulings?: ThaharahLegalRuling[];
  rujukan: string[];
}

export const THAHARAH_DATA: ThaharahDetailItem[] = [
  // ==========================================
  // TAB 1: TATA CARA WUDHU (wudu)
  // ==========================================
  {
    id: 'wudu-niat-basmalah',
    order: 1,
    tab: 'wudu',
    title: 'Niat Wudhu & Membaca Basmalah',
    badge: 'Rukun & Sunnah',
    badgeColor: 'emerald',
    summary: 'Memulai wudhu dengan membaca basmalah dan menghadirkan niat di dalam hati untuk bersuci dari hadas kecil.',
    timeInfo: 'Niat dihadirkan di dalam hati bersamaan saat air pertama kali menyentuh bagian wajah.',
    detailExplanation: [
      'Niat adalah rukun pertama wudhu dalam mazhab Syafi\'i. Niat tempatnya di dalam hati, sedangkan melafalkannya dengan lisan adalah sunnah untuk memantapkan hati.',
      'Waktu niat: Dihadirkan di dalam hati berbarengan dengan basuhan pertama pada bagian wajah.',
      'Membaca Basmalah (Bismillāhir-rahmānir-rahīm) di awal sebelum membasuh tangan merupakan sunnah mu\'akkad yang sangat dianjurkan.',
      'Bagi penderita istihadhah atau beser (da\'imul hadats), niatnya adalah "listibāhatish shalāt" (untuk diperbolehkan shalat), bukan "liraf\'il hadats" (mengangkat hadas), dan dilakukan setelah masuk waktu shalat.'
    ],
    niatList: [
      {
        id: 'niat-wudhu-standar',
        name: 'Lafadz Niat Wudhu Standar',
        arabic: 'نَوَيْتُ الْوُضُوءَ لِرَفْعِ الْحَدَثِ الْأَصْغَرِ فَرْضًا لِلّٰهِ تَعَالَى',
        latin: "Nawaitul wudhū'a liraf'il hadatsil ashghari fardhan lillāhi ta'ālā.",
        translation: 'Aku berniat wudhu untuk mengangkat hadas kecil fardhu karena Allah Ta\'ala.',
        note: 'Diniatkan di dalam hati saat air pertama kali membasuh wajah.'
      },
      {
        id: 'niat-wudhu-dharurah',
        name: 'Lafadz Niat Wudhu Darurat (Istihadhah / Beser)',
        arabic: 'نَوَيْتُ الْوُضُوءَ لِاسْتِبَاحَةِ الصَّلَاةِ فَرْضًا لِلّٰهِ تَعَالَى',
        latin: "Nawaitul wudhū'a listibāhatish shalāti fardhan lillāhi ta'ālā.",
        translation: 'Aku berniat wudhu untuk membolehkan shalat fardhu karena Allah Ta\'ala.',
        note: 'Khusus bagi yang terus-menerus berhadas (da\'imul hadats) seperti istihadhah dan beser.'
      }
    ],
    doaList: [
      {
        id: 'doa-basmalah-wudhu',
        name: 'Bacaan Basmalah Sebelum Wudhu',
        arabic: 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ',
        latin: 'Bismillāhir-rahmānir-rahīm.',
        translation: 'Dengan menyebut nama Allah Yang Maha Pengasih lagi Maha Penyayang.',
        note: 'Dibaca di awal sebelum mulai mencuci kedua telapak tangan.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1) & Muslim (No. 1907)',
        arabic: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى',
        latin: "Innamal a'mālu bin-niyyāt, wa innamā likullim-ri'in mā nawā.",
        translation: 'Sesungguhnya setiap amal perbuatan tergantung pada niatnya, dan sesungguhnya setiap orang akan mendapatkan sesuai dengan apa yang dia niatkan.',
        explanation: 'Dalil utama bahwa niat merupakan pondasi sahnya wudhu dan seluruh ibadah.'
      },
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 101) & Ibnu Majah (No. 397)',
        arabic: 'لاَ وُضُوءَ لِمَنْ لَمْ يَذْكُرِ اسْمَ اللَّهِ عَلَيْهِ',
        latin: "Lā wudhū'a liman lam yadzkuris-mallāhi 'alaih.",
        translation: 'Tidak sempurna wudhu bagi orang yang tidak menyebut nama Allah (membaca basmalah) atasnya.',
        explanation: 'Penegasan sunnah mu\'akkad membaca bismillah saat mengawali wudhu.'
      }
    ],
    rujukan: ['Matan Safinatun Najah', 'Fathul Qarib Al-Mujib', 'Al-Majmu\' Syarah Al-Muhadzdzab - Imam Nawawi']
  },
  {
    id: 'wudu-mencuci-tangan',
    order: 2,
    tab: 'wudu',
    title: 'Mencuci Telapak Tangan & Menyela Jari',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'teal',
    summary: 'Membasuh kedua telapak tangan hingga pergelangan tangan sebanyak tiga kali serta menyela-nyela jemari.',
    timeInfo: 'Dilakukan di awal wudhu sebelum berkumur-kumur.',
    detailExplanation: [
      'Mencuci kedua telapak tangan hingga kedua pergelangan sebanyak 3 kali sebelum memasukkan tangan ke dalam bejana air.',
      'Hukumnya sunnah mu\'akkad, dan sangat ditekankan terutama saat baru bangun dari tidur.',
      'Disunnahkan menyela-nyela jemari tangan (takhlikil ashābi\') agar air merata ke seluruh sela-sela kulit.',
      'Jika seseorang yakin tangannya terkena najis, maka wajib membasuhnya terlebih dahulu sebelum menyentuh air wudhu.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 159) & Muslim (No. 226)',
        arabic: 'فَغَسَلَ كَفَّيْهِ ثَلاَثَ مَرَّاتٍ ثُمَّ مَضْمَضَ وَاسْتَنْثَرَ',
        latin: 'Faghasala kaffaihi tsalātsa marrātin tsumma madhmadha was-tantsar.',
        translation: 'Maka beliau (Utsman bin Affan saat mencontohkan wudhu Nabi SAW) membasuh kedua telapak tangannya tiga kali, kemudian berkumur-kumur dan menyemprotkan air dari hidung.',
        explanation: 'Riwayat shahih tata cara wudhu Rasulullah SAW yang dipraktikkan sahabat Utsman RA.'
      },
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 142) & At-Tirmidzi (No. 38)',
        arabic: 'وَخَلِّلْ بَيْنَ الأَصَابِعِ',
        latin: 'Wa khallil bainal-ashābi\'.',
        translation: 'Dan sela-selalah di antara jari-jemarimu.',
        explanation: 'Perintah Rasulullah SAW untuk menyela-nyela jari saat berwudhu.'
      }
    ],
    rujukan: ['Shahih Al-Bukhari', 'Al-Fiqh Al-Manhaji \'ala Madzhabil Imam Asy-Syafi\'i']
  },
  {
    id: 'wudu-berkumur-siwak',
    order: 3,
    tab: 'wudu',
    title: 'Berkumur-kumur (Madhmadhoh) & Bersiwak',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'teal',
    summary: 'Membersihkan mulut dengan memasukkan air, memutarnya di dalam rongga mulut, serta dianjurkan bersiwak.',
    timeInfo: 'Dilakukan 3 kali setelah membasuh telapak tangan.',
    detailExplanation: [
      'Madhmadhoh adalah memasukkan air ke dalam mulut lalu memutar-mutarnya dan membuangnya.',
      'Disunnahkan melakukannya sebanyak 3 kali dengan air yang baru pada setiap basuhan.',
      'Dianjurkan bersungguh-sungguh (mubalaghah) dalam berkumur-kumur kecuali bagi orang yang sedang menjalankan ibadah puasa agar air tidak tertelan.',
      'Sangat dianjurkan bersiwak (menggosok gigi) sebelum atau saat berkumur-kumur untuk membersihkan sisa makanan dan menyucikan aroma mulut.'
    ],
    doaList: [
      {
        id: 'doa-kumur-wudhu',
        name: 'Doa Saat Berkumur-kumur',
        arabic: 'اللّٰهُمَّ أَعِنِّي عَلَى تِلَاوَةِ كِتَابِكَ وَكَثْرَةِ الذِّكْرِ لَكَ وَالشُّكْرِ لَكَ',
        latin: "Allāhumma a'innī 'alā tilāwati kitābika wa katsratidz-dzikri laka wasy-syukri lak.",
        translation: 'Ya Allah, tolonglah aku untuk senantiasa membaca kitab suci-Mu, banyak berdzikir mengingat-Mu, dan bersyukur kepada-Mu.',
        note: 'Dibaca di dalam hati saat berkumur-kumur.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 887) & Muslim (No. 252)',
        arabic: 'لَوْلاَ أَنْ أَشُقَّ عَلَى أُمَّتِي لأَمَرْتُهُمْ بِالسِّوَاكِ عِنْدَ كُلِّ وُضُوءٍ',
        latin: "Laulā an asyuqqa 'alā ummatī la'amartuhum bis-siwāki 'inda kulli wudhū'.",
        translation: 'Sekiranya tidak memberatkan umatku, niscaya aku perintahkan mereka untuk bersiwak pada setiap kali berwudhu.',
        explanation: 'Keutamaan luar biasa membersihkan gigi dan mulut saat berwudhu.'
      }
    ],
    rujukan: ['Subulus Salam - Imam Ash-Shan\'ani', 'Kifayatul Akhyar']
  },
  {
    id: 'wudu-istinsyaq-istintsar',
    order: 4,
    tab: 'wudu',
    title: 'Menghirup Air ke Hidung (Istinsyaq) & Mengeluarkannya',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'teal',
    summary: 'Menghirup air ke dalam lubang hidung lalu menyemprotkannya kembali untuk membersihkan rongga pernapasan.',
    timeInfo: 'Dilakukan 3 kali berurutan setelah berkumur-kumur.',
    detailExplanation: [
      'Istinsyaq adalah menghirup air ke dalam rongga hidung menggunakan tangan kanan.',
      'Istintsar adalah menyemburkan atau mengeluarkan kembali air dari hidung dengan bantuan tangan kiri.',
      'Sunnah dilakukan sebanyak 3 kali berturut-turut.',
      'Cara paling utama menurut mazhab Syafi\'i: menggabungkan satu cidukan air untuk berkumur sekaligus menghirup ke hidung (al-jam\'u baina madhmadhoh wal istinsyāq).'
    ],
    doaList: [
      {
        id: 'doa-istinsyaq',
        name: 'Doa Saat Menghirup Air ke Hidung',
        arabic: 'اللّٰهُمَّ أَرِحْنِي رَائِحَةَ الْجَنَّةِ وَأَنْتَ عَنِّي رَاضٍ',
        latin: "Allāhumma arihnī rā'ihatal jannati wa anta 'annī rādh.",
        translation: 'Ya Allah, ciumkanlah kepadaku wewangian surga dalam keadaan Engkau ridha kepadaku.',
        note: 'Doa yang dianjurkan para ulama salaf.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 142) & An-Nasa\'i (No. 87)',
        arabic: 'وَبَالِغْ فِي الاِسْتِنْشَاقِ إِلاَّ أَنْ تَكُونَ صَائِمًا',
        latin: "Wa bāligh fil-istinsyāqi illā an takūna shā'imā.",
        translation: 'Dan bersungguh-sungguhlah kamu dalam menghirup air ke hidung, kecuali jika kamu sedang dalam keadaan berpuasa.',
        explanation: 'Anjuran membersihkan hidung secara mendalam ketika tidak sedang berpuasa.'
      }
    ],
    rujukan: ['Bidayatul Mujtahid - Ibnu Rusyd', 'Fathul Wahhab']
  },
  {
    id: 'wudu-membasuh-wajah',
    order: 5,
    tab: 'wudu',
    title: 'Membasuh Seluruh Wajah',
    badge: 'Rukun Wajib (Fardhu)',
    badgeColor: 'emerald',
    summary: 'Membasuh seluruh bagian wajah secara merata mulai dari tempat tumbuh rambut kepala hingga bawah dagu.',
    timeInfo: 'Rukun wajib pertama anggota tubuh, disertai niat di dalam hati.',
    detailExplanation: [
      'Batasan wajah secara vertikal (panjang): Dari tempat tumbuhnya rambut kepala normal hingga bagian bawah dagu (rahang bawah).',
      'Batasan wajah secara horizontal (lebar): Dari pangkal telinga kanan hingga pangkal telinga kiri.',
      'Kewajiban: Membasuh seluruh area wajah 1 kali secara merata adalah fardhu, mengulanginya hingga 3 kali adalah sunnah mu\'akkad.',
      'Jenggot tipis wajib dibasuh hingga ke kulit dasarnya. Jenggot tebal yang menutupi kulit cukup dibasuh bagian luarnya dan disunnahkan menyela-nyela bagian dalamnya.'
    ],
    doaList: [
      {
        id: 'doa-basuh-wajah',
        name: 'Doa Saat Membasuh Wajah',
        arabic: 'اللّٰهُمَّ بَيِّضْ وَجْهِي يَوْمَ تَبْيَضُّ وُجُوهٌ وَتَسْوَدُّ وُجُوهٌ',
        latin: 'Allāhumma bayyidh wajhī yauma tabyadh-dhu wujūhuw wa taswaddu wujūh.',
        translation: 'Ya Allah, putihkanlah (cemerlangkanlah) wajahku pada hari di mana wajah-wajah menjadi putih berseri dan wajah-wajah menjadi hitam legam.',
        note: 'Dibaca saat membasuh wajah.'
      }
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Ma\'idah: 6',
        arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا قُمْتُمْ إِلَى الصَّلَاةِ فَاغْسِلُوا وُجُوهَكُمْ',
        latin: "Yā ayyuhalladzīna āmanū idzā qumtum ilash-shalāti faghsilū wujūhakum.",
        translation: 'Wahai orang-orang yang beriman! Apabila kamu hendak melaksanakan shalat, maka basuhlah wajahmu...',
        explanation: 'Ayat Al-Qur\'an yang menjadi rujukan utama rukun fardhu wudhu.'
      }
    ],
    rujukan: ['Al-Umm - Imam Asy-Syafi\'i', 'Safinatun Najah']
  },
  {
    id: 'wudu-membasuh-tangan-siku',
    order: 6,
    tab: 'wudu',
    title: 'Membasuh Kedua Tangan Hingga Siku',
    badge: 'Rukun Wajib (Fardhu)',
    badgeColor: 'emerald',
    summary: 'Membasuh kedua tangan beserta lengan hingga melewati kedua siku, mendahulukan tangan kanan.',
    timeInfo: 'Dilakukan setelah membasuh wajah, sebanyak 3 kali untuk masing-masing tangan.',
    detailExplanation: [
      'Wajib membasuh tangan mulai dari ujung kuku dan jari-jemari hingga melewati kedua siku (al-marāfiq).',
      'Siku wajib terbasuh secara sempurna karena termasuk dalam batasan yang diperintahkan syariat.',
      'Mendahulukan tangan kanan sebanyak 3 kali basuhan merata, kemudian tangan kiri sebanyak 3 kali basuhan merata.',
      'Wajib menghilangkan segala kotoran di bawah kuku, cat kuku, lilin, atau minyak yang dapat menghalangi sampainya air ke kulit.'
    ],
    doaList: [
      {
        id: 'doa-tangan-kanan',
        name: 'Doa Membasuh Tangan Kanan',
        arabic: 'اللّٰهُمَّ أَعْطِنِي كِتَابِي بِيَمِينِي وَحَاسِبْنِي حِسَابًا يَسِيرًا',
        latin: "Allāhumma a'thinī kitābī biyamīnī wa hāsibnī hisābay yasīrā.",
        translation: 'Ya Allah, berikanlah buku catatan amalku dari sebelah kanan dan hisablah aku dengan hisab yang mudah.',
        note: 'Dibaca saat membasuh tangan kanan.'
      },
      {
        id: 'doa-tangan-kiri',
        name: 'Doa Membasuh Tangan Kiri',
        arabic: 'اللّٰهُمَّ لَا تُعْطِنِي كِتَابِي بِشِمَالِي وَلَا مِنْ وَرَاءِ ظَهْرِي',
        latin: "Allāhumma lā tu'thinī kitābī bisyimālī wa lā miw warā'i zhahrī.",
        translation: 'Ya Allah, janganlah Engkau berikan catatan amalku dari sebelah kiriku dan jangan pula dari belakang punggungku.',
        note: 'Dibaca saat membasuh tangan kiri.'
      }
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Ma\'idah: 6',
        arabic: 'وَأَيْدِيَكُمْ إِلَى الْمَرَافِقِ',
        latin: "Wa aidiyakum ilal-marāfiq.",
        translation: '...dan tanganmu sampai ke siku...',
        explanation: 'Kewajiban membasuh tangan beserta siku.'
      },
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 246) dari Abu Hurairah RA',
        arabic: 'غَسَلَ يَدَهُ الْيُمْنَى حَتَّى أَشْرَعَ فِي الْعَضُدِ، ثُمَّ الْيُسْرَى حَتَّى أَشْرَعَ فِي الْعَضُدِ',
        latin: "Ghasala yadahul yumnā hattā asyra'a fil-'adhud, tsummal yusrā hattā asyra'a fil-'adhud.",
        translation: 'Beliau membasuh tangan kanannya hingga mengenai pangkal lengan atas, kemudian tangan kirinya hingga mengenai pangkal lengan atas.',
        explanation: 'Sunnah membasuh melebihi batas siku untuk menyempurnakan cahaya wudhu di hari kiamat (ghurran muhajjalīn).'
      }
    ],
    rujukan: ['Fathul Qarib Al-Mujib', 'Kifayatul Akhyar']
  },
  {
    id: 'wudu-mengusap-kepala',
    order: 7,
    tab: 'wudu',
    title: 'Mengusap Sebagian / Seluruh Kepala',
    badge: 'Rukun Wajib (Fardhu)',
    badgeColor: 'emerald',
    summary: 'Membasahi tangan dengan air lalu mengusap sebagian atau seluruh permukaan rambut kepala.',
    timeInfo: 'Dilakukan setelah selesai membasuh kedua tangan.',
    detailExplanation: [
      'Menurut mazhab Syafi\'i, batas minimal kewajiban adalah mengusap sebagian kulit kepala atau sebagian rambut yang masih berada dalam batas kepala.',
      'Disunnahkan mengusap seluruh bagian kepala dengan cara menjalankan kedua telapak tangan basah dari arah depan kepala ke belakang tengkuk, lalu mengembalikannya lagi ke depan.',
      'Dilakukan sebanyak 3 kali dengan air yang baru.',
      'Bagi wanita atau pria yang mengenakan penutup kepala yang sulit dilepas, boleh mengusap bagian depan ubun-ubun lalu menyempurnakan usapannya di atas penutup kepala.'
    ],
    doaList: [
      {
        id: 'doa-usap-kepala',
        name: 'Doa Saat Mengusap Kepala',
        arabic: 'اللّٰهُمَّ حَرِّمْ شَعْرِي وَبَشَرِي عَلَى النَّارِ وَأَظِلَّنِي تَحْتَ ظِلِّ عَرْشِكَ',
        latin: "Allāhumma harrim sya'rī wa basyarī 'alan-nāri wa azhillanī tahta zhilli 'arsyik.",
        translation: 'Ya Allah, haramkanlah rambutku dan kulitku dari jilatan api neraka, dan naungilah aku di bawah naungan Arsy-Mu.',
        note: 'Dibaca saat mengusap rambut kepala.'
      }
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Ma\'idah: 6',
        arabic: 'وَامْسَحُوا بِرُءُوسِكُمْ',
        latin: "Wamsahū biru'ūsikum.",
        translation: '...dan sapulah (usaplah) kepalamu...',
        explanation: 'Perintah mengusap kepala dalam ayat wudhu.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 185) & Muslim (No. 235)',
        arabic: 'بَدَأَ بِمُقَدَّمِ رَأْسِهِ حَتَّى ذَهَبَ بِهِمَا إِلَى قَفَاهُ، ثُمَّ رَدَّهُمَا إِلَى الْمَكَانِ الَّذِي بَدَأَ مِنْهُ',
        latin: "Bada'a bimuqaddami ra'sihī hattā dzahaba bihimā ilā qafāh, tsumma raddahumā ilal-makānilladzī bada'a minh.",
        translation: 'Rasulullah SAW memulai dari bagian depan kepalanya hingga membawa kedua tangannya ke tengkuknya, kemudian mengembalikannya lagi ke tempat beliau memulai.',
        explanation: 'Praktik sunnah mengusap seluruh kepala.'
      }
    ],
    rujukan: ['Al-Majmu\' Syarah Al-Muhadzdzab', 'Matan Taqrib']
  },
  {
    id: 'wudu-mengusap-telinga',
    order: 8,
    tab: 'wudu',
    title: 'Mengusap Kedua Telinga (Luar & Dalam)',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'teal',
    summary: 'Mengusap bagian luar dan lekukan dalam daun kedua telinga secara bersamaan dengan air baru.',
    timeInfo: 'Dilakukan 3 kali setelah mengusap kepala.',
    detailExplanation: [
      'Hukum mengusap kedua telinga adalah sunnah mu\'akkad dalam mazhab Syafi\'i.',
      'Cara mengusap: Memasukkan kedua jari telunjuk yang telah dibasahi ke dalam lekukan daun telinga, dan mengusap bagian belakang daun telinga dengan kedua ibu jari.',
      'Dilakukan secara bersamaan untuk telinga kanan dan kiri sebanyak 3 kali.',
      'Menggunakan air yang baru, bukan sisa air bekas mengusap kepala.'
    ],
    doaList: [
      {
        id: 'doa-usap-telinga',
        name: 'Doa Saat Mengusap Telinga',
        arabic: 'اللّٰهُمَّ اجْعَلْنِي مِنَ الَّذِينَ يَسْتَمِعُونَ الْقَوْلَ فَيَتَّبِعُونَ أَحْسَنَهُ',
        latin: "Allāhummaj-'alnī minalladzīna yastami'ūnal-qaula fayattabi'ūna ahsanah.",
        translation: 'Ya Allah, jadikanlah aku termasuk orang-orang yang mendengarkan perkataan lalu mengikuti apa yang terbaik di antaranya.',
        note: 'Dibaca saat mengusap kedua telinga.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 135) & At-Tirmidzi (No. 36)',
        arabic: 'الأُذُنَانِ مِنَ الرَّأْسِ',
        latin: "Al-udzunāni minar-ra's.",
        translation: 'Kedua telinga itu adalah bagian dari kepala.',
        explanation: 'Hadits shahih yang menegaskan pensyariatan mengusap kedua telinga.'
      }
    ],
    rujukan: ['Sunan Abi Dawud', 'Fathul Mu\'in']
  },
  {
    id: 'wudu-membasuh-kaki-matakaki',
    order: 9,
    tab: 'wudu',
    title: 'Membasuh Kedua Kaki Hingga Mata Kaki',
    badge: 'Rukun Wajib (Fardhu)',
    badgeColor: 'emerald',
    summary: 'Membasuh kedua kaki beserta tumit hingga melewati mata kaki, serta menyela jemari kaki.',
    timeInfo: 'Rukun wajib terakhir dari anggota tubuh wudhu.',
    detailExplanation: [
      'Wajib membasuh kaki mulai dari ujung jemari hingga melewati kedua mata kaki (al-ka\'bain).',
      'Tumit, lekukan telapak kaki, dan mata kaki harus terbasahi secara sempurna.',
      'Mendahulukan kaki kanan 3 kali basuhan merata, kemudian kaki kiri 3 kali.',
      'Disunnahkan menyela-nyela jemari kaki menggunakan jari kelingking tangan kiri dimulai dari kelingking kaki kanan hingga kelingking kaki kiri.'
    ],
    doaList: [
      {
        id: 'doa-kaki-wudhu',
        name: 'Doa Saat Membasuh Kaki',
        arabic: 'اللّٰهُمَّ ثَبِّتْ قَدَمَيَّ عَلَى الصِّرَاطِ يَوْمَ تَزِلُّ فِيهِ الْأَقْدَامُ',
        latin: 'Allāhumma tsabbit qadamayya \'alash-shirāthi yauma tazillu fīhil-aqdām.',
        translation: 'Ya Allah, kokohkanlah kedua telapak kakiku di atas jembatan shirath pada hari di mana telapak-telapak kaki tergelincir (ke dalam neraka).',
        note: 'Dibaca saat membasuh kedua belah kaki.'
      }
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Ma\'idah: 6',
        arabic: 'وَأَرْجُلَكُمْ إِلَى الْكَعْبَيْنِ',
        latin: "Wa arjulakum ilal-ka'bain.",
        translation: '...dan (basuhlah) kakimu sampai ke kedua mata kaki...',
        explanation: 'Kewajiban fardhu membasuh kaki hingga kedua mata kaki.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 165) & Muslim (No. 241)',
        arabic: 'وَيْلٌ لِلأَعْقَابِ مِنَ النَّارِ',
        latin: "Wailul-lil-a'qābi minan-nār.",
        translation: 'Celakalah bagi tumit-tumit (yang tidak terbasuh air wudhu) dari siksa api neraka!',
        explanation: 'Peringatan keras Rasulullah SAW agar membasuh tumit dan kaki secara sempurna.'
      }
    ],
    rujukan: ['Shahih Al-Bukhari', 'Safinatun Najah']
  },
  {
    id: 'wudu-tertib-berurutan',
    order: 10,
    tab: 'wudu',
    title: 'Tertib (Menjalankan Rukun Berurutan)',
    badge: 'Rukun Wajib (Fardhu)',
    badgeColor: 'emerald',
    summary: 'Melakukan seluruh rukun wudhu secara berurutan sesuai urutan yang ditentukan syariat.',
    timeInfo: 'Berurutan dari Niat & Wajah -> Tangan -> Kepala -> Kaki.',
    detailExplanation: [
      'Tertib adalah rukun terakhir yang mewajibkan pelaksanaan rukun-rukun wudhu secara berurutan.',
      'Urutan yang sah: (1) Niat & membasuh wajah, (2) Membasuh kedua tangan beserta siku, (3) Mengusap kepala, (4) Membasuh kedua kaki beserta mata kaki.',
      'Jika seseorang membasuh kaki sebelum membasuh tangan dengan sengaja atau lupa, maka basuhan kakinya tidak sah dan harus diulang dari urutan yang terlewat.',
      'Disunnahkan Muwalah (nirlangsung / bersambung): yaitu membasuh anggota tubuh berikutnya sebelum anggota tubuh sebelumnya kering.'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Ma\'idah: 6',
        arabic: 'إِذَا قُمْتُمْ إِلَى الصَّلَاةِ فَاغْسِلُوا وُجُوهَكُمْ وَأَيْدِيَكُمْ إِلَى الْمَرَافِقِ وَامْسَحُوا بِرُءُوسِكُمْ وَأَرْجُلَكُمْ إِلَى الْكَعْبَيْنِ',
        latin: "Idzā qumtum ilash-shalāti faghsilū wujūhakum wa aidiyakum ilal-marāfiqi wamsahū biru'ūsikum wa arjulakum ilal-ka'bain.",
        translation: '...maka basuhlah wajahmu dan tanganmu sampai ke siku, dan sapulah kepalamu dan (basuh) kakimu sampai ke kedua mata kaki...',
        explanation: 'Susunan urutan ayat Al-Qur\'an yang menyebutkan rukun-rukun wudhu secara berurutan menjadi dalil fardhunya tertib.'
      }
    ],
    rujukan: ['Al-Umm - Imam Asy-Syafi\'i', 'Al-Fiqh Al-Manhaji']
  },
  {
    id: 'wudu-doa-setelah-wudhu',
    order: 11,
    tab: 'wudu',
    title: 'Doa Lengkap Setelah Selesai Wudhu',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'emerald',
    summary: 'Menghadap kiblat, mengangkat kedua tangan, dan membaca syahadat serta doa permohonan kesucian.',
    timeInfo: 'Dibaca setelah selesai membasuh kaki dan rampung berwudhu.',
    detailExplanation: [
      'Disunnahkan setelah berwudhu untuk berdiri menghadap kiblat dan mengangkat kedua tangan ke arah langit.',
      'Membaca syahadat tauhid dan syahadat rasul serta doa memohon dijadikan hamba yang bertaubat dan menyucikan diri.',
      'Keutamaan spektakuler: Dibukakan baginya delapan pintu surga dan ia dipersilakan masuk dari pintu mana saja yang ia kehendaki.',
      'Dilanjutkan dengan mendirikan shalat sunnah Syukrul Wudhu dua rakaat.'
    ],
    doaList: [
      {
        id: 'doa-setelah-wudhu-lengkap',
        name: 'Doa Sesudah Wudhu Lengkap',
        arabic: 'أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا اللّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ، وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ. اللّٰهُمَّ اجْعَلْنِي مِنَ التَّوَّابِينَ، وَاجْعَلْنِي مِنَ الْمُتَطَهِّرِينَ، وَاجْعَلْنِي مِنْ عِبَادِكَ الصَّالِحِينَ. سُبْحَانَكَ اللّٰهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا أَنْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ',
        latin: "Asyhadu allā ilāha illallāhu wahdahū lā syarīka lah, wa asyhadu anna Muhammadan 'abduhū wa rasūluh. Allāhummaj-'alnī minat-tawwābīna, waj-'alnī minal-mutathahhirīna, waj-'alnī min 'ibādikash-shālihīn. Subhānakallāhumma wa bihamdika, asyhadu allā ilāha illā anta, astaghfiruka wa atūbu ilaik.",
        translation: 'Aku bersaksi bahwa tiada tuhan selain Allah Yang Maha Esa tiada sekutu bagi-Nya, dan aku bersaksi bahwa Muhammad adalah hamba dan utusan-Nya. Ya Allah, jadikanlah aku termasuk golongan orang-orang yang bertaubat, jadikanlah aku termasuk golongan orang-orang yang menyucikan diri, dan jadikanlah aku termasuk hamba-hamba-Mu yang shalih. Maha Suci Engkau ya Allah dengan memuji-Mu, aku bersaksi tiada tuhan selain Engkau, aku memohon ampunan-Mu dan bertaubat kepada-Mu.',
        note: 'Dibaca menghadap kiblat setelah selesai wudhu.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 234) dari Umar bin Khattab RA',
        arabic: 'مَا مِنْكُمْ مِنْ أَحَدٍ يَتَوَضَّأُ فَيُبْلِغُ أَو فَيُسْبِغُ الْوَضُوءَ ثُمَّ يَقُولُ: أَشْهَدُ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ... إِلاَّ فُتِحَتْ لَهُ أَبْوَابُ الْجَنَّةِ الثَّمَانِيَةُ يَدْخُلُ مِنْ أَيِّهَا شَاءَ',
        latin: "Mā minkum min ahadin yatawadh-dha'u fayublighu au fayusbighul-wudhū'a tsumma yaqūlu: Asyhadu allā ilāha illallāh... Illā futihat lahū abwābul-jannatis-tsamāniyatu yadkhulu min ayyihā syā'.",
        translation: 'Tidaklah salah seorang di antara kalian berwudhu lalu menyempurnakan wudhunya kemudian membaca: "Asyhadu allā ilāha illallāh...", melainkan dibukakan baginya delapan pintu surga, ia bebas masuk dari pintu mana saja yang ia sukai.',
        explanation: 'Keutamaan agung membaca doa setelah menyempurnakan wudhu.'
      }
    ],
    rujukan: ['Shahih Muslim', 'Sunan At-Tirmidzi (No. 55)', 'Riyadhus Shalihin']
  },
  {
    id: 'wudu-pembatal-wudhu',
    order: 12,
    tab: 'wudu',
    title: 'Hal-Hal yang Membatalkan Wudhu',
    badge: 'Fiqih Pembatal (Nawaqidh)',
    badgeColor: 'rose',
    summary: 'Empat perkara pokok yang membatalkan kesucian wudhu menurut mazhab Syafi\'i.',
    timeInfo: 'Bila terjadi salah satu perkara ini, wajib mengulang wudhu sebelum mendirikan shalat.',
    detailExplanation: [
      '1. Keluarnya sesuatu dari salah satu dua jalan (qubul atau dubur), baik berupa air kencing, kotoran (tinja), angin (kentut), mani, madzi, wadi, darah, maupun benda lainnya (kecuali mani menurut satu pendapat yang mewajibkan mandi).',
      '2. Hilangnya akal atau kesadaran, baik karena tidur yang tidak mantap duduknya di lantai, pingsan, mabuk, gila, atau pengaruh obat bius.',
      '3. Bersentuhan kulit antara laki-laki dan perempuan yang bukan mahram (ajnabiyyah), keduanya telah mencapai usia dewasa/syahwat, dan tanpa adanya penghalang (kain/busana) menurut mazhab Syafi\'i.',
      '4. Menyentuh kemaluan manusia (qubul) atau lingkaran dubur dengan bagian dalam telapak tangan atau jari-jemari tanpa penghalang, baik kemaluan sendiri maupun orang lain, anak kecil maupun dewasa.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 135) & Muslim (No. 225)',
        arabic: 'لاَ يَقْبَلُ اللَّهُ صَلاَةَ أَحَدِكُمْ إِذَا أَحْدَثَ حَتَّى يَتَوَضَّأَ',
        latin: "Lā yaqbalullāhu shalāta ahadikum idzā ahdatsa hattā yatawadh-dha'.",
        translation: 'Allah tidak menerima shalat salah seorang di antara kalian apabila ia berhadas hingga ia berwudhu kembali.',
        explanation: 'Kewajiban berwudhu kembali saat terjadi pembatal wudhu.'
      },
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 181), At-Tirmidzi (No. 82), & Ibnu Majah (No. 479)',
        arabic: 'مَنْ مَسَّ ذَكَرَهُ فَلْيَتَوَضَّأْ',
        latin: "Man massa dzakarahū falyatawadh-dha'.",
        translation: 'Barangsiapa yang menyentuh kemaluannya maka hendaklah ia berwudhu.',
        explanation: 'Dalil batalnya wudhu karena menyentuh kemaluan dengan telapak tangan.'
      }
    ],
    rujukan: ['Matan Safinatun Najah', 'Fathul Qarib Al-Mujib', 'Al-Majmu\' Syarah Al-Muhadzdzab']
  },

  // ==========================================
  // TAB 2: MANDI WAJIB (ghusl)
  // ==========================================
  {
    id: 'ghusl-sebab-mandi',
    order: 1,
    tab: 'ghusl',
    title: 'Sebab-Sebab Diwajibkannya Mandi Besar',
    badge: 'Ketentuan Pokok (Wajib)',
    badgeColor: 'emerald',
    summary: 'Enam keadaan yang mewajibkan seorang muslim melakukan mandi besar (ghusl) untuk mengangkat hadas besar.',
    timeInfo: 'Wajib ditunaikan sebelum melaksanakan ibadah yang mensyaratkan kesucian (shalat, thawaf, menyentuh mushaf).',
    detailExplanation: [
      'Tiga sebab yang berlaku bagi laki-laki dan perempuan:',
      '1. Keluarnya air mani (sperma/ovum) disertai kenikmatan (syahwat) atau memancar, baik dalam keadaan terjaga maupun mimpi basah.',
      '2. Hubungan seksual / bersetubuh (jimak), yaitu masuknya ujung kemaluan (hasyafah) ke dalam farji meskipun tidak keluar mani.',
      '3. Kematian (meninggal dunia), kecuali orang yang mati syahid di medan perang fi sabilillah.',
      'Tiga sebab yang khusus berlaku bagi wanita:',
      '4. Selesainya masa haid (darah menstruasi bulanan telah berhenti).',
      '5. Selesainya masa nifas (darah setelah melahirkan telah berhenti sempurna, maksimal 60 hari).',
      '6. Wiladah (melahirkan anak), baik melahirkan secara normal maupun operasi sesar, dan meskipun berupa gumpalan darah (\'alaqah).'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Ma\'idah: 6',
        arabic: 'وَإِنْ كُنْتُمْ جُنُبًا فَاطَّهَّرُوا',
        latin: "Wa in kuntum junuban fath-thahharū.",
        translation: '...dan jika kamu junub maka mandilah (bersucilah)...',
        explanation: 'Perintah qath\'i Al-Qur\'an untuk mandi wajib saat berkeadaan junub.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 291) & Muslim (No. 348)',
        arabic: 'إِذَا جَلَسَ بَيْنَ شُعَبِهَا الأَرْبَعِ ثُمَّ جَهَدَهَا فَقَدْ وَجَبَ الْغُسْلُ، أَنْزَلَ أَوْ لَمْ يُنْزِلْ',
        latin: "Idzā jalasa baina syu'abihal-arba'i tsumma jahadahā faqad wajabal-ghusl, anzala au lam yunzil.",
        translation: 'Apabila seorang laki-laki telah duduk di antara empat anggota badan perempuan lalu menyetubuhinya, maka sungguh wajib mandi baginya, baik keluar mani maupun tidak.',
        explanation: 'Kewajiban mandi akibat hubungan biologis.'
      }
    ],
    rujukan: ['Matan Safinatun Najah', 'Kifayatul Akhyar - Imam Taqiyuddin Al-Hishni']
  },
  {
    id: 'ghusl-niat-mandi',
    order: 2,
    tab: 'ghusl',
    title: 'Lafadz Niat Mandi Wajib (Janabah, Haid, Nifas)',
    badge: 'Rukun Wajib (Fardhu)',
    badgeColor: 'emerald',
    summary: 'Niat mandi wajib yang dihadirkan di dalam hati bersamaan saat air pertama kali menyentuh anggota badan.',
    timeInfo: 'Dihadirkan di dalam hati pada permulaan basuhan pertama air mandi.',
    detailExplanation: [
      'Niat adalah rukun pertama mandi wajib. Tanpa niat, mandi seseorang hanya menjadi mandi biasa untuk menyegarkan badan dan hadas besarnya belum terangkat.',
      'Tempat niat adalah di dalam hati, melafalkannya dengan lisan hukumnya sunnah.',
      'Waktu niat: Dihadirkan di dalam hati pada detik pertama saat air menyentuh bagian tubuh mana saja (kepala, tangan, atau badan).',
      'Niat harus disesuaikan dengan jenis hadas besar yang dialami (junub, haid, nifas, atau hadas besar secara umum).'
    ],
    niatList: [
      {
        id: 'niat-mandi-junub',
        name: 'Niat Mandi Janabah / Junub (Laki-laki & Wanita)',
        arabic: 'نَوَيْتُ الْغُسْلَ لِرَفْعِ الْحَدَثِ الْأَكْبَرِ عَنْ جَمِيعِ الْبَدَنِ فَرْضًا لِلّٰهِ تَعَالَى',
        latin: "Nawaitul ghusla liraf'il hadatsil akbari 'an jamī'il badani fardhan lillāhi ta'ālā.",
        translation: 'Aku berniat mandi untuk mengangkat hadas besar dari seluruh tubuh fardhu karena Allah Ta\'ala.',
        note: 'Bisa digunakan untuk semua jenis hadas besar (junub, mimpi basah, dll).'
      },
      {
        id: 'niat-mandi-haid',
        name: 'Niat Mandi Setelah Selesai Haid',
        arabic: 'نَوَيْتُ الْغُسْلَ لِرَفْعِ حَدَثِ الْحَيْضِ فَرْضًا لِلّٰهِ تَعَالَى',
        latin: "Nawaitul ghusla liraf'i hadatsil haidhi fardhan lillāhi ta'ālā.",
        translation: 'Aku berniat mandi untuk mengangkat hadas haid fardhu karena Allah Ta\'ala.',
        note: 'Khusus wanita setelah darah haid bersih sempurna.'
      },
      {
        id: 'niat-mandi-nifas',
        name: 'Niat Mandi Setelah Selesai Nifas / Melahirkan',
        arabic: 'نَوَيْتُ الْغُسْلَ لِرَفْعِ حَدَثِ النِّفَاسِ فَرْضًا لِلّٰهِ تَعَالَى',
        latin: "Nawaitul ghusla liraf'i hadatsin-nifāsi fardhan lillāhi ta'ālā.",
        translation: 'Aku berniat mandi untuk mengangkat hadas nifas fardhu karena Allah Ta\'ala.',
        note: 'Khusus wanita setelah darah nifas melahirkan berhenti tuntas.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1) & Muslim (No. 1907)',
        arabic: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى',
        latin: "Innamal a'mālu bin-niyyāt, wa innamā likullim-ri'in mā nawā.",
        translation: 'Sesungguhnya setiap amal perbuatan tergantung pada niatnya, dan setiap orang akan diganjar sesuai apa yang dia niatkan.',
        explanation: 'Keharusan niat sebagai pembeda ibadah mandi besar dari mandi biasa.'
      }
    ],
    rujukan: ['Fathul Qarib Al-Mujib', 'Al-Majmu\' Syarah Al-Muhadzdzab']
  },
  {
    id: 'ghusl-tata-cara-sempurna',
    order: 3,
    tab: 'ghusl',
    title: 'Tata Cara Mandi Wajib Sesuai Sunnah Rasulullah',
    badge: 'Rukun & Sunnah Lengkap',
    badgeColor: 'emerald',
    summary: 'Panduan lengkap langkah demi langkah mandi wajib mulai dari basmalah, wudhu, hingga meratakan air ke seluruh badan.',
    timeInfo: 'Dikerjakan secara tertib dan menyeluruh.',
    detailExplanation: [
      'RUKUN MANDI WAJIB (hanya ada 2 hal yang mutlak wajib):',
      '1. Niat di dalam hati pada basuhan pertama.',
      '2. Meratakan air suci menyucikan ke SELURUH bagian luar tubuh (kulit, rambut, kuku, lipatan tubuh) tanpa terkecuali.',
      'TATA CARA SUNNAH LENGKAP RASULULLAH SAW (Sempurna & Berpahala Besar):',
      'Langkah 1: Membaca Basmalah dan mencuci kedua telapak tangan 3 kali.',
      'Langkah 2: Membersihkan kemaluan, dubur, dan kotoran/najis di tubuh menggunakan tangan kiri.',
      'Langkah 3: Mencuci tangan kiri dengan sabun atau menggosokkannya ke lantai/dinding.',
      'Langkah 4: Berwudhu secara sempurna sebagaimana wudhu untuk shalat.',
      'Langkah 5: Membasahi jari-jemari tangan lalu menyela-nyela pangkal rambut kepala hingga air merata ke kulit kepala.',
      'Langkah 6: Mengguyur air ke atas kepala sebanyak 3 kali.',
      'Langkah 7: Mengguyur dan meratakan air ke seluruh tubuh dimulai dari sisi kanan kemudian sisi kiri.',
      'Langkah 8: Menggosok badan (dalk) dan memastikan air membasahi lipatan tubuh: ketiak, pusar, belakang lutut, sela jemari, dan lubang telinga luar.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 248) & Muslim (No. 316) dari Aisyah RA',
        arabic: 'كَانَ رَسُولُ اللَّهِ إِذَا اغْتَسَلَ مِنَ الْجَنَابَةِ يَبْدَأُ فَيَغْسِلُ يَدَيْهِ، ثُمَّ يُفْرِغُ بِيَمِينِهِ عَلَى شِمَالِهِ فَيَغْسِلُ فَرْجَهُ، ثُمَّ يَتَوَضَّأُ وُضُوءَهُ لِلصَّلاَةِ، ثُمَّ يَأْخُذُ الْمَاءَ فَيُدْخِلُ أَصَابِعَهُ فِي أُصُولِ الشَّعْرِ، حَتَّى إِذَا رَأَى أَنْ قَدِ اسْتَبْرَأَ حَفَنَ عَلَى رَأْسِهِ ثَلاَثَ حَفَنَاتٍ، ثُمَّ أَفَاضَ عَلَى سَائِرِ جَسَدِهِ',
        latin: "Kāna rasūlullāhi idzagh-tasala minal-janābati yabda'u fayaghsilu yadaih, tsumma yufrighu biyamīnihī 'alā syimālihī fayaghsilu farjah, tsumma yatawadh-dha'u wudhū'ahū lish-shalāh, tsumma ya'khudzul-mā'a fayudkhilu ashābi'ahū fī ushūlisy-sya'r, hattā idzā ra'ā an qadistabra'a hafana 'alā ra'sihī tsalātsa hafanāt, tsumma afādha 'alā sā'iri jasadif.",
        translation: 'Adalah Rasulullah SAW apabila mandi janabah, beliau mulai dengan membasuh kedua tangannya, kemudian menuangkan air dari tangan kanan ke tangan kirinya lalu membasuh kemaluannya, kemudian berwudhu sebagaimana wudhu untuk shalat, kemudian mengambil air dan memasukkan jari-jarinya ke pangkal-pangkal rambut hingga ketika beliau merasa telah merata, beliau menuangkan tiga cidukan air di atas kepalanya, kemudian meratakan air ke seluruh tubuhnya.',
        explanation: 'Hadits shahih pokok panduan tata cara mandi junub Rasulullah SAW.'
      }
    ],
    rujukan: ['Shahih Al-Bukhari', 'Shahih Muslim', 'Bulughul Maram - Ibnu Hajar Al-Asqalani']
  },
  {
    id: 'ghusl-mandi-sunnah',
    order: 4,
    tab: 'ghusl',
    title: 'Mandi-Mandi yang Disunnahkan (Ghusl Masnun)',
    badge: 'Sunnah Mu\'akkad & Mustahab',
    badgeColor: 'teal',
    summary: 'Berbagai jenis mandi sunnah yang dianjurkan dalam Islam sebelum momen ibadah atau perjumpaan umat.',
    timeInfo: 'Dikerjakan menjelang waktu shalat atau ibadah terkait.',
    detailExplanation: [
      '1. Mandi Shalat Jumat: Sunnah mu\'akkad bagi setiap orang yang hendak menghadiri shalat Jumat.',
      '2. Mandi Hari Raya Idul Fitri & Hari Raya Idul Adha: Disunnahkan di pagi hari sebelum berangkat ke tempat shalat id.',
      '3. Mandi Shalat Gerhana (Gerhana Matahari / Bulan) dan Mandi Shalat Istisqa\' (Minta Hujan).',
      '4. Mandi setelah selesai memandikan jenazah.',
      '5. Mandi sebelum berihram untuk ibadah Haji atau Umrah di Miqat.',
      '6. Mandi saat hendak memasuki kota suci Makkah dan mandi untuk wukuf di padang Arafah.',
      '7. Mandi bagi orang kafir yang baru masuk Islam (mualaf).'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 877) & Muslim (No. 844)',
        arabic: 'إِذَا جَاءَ أَحَدُكُمُ الْجُمُعَةَ فَلْيَغْتَسِلْ',
        latin: "Idzā jā'a ahadukumul-jumu'ata falyaghtasil.",
        translation: 'Apabila salah seorang di antara kalian hendak mendatangi shalat Jumat, maka hendaklah ia mandi.',
        explanation: 'Anjuran sunnah mandi shalat Jumat.'
      },
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 3161) & At-Tirmidzi (No. 993)',
        arabic: 'مَنْ غَسَّلَ الْمَيِّتَ فَلْيَغْتَسِلْ',
        latin: "Man ghassalal-mayyita falyaghtasil.",
        translation: 'Barangsiapa yang memandikan mayat maka hendaklah ia mandi.',
        explanation: 'Sunnah mandi setelah selesai memandikan jenazah.'
      }
    ],
    rujukan: ['Al-Fiqh Al-Manhaji', 'Matan Abi Syuja\'']
  },
  {
    id: 'ghusl-larangan-junub',
    order: 5,
    tab: 'ghusl',
    title: 'Larangan Bagi Orang yang Sedang Berhadas Besar',
    badge: 'Hukum Larangan (Haram)',
    badgeColor: 'rose',
    summary: 'Perbuatan-perbuatan ibadah yang diharamkan dilakukan oleh orang yang sedang berstatus hadas besar.',
    timeInfo: 'Berlaku sejak berhadas besar hingga selesai mandi wajib secara sempurna.',
    detailExplanation: [
      'Larangan bagi yang berhadas besar secara umum (Junub/Janabah):',
      '1. Mendirikan Shalat (baik shalat fardhu maupun shalat sunnah, serta sujud tilawah dan sujud syukur).',
      '2. Melakukan Thawaf mengelilingi Ka\'bah (thawaf fardhu maupun sunnah).',
      '3. Menyentuh dan membawa Mushaf Al-Qur\'an.',
      '4. Melafalkan atau membaca ayat-ayat Al-Qur\'an dengan niat membaca Al-Qur\'an (tilawah). Boleh membaca dzikir/doa yang kebetulan berasal dari ayat Qur\'an seperti membaca bismillah atau inna lillahi.',
      '5. Berdiam diri atau duduk di dalam masjid (al-labtsu fil masjid). Boleh sekadar lewat melintas bila ada keperluan mendesak.',
      'Tambahan larangan khusus bagi wanita yang sedang Haid dan Nifas:',
      '6. Berpuasa (fardhu Ramadan maupun sunnah) — wajib mengqadha puasa Ramadan setelah suci.',
      '7. Berhubungan intim (jimak / penetrasi) suami-istri.',
      '8. Dijatuhi talak oleh suami (talak bid\'i yang berdosa bagi suami).'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. An-Nisa: 43',
        arabic: 'لَا تَقْرَبُوا الصَّلَاةَ وَأَنْتُمْ سُكَارَىٰ حَتَّىٰ تَعْلَمُوا مَا تَقُولُونَ وَلَا جُنُبًا إِلَّا عَابِرِي سَبِيلٍ حَتَّىٰ تَغْتَسِلُوا',
        latin: "Lā taqrabush-shalāta wa antum sukārā hattā ta'lamū mā taqūlūn, wa lā junuban illā 'ābirī sabīlin hattā taghtasilū.",
        translation: 'Janganlah kamu mendekati shalat ketika kamu dalam keadaan mabuk sampai kamu sadar apa yang kamu ucapkan, dan jangan pula ketika kamu dalam keadaan junub kecuali sekadar berlalu lewat sampai kamu mandi...',
        explanation: 'Larangan mendekati shalat dan berdiam di masjid bagi orang junub.'
      },
      {
        type: 'quran',
        source: 'QS. Al-Waqi\'ah: 79',
        arabic: 'لَا يَمَسُّهُ إِلَّا الْمُطَهَّرُونَ',
        latin: "Lā yamassuhū illal-muthahharūn.",
        translation: 'Tidak ada yang menyentuhnya selain hamba-hamba yang disucikan.',
        explanation: 'Dasar larangan menyentuh mushaf Al-Qur\'an dalam keadaan berhadas.'
      }
    ],
    rujukan: ['Bidayatul Mujtahid - Ibnu Rusyd', 'Fathul Wahhab - Syaikh Zakariya Al-Anshari']
  },

  // ==========================================
  // TAB 3: PANDUAN TAYAMUM (tayammum)
  // ==========================================
  {
    id: 'tayammum-syarat-sebab',
    order: 1,
    tab: 'tayammum',
    title: 'Syarat & Sebab Diperbolehkannya Tayammum',
    badge: 'Syarat Sah & Keringanan',
    badgeColor: 'amber',
    summary: 'Ketentuan kondisi darurat yang membolehkan seorang muslim bersuci dengan tanah/debu menggantikan air.',
    timeInfo: 'Dilakukan setelah masuk waktu shalat dan setelah berusaha mencari air.',
    detailExplanation: [
      'Tayammum adalah rukhsah (keringanan) syariat untuk bersuci menggunakan debu yang suci sebagai pengganti wudhu atau mandi wajib saat ada uzur syar\'i.',
      'Sebab-sebab yang membolehkan tayammum:',
      '1. Tidak adanya air secara nyata setelah berusaha mencarinya ke sekeliling tempat persinggahan.',
      '2. Sakit atau luka yang apabila terkena air dapat memperparah penyakit, memperlambat kesembuhan, atau membahayakan nyawa menurut petunjuk medis terpercaya.',
      '3. Cuaca yang sangat dingin menusuk dan tidak ada sarana untuk menghangatkan air sehingga dikhawatirkan sakit parah.',
      '4. Jumlah air yang ada sangat sedikit dan hanya cukup untuk kebutuhan minum diri sendiri atau hewan peliharaan demi menyambung hidup.',
      'Syarat-syarat sah tayammum:',
      '1. Telah masuk waktu shalat yang hendak dikerjakan.',
      '2. Menggunakan tanah/debu yang suci, murni, tidak tercampur najis atau tepung, dan bukan debu musta\'mal.',
      '3. Satu kali tayammum hanya berlaku untuk satu shalat fardhu (menurut mazhab Syafi\'i) ditambah beberapa shalat sunnah.'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Ma\'idah: 6 & QS. An-Nisa: 43',
        arabic: 'وَإِنْ كُنْتُمْ مَرْضَىٰ أَوْ عَلَىٰ سَفَرٍ أَوْ جَاءَ أَحَدٌ مِنْكُمْ مِنَ الْغَائِطِ أَوْ لَامَسْتُمُ النِّسَاءَ فَلَمْ تَجِدُوا مَاءً فَتَيَمَّمُوا صَعِيدًا طَيِّبًا فَامْسَحُوا بِوُجُوهِكُمْ وَأَيْدِيكُمْ مِنْهُ',
        latin: "Wa in kuntum mardhā au 'alā safarin au jā'a ahadum-minkum minal-ghā'ithi au lāmastumun-nisā'a falam tajidū mā'an fatayammamū sha'īdan thayyiban famsahū biwujūhikum wa aidīkum minh.",
        translation: 'Dan jika kamu sakit atau sedang dalam perjalanan atau kembali dari buang air atau menyentuh perempuan lalu kamu tidak memperoleh air, maka bertayammumlah dengan debu yang baik (suci); usaplah wajahmu dan tanganmu dengan (debu) itu...',
        explanation: 'Ayat Al-Qur\'an pensyariatan tayammum bagi umat Islam.'
      }
    ],
    rujukan: ['Matan Safinatun Najah', 'Fathul Qarib', 'Al-Majmu\' Syarah Al-Muhadzdzab']
  },
  {
    id: 'tayammum-niat',
    order: 2,
    tab: 'tayammum',
    title: 'Lafadz Niat Tayammum',
    badge: 'Rukun Wajib (Fardhu)',
    badgeColor: 'emerald',
    summary: 'Niat tayammum untuk membolehkan shalat (istibahatish shalat) fardhu karena Allah Ta\'ala.',
    timeInfo: 'Diniatkan di dalam hati bersamaan saat memindahkan debu dan mengusap wajah.',
    detailExplanation: [
      'Niat tayammum berbunyi "listibāhatish shalāt" (untuk diperbolehkannya mendirikan shalat), bukan "liraf\'il hadats" (mengangkat hadas).',
      'Hal ini karena tayammum menurut jumhur ulama bersifat thaharah darurat yang tidak mengangkat hadas secara hakiki, melainkan hanya memberikan izin syar\'i untuk menunaikan ibadah shalat.',
      'Jika berniat untuk shalat fardhu, maka otomatis ia boleh mengerjakan shalat fardhu tersebut beserta shalat-shalat sunnah sesudahnya.',
      'Jika hanya berniat untuk shalat sunnah, maka ia tidak diperkenankan menggunakannya untuk shalat fardhu.'
    ],
    niatList: [
      {
        id: 'niat-tayammum-fardhu',
        name: 'Lafadz Niat Tayammum untuk Shalat Fardhu',
        arabic: 'نَوَيْتُ التَّيَمُّمَ لِاسْتِبَاحَةِ الصَّلَاةِ الْمَفْرُوضَةِ فَرْضًا لِلّٰهِ تَعَالَى',
        latin: "Nawaitut-tayammuma listibāhatish-shalātil mafrūdhati fardhan lillāhi ta'ālā.",
        translation: 'Aku berniat tayammum agar diperbolehkan melaksanakan shalat fardhu karena Allah Ta\'ala.',
        note: 'Dihadirkan di dalam hati saat mengusap wajah dengan debu.'
      },
      {
        id: 'niat-tayammum-umum',
        name: 'Lafadz Niat Tayammum Standar',
        arabic: 'نَوَيْتُ التَّيَمُّمَ لِاسْتِبَاحَةِ الصَّلَاةِ فَرْضًا لِلّٰهِ تَعَالَى',
        latin: "Nawaitut-tayammuma listibāhatish-shalāti fardhan lillāhi ta'ālā.",
        translation: 'Aku berniat tayammum agar diperbolehkan mendirikan shalat fardhu karena Allah Ta\'ala.',
        note: 'Lafadz yang paling umum dan ringkas.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1) & Muslim (No. 1907)',
        arabic: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
        latin: "Innamal a'mālu bin-niyyāt.",
        translation: 'Sesungguhnya setiap amalan itu tergantung niatnya.',
        explanation: 'Keharusan niat dalam tayammum.'
      }
    ],
    rujukan: ['Safinatun Najah', 'Al-Fiqh Al-Manhaji']
  },
  {
    id: 'tayammum-tata-cara-praktik',
    order: 3,
    tab: 'tayammum',
    title: 'Tata Cara Praktik Tayammum Sesuai Sunnah',
    badge: 'Rukun & Tata Cara',
    badgeColor: 'emerald',
    summary: 'Langkah praktis pelaksanaan tayammum: dua tepukan debu untuk mengusap wajah dan kedua tangan hingga siku.',
    timeInfo: 'Dikerjakan dengan tenang setelah menghadap kiblat.',
    detailExplanation: [
      'LANGKAH-LANGKAH PRAKTIK TAYAMMUM:',
      'Langkah 1: Menghadap kiblat dan membaca Basmalah (Bismillāhir-rahmānir-rahīm).',
      'Langkah 2: Menempelkan kedua telapak tangan dengan jari-jemari yang direnggangkan ke permukaan tanah/dinding yang berdebu suci (tepukan pertama).',
      'Langkah 3: Mengangkat kedua tangan dan menipiskan debu dengan cara meniup kedua telapak tangan secara lembut atau menepukkannya satu sama lain.',
      'Langkah 4: Mengusapkan kedua telapak tangan ke seluruh permukaan wajah secara merata sembari menghadirkan niat di dalam hati.',
      'Langkah 5: Melepaskan cincin (wajib pada tepukan kedua agar debu sampai ke kulit bawah cincin).',
      'Langkah 6: Menempelkan kembali kedua telapak tangan ke bagian tanah/debu yang berbeda (tepukan kedua) dan menipiskannya kembali.',
      'Langkah 7: Mengusap tangan kanan hingga siku dengan tangan kiri: meletakkan bagian dalam jemari tangan kiri di punggung jari tangan kanan, menariknya ke arah siku, memutar telapak tangan ke bagian dalam siku, lalu menariknya kembali ke arah pergelangan tangan hingga ibu jari bertemu ibu jari.',
      'Langkah 8: Melakukan hal yang sama untuk tangan kiri menggunakan tangan kanan.',
      'Langkah 9: Tertib dalam urutan dan membaca doa setelah bersuci.'
    ],
    doaList: [
      {
        id: 'doa-setelah-tayammum',
        name: 'Doa Selesai Tayammum',
        arabic: 'أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا اللّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ، وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ، اللّٰهُمَّ اجْعَلْنِي مِنَ التَّوَّابِينَ، وَاجْعَلْنِي مِنَ الْمُتَطَهِّرِينَ',
        latin: "Asyhadu allā ilāha illallāhu wahdahū lā syarīka lah, wa asyhadu anna Muhammadan 'abduhū wa rasūluh, Allāhummaj-'alnī minat-tawwābīna waj-'alnī minal-mutathahhirīn.",
        translation: 'Aku bersaksi tiada tuhan selain Allah Yang Maha Esa tiada sekutu bagi-Nya, dan aku bersaksi bahwa Muhammad adalah hamba dan utusan-Nya. Ya Allah jadikanlah aku bagian dari orang-orang yang bertaubat dan menyucikan diri.',
        note: 'Doa yang sama dengan doa sesudah wudhu.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 338) & Muslim (No. 368) dari Ammar bin Yasir RA',
        arabic: 'إِنَّمَا كَانَ يَكْفِيكَ أَنْ تَصْنَعَ هَكَذَا، فَضَرَبَ بِكَفَّيْهِ ضَرْبَةً عَلَى الأَرْضِ ثُمَّ نَفَضَهُمَا ثُمَّ مَسَحَ بِهِمَا ظَهْرَ كَفِّهِ بِشِمَالِهِ أَوْ ظَهْرَ شِمَالِهِ بِكَفِّهِ ثُمَّ مَسَحَ بِهِمَا وَجْهَهُ',
        latin: "Innamā kāna yakfīka an tashna'a hākadzā, fadharaba bikaffaihi dharbatan 'alal-ardhi tsumma nafadhahumā tsumma masaha bihimā zhahra kaffihī bisyimālihī au zhahra syimālihī bikaffihī tsumma masaha bihimā wajhah.",
        translation: 'Sesungguhnya cukup bagimu melakukan seperti ini: Beliau memukulkan kedua telapak tangannya ke tanah dengan satu tepukan, kemudian mengibaskannya (menipiskannya), lalu mengusap punggung telapak tangannya dengan tangan kirinya dan mengusap wajahnya.',
        explanation: 'Praktik tayammum yang diajarkan Rasulullah SAW.'
      }
    ],
    rujukan: ['Shahih Al-Bukhari', 'Kifayatul Akhyar', 'Fathul Mu\'in']
  },
  {
    id: 'tayammum-pembatal',
    order: 4,
    tab: 'tayammum',
    title: 'Hal-Hal yang Membatalkan Tayammum',
    badge: 'Fiqih Pembatal',
    badgeColor: 'rose',
    summary: 'Perkara yang membatalkan kesucian tayammum sehingga mengharuskan bersuci kembali.',
    timeInfo: 'Membatalkan kebolehan shalat.',
    detailExplanation: [
      '1. Segala hal yang membatalkan wudhu (keluar sesuatu dari qubul/dubur, hilang akal/tidur, sentuhan kulit lawan jenis non-mahram, menyentuh kemaluan).',
      '2. Melihat atau menemukan air yang mencukupi sebelum seseorang memulai shalat (bagi orang yang bertayammum karena ketiadaan air).',
      '3. Hilangnya uzur sakit atau kesanggupan menggunakan air dingin tanpa bahaya (bagi orang yang bertayammum karena alasan sakit/dingin).',
      '4. Murtad (keluar dari agama Islam) wal \'iyādzu billāh.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 332) & At-Tirmidzi (No. 124)',
        arabic: 'إِنَّ الصَّعِيدَ الطَّيِّبَ طَهُورُ الْمُسْلِمِ، وَإِنْ لَمْ يَجِدِ الْمَاءَ عَشْرَ سِنِينَ، فَإِذَا وَجَدَ الْمَاءَ فَلْيُمِسَّهُ بَشَرَتَهُ، فَإِنَّ ذَلِكَ خَيْرٌ',
        latin: "Innash-sha'īdath-thayyiba thahūrul-muslim, wa il-lam yajidil-mā'a 'asyra sinīn, fa idzā wajadal-mā'a falyumissahu basyaratah, fa inna dzālika khair.",
        translation: 'Sesungguhnya tanah yang suci adalah alat bersuci bagi seorang muslim meskipun ia tidak menjumpai air selama sepuluh tahun. Namun apabila ia telah menjumpai air, maka hendaklah ia membasahkannya ke kulitnya (berwudhu/mandi), karena yang demikian itu lebih baik.',
        explanation: 'Kewajiban beralih ke air seketika air telah ditemukan.'
      }
    ],
    rujukan: ['Al-Fiqh Al-Islami wa Adillatuh - Wahbah Az-Zuhaili', 'Safinatun Najah']
  },

  // ==========================================
  // TAB 4: MENYUCIKAN NAJIS (impurities)
  // ==========================================
  {
    id: 'najis-pengertian-tingkatan',
    order: 1,
    tab: 'impurities',
    title: 'Pengertian Najis & Perbedaannya dengan Hadas',
    badge: 'Fiqih Pokok Thaharah',
    badgeColor: 'emerald',
    summary: 'Memahami definisi najis, pembagian tingkatannya (ringan, sedang, berat), dan perbedaannya dengan hadas.',
    timeInfo: 'Wajib disucikan dari pakaian, badan, dan tempat sebelum mendirikan shalat.',
    detailExplanation: [
      'Pengertian Najis: Benda kotor menurut syariat Islam yang mencegah sahnya shalat dan ibadah lainnya selama tidak ada keringanan (rukhsah).',
      'Perbedaan Najis dan Hadas:',
      '- Hadas: Status hukum diri yang bersifat abstrak (tidak berwujud benda fisik). Hadas kecil disucikan dengan wudhu, hadas besar disucikan dengan mandi wajib.',
      '- Najis (Khabats): Benda berwujud materi fisik (seperti darah, kencing, kotoran) yang menempel pada badan, pakaian, atau tempat shalat.',
      'Tiga Tingkatan Najis dalam Islam:',
      '1. Najis Mukhaffafah (Ringan) — Air kencing bayi laki-laki di bawah 2 tahun yang hanya minum ASI.',
      '2. Najis Mutawassithah (Sedang) — Sebagian besar najis seperti darah, nanah, kotoran, bangkai, khamr.',
      '3. Najis Mughalladhah (Berat) — Najis anjing dan babi beserta keturunannya.'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Muddatstsir: 4',
        arabic: 'وَثِيَابَكَ فَطَهِّرْ',
        latin: "Wa tsiyābaka fathahhir.",
        translation: 'Dan bersihkanlah (sucikanlah) pakaianmu!',
        explanation: 'Perintah tegas Al-Qur\'an untuk menyucikan pakaian dari segala kotoran dan najis.'
      },
      {
        type: 'quran',
        source: 'QS. Al-Baqarah: 222',
        arabic: 'إِنَّ اللَّهَ يُحِبُّ التَّوَّابِينَ وَيُحِبُّ الْمُتَطَهِّرِينَ',
        latin: "Innallāha yuhibbut-tawwābīna wa yuhibbul-mutathahhirīn.",
        translation: 'Sesungguhnya Allah menyukai orang-orang yang bertaubat dan menyukai orang-orang yang menyucikan diri.',
        explanation: 'Kecintaan Allah kepada hamba yang senantiasa menjaga kesucian diri dan lingkungannya.'
      }
    ],
    rujukan: ['Al-Majmu\' Syarah Al-Muhadzdzab', 'Fathul Qarib Al-Mujib']
  },
  {
    id: 'najis-mukhaffafah',
    order: 2,
    tab: 'impurities',
    title: 'Najis Mukhaffafah (Ringan) & Cara Menyucikannya',
    badge: 'Najis Ringan (Mukhaffafah)',
    badgeColor: 'teal',
    summary: 'Air kencing bayi laki-laki berusia di bawah 2 tahun yang belum makan apapun selain air susu ibu (ASI).',
    timeInfo: 'Cukup disucikan dengan percikan air mutlak.',
    detailExplanation: [
      'Kriteria Najis Mukhaffafah:',
      '1. Berupa air kencing bayi laki-laki.',
      '2. Usia bayi belum genap dua tahun (belum masuk masa sapih).',
      '3. Bayi tersebut belum mengonsumsi makanan atau minuman apapun selain air susu ibu (ASI), kecuali obat atau madu saat tahnik.',
      'Catatan: Air kencing bayi perempuan atau kotoran (tinja) bayi laki-laki tetap dihukumi sebagai najis Mutawassithah (sedang) yang wajib dicuci hingga bersih.',
      'CARA MENYUCIKAN NAJIS MUKHAFFAFAH:',
      'Cukup dengan memercikkan air suci menyucikan (rasysyul mā\') ke seluruh area yang terkena air kencing hingga merata dan basah, tanpa disyaratkan air harus mengalir atau diperas.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 223) & Muslim (No. 287) dari Ummu Qais binti Mihshan RA',
        arabic: 'أَنَّهَا أَتَتْ بِابْنٍ لَهَا صَغِيرٍ لَمْ يَأْكُلِ الطَّعَامَ إِلَى رَسُولِ اللَّهِ فَأَجْلَسَهُ فِي حِجْرِهِ فَبَالَ عَلَى ثَوْبِهِ، فَدَعَا بِمَاءٍ فَنَضَحَهُ وَلَمْ يَغْسِلْهُ',
        latin: "Annahā atat bibnin lahā shaghīrin lam ya'kulith-tha'āma ilā rasūlillāhi fa-ajlasahū fī hijrihī fabāla 'alā tsaubih, fada'ā bimā'in fanadhahahū wa lam yaghsilh.",
        translation: 'Bahwa ia datang membawa anak laki-lakinya yang masih kecil dan belum memakan makanan kepada Rasulullah SAW. Beliau mendudukkannya di pangkuan beliau, lalu bayi itu kencing di baju beliau. Maka beliau meminta dibawakan air lalu memercikkannya ke bajunya dan tidak mencucinya.',
        explanation: 'Dalil kemudahan cara menyucikan najis mukhaffafah.'
      },
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 376) & An-Nasa\'i (No. 305)',
        arabic: 'يُرَشُّ مِنْ بَوْلِ الْغُلاَمِ، وَيُغْسَلُ مِنْ بَوْلِ الْجَارِيَةِ',
        latin: "Yuradh-dhu mim-baulil-ghulām, wa yughsalu mim-baulil-jāriyah.",
        translation: 'Dibersihkan dengan dipercikkan dari kencing bayi laki-laki, dan dicuci (dialirkan air) dari kencing bayi perempuan.',
        explanation: 'Perbedaan cara mencuci kencing bayi laki-laki dan perempuan.'
      }
    ],
    rujukan: ['Matan Taqrib - Abi Syuja\'', 'Bulughul Maram', 'Kifayatul Akhyar']
  },
  {
    id: 'najis-mutawassithah',
    order: 3,
    tab: 'impurities',
    title: 'Najis Mutawassithah (Sedang: \'Ainiyyah & Hukmiyyah)',
    badge: 'Najis Sedang (Mutawassithah)',
    badgeColor: 'amber',
    summary: 'Najis umum seperti kotoran, air kencing, darah, nanah, bangkai, dan khamr beserta tata cara membasuhnya.',
    timeInfo: 'Wajib dihilangkan zat, warna, bau, dan rasanya dengan air mengalir.',
    detailExplanation: [
      'Contoh Najis Mutawassithah: Kotoran manusia dan hewan, air kencing, darah, nanah, muntah, khamr (minuman memabukkan), air madzi, air wadi, dan bangkai binatang (selain bangkai manusia, ikan, dan belalang).',
      'PEMBAGIAN & CARA MENYUCIKANNYA:',
      '1. Najis \'Ainiyyah (Tampak Fisik): Najis yang masih memiliki wujud materi, warna, bau, atau rasa.',
      '   - Cara Menyucikan: Wajib menghilangkan wujud fisiknya terlebih dahulu, kemudian membasuh dan mengalirkan air mutlak hingga hilang bau, warna, dan rasanya. Jika warna atau bau sangat sulit dihilangkan setelah dicuci berulang kali, maka hukumnya dimaafkan.',
      '2. Najis Hukmiyyah (Tidak Tampak Fisik): Najis yang telah mengering dan tidak lagi menyisakan bau, warna, maupun rasa (misal: bekas tetesan kencing di lantai yang sudah kering tanpa bekas).',
      '   - Cara Menyucikan: Cukup mengalirkan air mutlak satu kali ke atas permukaan tempat najis tersebut.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 220) & Muslim (No. 284)',
        arabic: 'أَنَّ أَعْرَابِيًّا بَالَ فِي الْمَسْجِدِ، فَقَالَ النَّبِيُّ: صُبُّوا عَلَى بَوْلِهِ سَجْلاً مِنْ مَاءٍ، فَإِنَّمَا بُعِثْتُمْ مُيَسِّرِينَ وَلَمْ تُبْعَثُوا مُعَسِّرِينَ',
        latin: "Anna a'rābiyyan bāla fil-masjid, faqālan-nabiyyu: Shubbū 'alā baulihī sajlam-mim-mā', fa innamā bu'itstum muyassirīna wa lam tub'atsū mu'assirīn.",
        translation: 'Bahwa seorang Badui kencing di dalam masjid. Maka Nabi SAW bersabda: "Siramkanlah di atas bekas kencingnya seember air. Sesungguhnya kalian diutus untuk mempermudah dan bukan untuk mempersulit."',
        explanation: 'Cara menyucikan najis dengan mengalirkan air ke atasnya.'
      },
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 365) dari Khaulah binti Yasar RA',
        arabic: 'يَكْفِيكِ الْمَاءُ وَلاَ يَضُرُّكِ أَثَرُهُ',
        latin: "Yakfīkil-mā'u wa lā yadhurruki atsaruh.",
        translation: 'Cukuplah bagimu air (untuk mencuci darah haid), dan tidak membahayakanmu (dimaafkan) bekas warnanya yang masih tersisa.',
        explanation: 'Dimaafkannya sisa warna darah yang membandel setelah dicuci maksimal.'
      }
    ],
    rujukan: ['Al-Umm - Imam Asy-Syafi\'i', 'Safinatun Najah', 'Fathul Qarib']
  },
  {
    id: 'najis-mughalladhah',
    order: 4,
    tab: 'impurities',
    title: 'Najis Mughalladhah (Berat: Anjing & Babi)',
    badge: 'Najis Berat (Mughalladhah)',
    badgeColor: 'rose',
    summary: 'Najis yang bersumber dari jilatan, air liur, kotoran, atau tubuh anjing dan babi serta cara membasuhnya 7 kali dengan tanah.',
    timeInfo: 'Wajib dibasuh 7 kali dengan air mengalir dan salah satunya dicampur debu/tanah suci.',
    detailExplanation: [
      'Kriteria Najis Mughalladhah: Najis anjing dan babi, baik berupa air liur, jilatan, kotoran, air kencing, darah, keringat, bulu, maupun anak hasil persilangan salah satunya.',
      'TATA CARA MENYUCIKAN NAJIS MUGHALLADHAH:',
      '1. Hilangkan terlebih dahulu wujud fisik najis (bila ada).',
      '2. Basuh benda atau bagian tubuh yang terkena najis sebanyak 7 (tujuh) kali basuhan dengan air mutlak yang mengalir.',
      '3. Salah satu dari tujuh basuhan tersebut (paling utama pada basuhan pertama atau kedua) WAJIB dicampur dengan tanah/debu yang suci hingga air menjadi keruh berdebu.',
      '4. Bilas dengan sisa basuhan air bersih hingga tanah dan najis hilang tuntas.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 279) & Bukhari (No. 172) dari Abu Hurairah RA',
        arabic: 'طَهُورُ إِنَاءِ أَحَدِكُمْ إِذَا وَلَغَ فِيهِ الْكَلْبُ أَنْ يَغْسِلَهُ سَبْعَ مَرَّاتٍ أُولاَهُنَّ بِالتُّرَابِ',
        latin: "Thuhūru inā'i ahadikum idzā walagha fīhil-kalbu ay-yaghsilahū sab'a marrātin ūlāhunna bit-turāb.",
        translation: 'Sucinya bejana salah seorang di antara kalian apabila dijilat oleh anjing adalah dengan membasuhnya sebanyak tujuh kali, basuhan yang pertama dicampur dengan tanah (debu).',
        explanation: 'Ketentuan qath\'i cara menyucikan najis jilatan anjing.'
      }
    ],
    rujukan: ['Shahih Muslim', 'Al-Majmu\' Syarah Al-Muhadzdzab', 'Fathul Mu\'in']
  },
  {
    id: 'najis-mafu-dimaafkan',
    order: 5,
    tab: 'impurities',
    title: 'Najis yang Dimaafkan (Ma\'fu \'Anhu)',
    badge: 'Keringanan Syariat (Rukhsah)',
    badgeColor: 'teal',
    summary: 'Kategori najis dalam jumlah kecil yang dimaafkan syariat karena sulit dihindarkan (masyaqqah).',
    timeInfo: 'Shalat tetap sah meskipun najis tersebut menempel.',
    detailExplanation: [
      'Syariat Islam memberikan keringanan (rukhsah) terhadap beberapa jenis najis yang sangat sulit dihindari (masyaqqah wa ta\'assurul ihtirāz):',
      '1. Percikan darah atau nanah dari jerawat, bisul, atau luka sendiri dalam jumlah sedikit yang tidak disengaja.',
      '2. Darah nyamuk, lalat, kutu, atau serangga kecil yang mati terpukul di pakaian dalam jumlah wajar.',
      '3. Debu jalanan yang bercampur kotoran hewan kering yang tak kasat mata saat cuaca berangin kencang.',
      '4. Bangkai serangga atau hewan yang tidak memiliki darah mengalir (seperti lalat, semut, lebah) yang jatuh ke dalam air atau makanan cair tanpa sengaja dimasukkan.',
      '5. Kotoran burung/unggas di tempat-tempat terbuka yang sulit dihindari seperti di pelataran masjid terbuka.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 3320) & Abu Dawud (No. 3844)',
        arabic: 'إِذَا وَقَعَ الذُّبَابُ فِي إِنَاءِ أَحَدِكُمْ فَلْيَغْمِسْهُ كُلَّهُ ثُمَّ لِيَطْرَحْهُ، فَإِنَّ فِي أَحَدِ جَنَاحَيْهِ شِفَاءً وَفِي الآخَرِ دَاءً',
        latin: "Idzā waqa'adz-dzubābu fī inā'i ahadikum falyagh-mishu kullahū tsumma liyathrah-hu, fa inna fī ahadi janāhaihi syifā'aw wa fil-ākhari dā'.",
        translation: 'Apabila seekor lalat jatuh ke dalam bejana salah seorang di antara kalian, maka celupkanlah seluruh badannya kemudian buanglah, karena sesungguhnya pada salah satu sayapnya terdapat obat penawar dan pada sayap lainnya terdapat penyakit.',
        explanation: 'Dalil bahwa bangkai hewan yang tidak berdarah mengalir tidak menajiskan air/makanan bila jatuh tanpa sengaja.'
      }
    ],
    rujukan: ['Matan Safinatun Najah', 'Fathul Wahhab - Syaikh Zakariya Al-Anshari']
  },
  {
    id: 'najis-istinja-adab',
    order: 6,
    tab: 'impurities',
    title: 'Adab Istinja\' & Buang Hajat (Qadha\'ul Hajah)',
    badge: 'Sunnah & Adab Kesucian',
    badgeColor: 'emerald',
    summary: 'Tata cara membersihkan qubul dan dubur setelah buang air serta adab islami saat berada di kamar mandi.',
    timeInfo: 'Dilakukan setiap kali selesai buang air kecil maupun buang air besar.',
    detailExplanation: [
      'Pengertian Istinja\': Membersihkan kotoran atau air kencing yang keluar dari qubul atau dubur menggunakan air bersih atau batu/tisu kering.',
      'TATA CARA ISTINJA\':',
      '1. Menggunakan air bersih (cara paling utama dan sempurna).',
      '2. Menggunakan 3 buah batu atau 3 usapan tisu kering penyerap yang suci (istijmār) bila tidak ada air atau sebelum dibasuh air.',
      '3. Menggunakan tangan kiri untuk membersihkan kotoran dan dilarang menggunakan tangan kanan.',
      'ADAB-ADAB BUANG HAJAT:',
      '1. Masuk toilet mendahulukan kaki kiri dan membaca doa perlindungan.',
      '2. Keluar toilet mendahulukan kaki kanan dan membaca doa ampunan & syukur.',
      '3. Tidak membawa barang yang bertuliskan lafadz Allah atau ayat Al-Qur\'an.',
      '4. Tidak berbicara, berdzikir dengan lisan, atau menjawab salam di dalam toilet.',
      '5. Tidak menghadap kiblat dan tidak membelakangi kiblat di tempat terbuka tanpa penghalang.'
    ],
    doaList: [
      {
        id: 'doa-masuk-toilet',
        name: 'Doa Masuk Kamar Mandi / Toilet',
        arabic: 'اللّٰهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْخُبُثِ وَالْخَبَائِثِ',
        latin: "Allāhumma innī a'ūdzu bika minal-khubutsi wal-khabā'its.",
        translation: 'Ya Allah, sesungguhnya aku berlindung kepada-Mu dari godaan setan laki-laki dan setan perempuan.',
        note: 'Dibaca sebelum melangkahkan kaki kiri masuk ke toilet.'
      },
      {
        id: 'doa-keluar-toilet',
        name: 'Doa Keluar Kamar Mandi / Toilet',
        arabic: 'غُفْرَانَكَ، الْحَمْدُ لِلّٰهِ الَّذِي أَذْهَبَ عَنِّي الْأَذَى وَعَافَانِي',
        latin: "Ghufrānaka, alhamdulillāhilladzī adzhaba 'annil-adzā wa 'āfānī.",
        translation: 'Aku memohon ampunan-Mu, segala puji bagi Allah yang telah menghilangkan kotoran/penyakit dariku dan menyehatkanku.',
        note: 'Dibaca setelah melangkahkan kaki kanan keluar dari toilet.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 142) & Muslim (No. 375)',
        arabic: 'كَانَ النَّبِيُّ إِذَا دَخَلَ الْخَلاَءَ قَالَ: اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْخُبُثِ وَالْخَبَائِثِ',
        latin: "Kānan-nabiyyu idzā dakhalal-khalā'a qāla: Allāhumma innī a'ūdzu bika minal-khubutsi wal-khabā'its.",
        translation: 'Adalah Nabi SAW apabila hendak masuk kamar kecil membaca: "Ya Allah, sesungguhnya aku berlindung kepada-Mu dari setan laki-laki dan setan perempuan."',
        explanation: 'Doa sunnah Nabi SAW saat memasuki toilet.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 153) & Muslim (No. 267)',
        arabic: 'إِذَا بَالَ أَحَدُكُمْ فَلاَ يَأْخُذَنَّ ذَكَرَهُ بِيَمِينِهِ، وَلاَ يَسْتَنْجِ بِيَمِينِهِ',
        latin: "Idzā bāla ahadukum falā ya'khudzanna dzakarahū biyamīnih, wa lā yastanji biyamīnih.",
        translation: 'Apabila salah seorang di antara kalian buang air kecil, maka janganlah ia memegang kemaluannya dengan tangan kanannya dan janganlah beristinja\' dengan tangan kanannya.',
        explanation: 'Larangan menggunakan tangan kanan saat beristinja\'.'
      }
    ],
    rujukan: ['Al-Adzkar - Imam Nawawi', 'Fathul Qarib Al-Mujib', 'Riyadhus Shalihin']
  }
];

export const getThaharahByTab = (tab: 'wudu' | 'ghusl' | 'tayammum' | 'impurities'): ThaharahDetailItem[] => {
  return THAHARAH_DATA.filter((item) => item.tab === tab);
};

export const getThaharahById = (id: string): ThaharahDetailItem | undefined => {
  return THAHARAH_DATA.find((item) => item.id === id);
};
