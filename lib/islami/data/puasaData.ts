export interface PuasaNiat {
  id: string;
  name: string;
  arabic: string;
  latin: string;
  translation: string;
  note?: string;
}

export interface PuasaDalil {
  type: 'quran' | 'hadith' | 'kaidah';
  source: string;
  arabic: string;
  latin: string;
  translation: string;
  explanation?: string;
}

export interface PuasaLegalRuling {
  topic: string;
  ruling: string;
  detail: string;
}

export interface PuasaDetailItem {
  id: string;
  order: number;
  tab: 'types' | 'recommended' | 'invalidators' | 'exemptions';
  title: string;
  badge: string;
  badgeColor?: string;
  summary: string;
  timeInfo?: string;
  detailExplanation: string[];
  niatList?: PuasaNiat[];
  doaList?: PuasaNiat[];
  dalilList: PuasaDalil[];
  legalRulings?: PuasaLegalRuling[];
  rujukan: string[];
}

export const PUASA_DATA: PuasaDetailItem[] = [
  // ==========================================
  // TAB 1: JENIS-JENIS PUASA (types)
  // ==========================================
  {
    id: 'puasa-ramadhan',
    order: 1,
    tab: 'types',
    title: 'Puasa Ramadan',
    badge: 'Wajib (Fardhu \'Ain)',
    badgeColor: 'emerald',
    summary: 'Ibadah puasa wajib sebulan penuh pada bulan Ramadan yang merupakan rukun Islam ke-4.',
    timeInfo: 'Sebulan penuh di bulan ke-9 Hijriyah (Ramadan), dari terbit fajar shadiq hingga terbenam matahari.',
    detailExplanation: [
      'Puasa Ramadan adalah kewajiban mutlak bagi setiap muslim yang telah baligh, berakal, suci dari haid dan nifas, serta mampu menjalankannya.',
      'Kewajiban berpuasa Ramadan disyariatkan pada tahun ke-2 Hijriyah melalui wahyu Surah Al-Baqarah ayat 183.',
      'Syarat wajib puasa: Islam, baligh, berakal sehat, suci dari haid/nifas, dan sanggup (tidak sedang sakit parah atau lansia renta).',
      'Rukun puasa ada dua: (1) Niat pada malam hari sebelum fajar, dan (2) Imsak (menahan diri dari segala hal yang membatalkan dari fajar hingga maghrib).'
    ],
    niatList: [
      {
        id: 'niat-ramadan-harian',
        name: 'Niat Harian Puasa Ramadan (Malam Hari)',
        arabic: 'نَوَيْتُ صَوْمَ غَدٍ عَنْ أَدَاءِ فَرْضِ شَهْرِ رَمَضَانَ هٰذِهِ السَّنَةِ لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma ghadin 'an adā'i fardhi syahri Ramadhāna hādzihis sanati lillāhi ta'ālā.",
        translation: 'Aku berniat puasa esok hari untuk menunaikan fardhu bulan Ramadan tahun ini karena Allah Ta\'ala.',
        note: 'Wajib diucapkan atau diniatkan di dalam hati setiap malam sebelum masuk waktu Subuh (mazhab Syafi\'i).'
      },
      {
        id: 'niat-ramadan-sebulan',
        name: 'Niat Satu Bulan Penuh (Awal Ramadan - Mazhab Maliki)',
        arabic: 'نَوَيْتُ صَوْمَ جَمِيْعِ شَهْرِ رَمَضَانِ هٰذِهِ السَّنَةِ فَرْضًا لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma jamī'i syahri Ramadhāna hādzihis sanati fardhan lillāhi ta'ālā.",
        translation: 'Aku berniat puasa sebulan penuh pada bulan Ramadan tahun ini fardhu karena Allah Ta\'ala.',
        note: 'Dianjurkan dibaca pada malam pertama Ramadan sebagai langkah antisipasi bila suatu malam lupa berniat.'
      }
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Baqarah: 183',
        arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا كُتِبَ عَلَيْكُمُ الصِّيَامُ كَمَا كُتِبَ عَلَى الَّذِينَ مِنْ قَبْلِكُمْ لَعَلَّكُمْ تَتَّقُونَ',
        latin: "Yā ayyuhalladzīna āmanū kutiba 'alaikumush-shiyāmu kamā kutiba 'alalladzīna min qablikum la'allakum tattaqūn.",
        translation: 'Wahai orang-orang yang beriman! Diwajibkan atas kamu berpuasa sebagaimana diwajibkan atas orang-orang sebelum kamu agar kamu bertakwa.',
        explanation: 'Ayat ini menjadi dasar hukum utama kewajiban puasa Ramadan bagi umat Islam.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 8) & Muslim (No. 16)',
        arabic: 'بُنِيَ الإِسْلاَمُ عَلَى خَمْسٍ: شَهَادَةِ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَأَنَّ مُحَمَّدًا رَسُولُ اللَّهِ، وَإِقَامِ الصَّلاَةِ، وَإِيتَاءِ الزَّكَاةِ، وَحَجِّ الْبَيْتِ، وَصَوْمِ رَمَضَانَ',
        latin: "Buniyal-Islāmu 'alā khamsin: syahādati an lā ilāha illallāhu wa anna Muhammadan rasūlullāh, wa iqāmish-shalāti, wa ītā'iz-zakāti, wa hajjil-baiti, wa shaumi Ramadhān.",
        translation: 'Islam dibangun di atas lima perkara: bersaksi bahwa tidak ada Tuhan selain Allah dan Muhammad utusan Allah, mendirikan shalat, menunaikan zakat, haji ke Baitullah, dan puasa Ramadan.'
      }
    ],
    legalRulings: [
      {
        topic: 'Hukum Meninggalkan Puasa Ramadan Tanpa Uzur',
        ruling: 'Dosa Besar (Kafir bila mengingkari kewajibannya)',
        detail: 'Meninggalkan satu hari saja dengan sengaja tanpa uzur syar\'i tidak dapat digantikan keutamaannya meskipun berpuasa setahun penuh.'
      }
    ],
    rujukan: ['Kitab Al-Majmu\' Syarah Al-Muhadzdzab', 'Fathul Qarib Al-Mujib', 'Shahih Al-Bukhari & Shahih Muslim']
  },
  {
    id: 'puasa-qadha',
    order: 2,
    tab: 'types',
    title: 'Puasa Qadha Ramadan',
    badge: 'Wajib (Pengganti)',
    badgeColor: 'amber',
    summary: 'Puasa pengganti hari puasa Ramadan yang terlewat karena uzur syar\'i (seperti sakit, musafir, haid, nifas).',
    timeInfo: 'Dapat dilakukan sepanjang tahun di luar bulan Ramadan dan hari-hari haram, sebelum tiba Ramadan tahun berikutnya.',
    detailExplanation: [
      'Puasa Qadha wajib dilaksanakan sebanyak hari-hari Ramadan yang ditinggalkan.',
      'Dianjurkan untuk menyegerakan qadha puasa agar terbebas dari tanggungan hutang ibadah kepada Allah SWT.',
      'Qadha boleh dilakukan secara berturut-turut ataupun terpisah-pisah sesuai kemampuan.',
      'Bila menunda qadha hingga masuk Ramadan berikutnya tanpa uzur yang sah, sebagian ulama (Syafi\'iyyah) mewajibkan qadha disertai fidyah 1 mud per hari.'
    ],
    niatList: [
      {
        id: 'niat-qadha-ramadan',
        name: 'Lafadz Niat Puasa Qadha Ramadan',
        arabic: 'نَوَيْتُ صَوْمَ غَدٍ عَنْ قَضَاءِ فَرْضِ شَهْرِ رَمَضَانَ لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma ghadin 'an qadhā'i fardhi syahri Ramadhāna lillāhi ta'ālā.",
        translation: 'Aku berniat puasa esok hari untuk mengqadha fardhu bulan Ramadan karena Allah Ta\'ala.',
        note: 'Harus berniat di malam hari (sebelum terbit fajar) karena termasuk kategori puasa wajib.'
      }
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Baqarah: 184',
        arabic: 'فَمَنْ كَانَ مِنْكُمْ مَرِيضًا أَوْ عَلَىٰ سَفَرٍ فَعِدَّةٌ مِنْ أَيَّامٍ أُخَرَ',
        latin: "Fa man kāna minkum marīdhan au 'alā safarin fa 'iddatum min ayyāmin ukhar.",
        translation: 'Maka barangsiapa di antara kamu sakit atau dalam perjalanan (lalu ia berbuka), maka (wajiblah baginya berpuasa) sebanyak hari yang ditinggalkannya itu pada hari-hari yang lain.',
        explanation: 'Ayat yang mewajibkan qadha bagi mereka yang tidak berpuasa karena sakit atau bepergian.'
      },
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 335) dari Aisyah RA',
        arabic: 'كَانَ يُصِيبُنَا ذَلِكَ فَنُؤْمَرُ بِقَضَاءِ الصَّوْمِ وَلاَ نُؤْمَرُ بِقَضَاءِ الصَّلاَةِ',
        latin: "Kāna yushībunā dzālika fanu'maru biqadhā'ish-shaumi wa lā nu'maru biqadhā'ish-shalāh.",
        translation: 'Kami dahulu mengalami hal itu (haid), maka kami diperintahkan untuk mengqadha puasa dan tidak diperintahkan mengqadha shalat.'
      }
    ],
    rujukan: ['Raudhatuth Thalibin - Imam Nawawi', 'Al-Fiqh Al-Islami wa Adillatuh - Wahbah Az-Zuhaili']
  },
  {
    id: 'puasa-nazar',
    order: 3,
    tab: 'types',
    title: 'Puasa Nazar',
    badge: 'Wajib (Sebab Nazar)',
    badgeColor: 'blue',
    summary: 'Puasa yang asalnya sunnah atau mubah yang menjadi wajib karena diikrarkan sebagai nazar.',
    timeInfo: 'Wajib ditunaikan sesuai waktu atau jumlah hari yang telah dinazarkan.',
    detailExplanation: [
      'Nazar adalah mewajibkan diri sendiri melakukan suatu ibadah yang asalnya tidak wajib karena mengharapkan tercapainya suatu hajat atau wujud rasa syukur.',
      'Nazar hanya sah untuk perbuatan ibadah dan ketaatan kepada Allah, bukan untuk maksiat atau hal yang mustahil.',
      'Wajib hukumnya menyempurnakan puasa yang telah dinazarkan bila syarat nazar telah terpenuhi.',
      'Jika tidak mampu menunaikan nazar karena uzur syar\'i permanen, wajib membayar kafarat sumpah.'
    ],
    niatList: [
      {
        id: 'niat-puasa-nazar',
        name: 'Lafadz Niat Puasa Nazar',
        arabic: 'نَوَيْتُ صَوْمَ النَّذْرِ لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauman-nadzri lillāhi ta'ālā.",
        translation: 'Aku berniat puasa nazar karena Allah Ta\'ala.',
        note: 'Diniatkan pada malam hari sebelum terbit fajar.'
      }
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Hajj: 29',
        arabic: 'وَلْيُوفُوا نُذُورَهُمْ وَلْيَطَّوَّفُوا بِالْبَيْتِ الْعَتِيقِ',
        latin: "Wal yūfū nudzūrahum walyath-thawwafū bil-baitil-'atīq.",
        translation: 'Dan hendaklah mereka menyempurnakan nazar-nazar mereka dan hendaklah mereka melakukan thawaf sekeliling rumah yang tua itu (Baitullah).',
        explanation: 'Perintah tegas Allah untuk menunaikan segala nazar yang telah diikrarkan.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 6696) dari Aisyah RA',
        arabic: 'مَنْ نَذَرَ أَنْ يُطِيعَ اللَّهَ فَلْيُطِعْهُ، وَمَنْ نَذَرَ أَنْ يَعْصِيَهُ فَلاَ يَعْصِهِ',
        latin: "Man nadzara an yuthī'allāha falyuthi'hu, wa man nadzara an ya'shiyahu falā ya'shih.",
        translation: 'Barangsiapa bernazar untuk menaati Allah maka hendaklah ia menaati-Nya, dan barangsiapa bernazar untuk bermaksiat kepada-Nya maka janganlah ia bermaksiat kepada-Nya.'
      }
    ],
    rujukan: ['Bidayatul Mujtahid - Ibnu Rusyd', 'Al-Umm - Imam Asy-Syafi\'i']
  },
  {
    id: 'puasa-kafarat',
    order: 4,
    tab: 'types',
    title: 'Puasa Kafarat (Denda Pelanggaran)',
    badge: 'Wajib (Kafarat)',
    badgeColor: 'rose',
    summary: 'Puasa tebusan atas pelanggaran syariat tertentu seperti jimak di siang Ramadan atau melanggar sumpah.',
    timeInfo: 'Ditunaikan setelah terjadinya pelanggaran syar\'i sesuai urutan dan ketentuan hukumnya.',
    detailExplanation: [
      'Puasa kafarat adalah puasa denda yang diwajibkan syariat karena melakukan pelanggaran hukum tertentu.',
      'Kafarat jimak di siang hari Ramadan: Berpuasa 2 bulan berturut-turut bila tidak sanggup memerdekakan budak.',
      'Kafarat melanggar sumpah (Kaffaratul Yamin): Berpuasa 3 hari bila tidak mampu memberi makan atau pakaian kepada 10 orang miskin.',
      'Kafarat membunuh tanpa sengaja atau zhihar: Berpuasa 2 bulan berturut-turut bila tidak ada budak.'
    ],
    niatList: [
      {
        id: 'niat-puasa-kafarat',
        name: 'Lafadz Niat Puasa Kafarat',
        arabic: 'نَوَيْتُ صَوْمَ الْكَفَّارَةِ فَرْضًا لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shaumal-kaffārati fardhan lillāhi ta'ālā.",
        translation: 'Aku berniat puasa kafarat fardhu karena Allah Ta\'ala.',
        note: 'Diniatkan pada malam hari sebelum fajar.'
      }
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Ma\'idah: 89',
        arabic: 'فَمَنْ لَمْ يَجِدْ فَصِيَامُ ثَلَاثَةِ أَيَّامٍ ۚ ذَٰلِكَ كَفَّارَةُ أَيْمَانِكُمْ إِذَا حَلَفْتُمْ',
        latin: "Fa mal-lam yajid fa shiyāmu tsalātsati ayyām, dzālika kaffāratu aimānikum idzā halaftum.",
        translation: 'Barangsiapa tidak sanggup melakukan yang demikian, maka kafaratnya puasa tiga hari. Yang demikian itu adalah kafarat sumpah-sumpahmu bila kamu bersumpah.',
        explanation: 'Ketentuan puasa 3 hari sebagai alternatif kafarat sumpah.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1936) & Muslim (No. 1111)',
        arabic: 'فَهَلْ تَسْتَطِيعُ أَنْ تَصُومَ شَهْرَيْنِ مُتَتَابِعَيْنِ؟ قَالَ: لاَ',
        latin: "Fahal tastathī'u an tashūma syahraini mutatābi'aini? Qāla: Lā.",
        translation: 'Nabi SAW bertanya: Apakah engkau sanggup berpuasa dua bulan berturut-turut? Orang itu menjawab: Tidak. (Kisah kafarat jimak siang Ramadan).'
      }
    ],
    rujukan: ['Fathul Bari - Ibnu Hajar Al-Asqalani', 'Kifayatul Akhyar']
  },
  {
    id: 'puasa-senin-kamis',
    order: 5,
    tab: 'types',
    title: 'Puasa Sunnah Senin & Kamis',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'emerald',
    summary: 'Puasa sunnah mingguan yang rutin dikerjakan Rasulullah SAW karena pada hari itu amalan diangkat kepada Allah.',
    timeInfo: 'Setiap hari Senin dan hari Kamis sepanjang tahun (kecuali bertepatan dengan hari tasyrik/hari raya).',
    detailExplanation: [
      'Puasa Senin-Kamis adalah salah satu puasa sunnah yang paling disukai dan dirutinkan oleh Nabi Muhammad SAW.',
      'Keutamaan hari Senin: Hari kelahiran Rasulullah SAW dan hari diturunkannya wahyu pertama.',
      'Keutamaan hari Senin & Kamis: Hari di mana amalan manusia diperlihatkan kepada Allah SWT, sehingga sangat mulia bila amalan diangkat dalam keadaan sedang berpuasa.',
      'Pintu-pintu surga dibuka pada setiap hari Senin dan Kamis bagi hamba yang tidak menyekutukan Allah.'
    ],
    niatList: [
      {
        id: 'niat-senin',
        name: 'Lafadz Niat Puasa Hari Senin',
        arabic: 'نَوَيْتُ صَوْمَ يَوْمِ الِاثْنَيْنِ سُنَّةً لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma yaumil-itsnaini sunnatan lillāhi ta'ālā.",
        translation: 'Aku berniat puasa sunnah hari Senin karena Allah Ta\'ala.',
        note: 'Boleh diniatkan di pagi hari sebelum tergelincir matahari (Dzuhur) asalkan belum makan/minum.'
      },
      {
        id: 'niat-kamis',
        name: 'Lafadz Niat Puasa Hari Kamis',
        arabic: 'نَوَيْتُ صَوْمَ يَوْمِ الْخَمِيْسِ سُنَّةً لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma yaumil-khamīsi sunnatan lillāhi ta'ālā.",
        translation: 'Aku berniat puasa sunnah hari Kamis karena Allah Ta\'ala.',
        note: 'Boleh diniatkan di pagi hari bila belum membatalkan puasa.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. At-Tirmidzi (No. 747) & An-Nasa\'i (No. 2358)',
        arabic: 'تُعْرَضُ الأَعْمَالُ يَوْمَ الاِثْنَيْنِ وَالْخَمِيسِ فَأُحِبُّ أَنْ يُعْرَضَ عَمَلِي وَأَنَا صَائِمٌ',
        latin: "Tu'radhul-a'mālu yaumal-itsnaini wal-khamīsi fa uhibbu an yu'radha 'amalī wa anā shā'im.",
        translation: 'Amal-amal manusia diperlihatkan kepada Allah pada hari Senin dan Kamis. Maka aku suka ketika amalku diperlihatkan, aku dalam keadaan berpuasa.',
        explanation: 'Hadits shahih alasan utama Rasulullah SAW merutinkan puasa Senin dan Kamis.'
      },
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 1162) dari Abu Qatadah RA',
        arabic: 'ذَاكَ يَوْمٌ وُلِدْتُ فِيهِ، وَيَوْمٌ بُعِثْتُ أَوْ أُنْزِلَ عَلَيَّ فِيهِ',
        latin: "Dzāka yaumun wulidtu fīh, wa yaumun bu'itstu au unzila 'alayya fīh.",
        translation: 'Hari itu (Senin) adalah hari di mana aku dilahirkan, dan hari di mana aku diutus atau diturunkan wahyu kepadaku.'
      }
    ],
    rujukan: ['Sunan At-Tirmidzi', 'Riyadhus Shalihin - Imam Nawawi']
  },
  {
    id: 'puasa-ayyamul-bidh',
    order: 6,
    tab: 'types',
    title: 'Puasa Ayyamul Bidh (Hari-Hari Putih)',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'teal',
    summary: 'Puasa sunnah tiga hari di pertengahan bulan Hijriyah (tanggal 13, 14, dan 15) saat bulan purnama bersinar terang.',
    timeInfo: 'Tanggal 13, 14, dan 15 pada setiap bulan dalam kalender Hijriyah (kecuali tasyrik 13 Dzulhijjah).',
    detailExplanation: [
      'Dinamakan Ayyamul Bidh (hari-hari putih) karena malam-malamnya diterangi cahaya bulan purnama yang sangat terang benderang.',
      'Nilai pahala: Berpuasa 3 hari setiap bulan sama dengan berpuasa sepanjang tahun karena setiap satu kebaikan dilipatgandakan sepuluh kali lipat (3 x 10 = 30 hari).',
      'Termasuk salah satu dari 3 wasiat utama Rasulullah SAW kepada sahabat Abu Hurairah RA dan Abu Darda RA.',
      'Khusus pada bulan Dzulhijjah, tanggal 13 adalah hari Tasyrik yang diharamkan berpuasa, sehingga puasa Ayyamul Bidh dialihkan ke tanggal 14, 15, dan 16.'
    ],
    niatList: [
      {
        id: 'niat-ayyamul-bidh',
        name: 'Lafadz Niat Puasa Ayyamul Bidh',
        arabic: 'نَوَيْتُ صَوْمَ أَيَّامِ الْبِيْضِ سُنَّةً لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma ayyāmil-bīdhi sunnatan lillāhi ta'ālā.",
        translation: 'Aku berniat puasa Ayyamul Bidh (hari-hari putih) sunnah karena Allah Ta\'ala.',
        note: 'Dapat diniatkan malam hari atau pagi hari sebelum Dzuhur.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1981) & Muslim (No. 721)',
        arabic: 'أَوْصَانِي خَلِيلِي بِثَلاَثٍ لاَ أَدَعُهُنَّ حَتَّى أَمُوتَ: صِيَامِ ثَلاَثَةِ أَيَّامٍ مِنْ كُلِّ شَهْرٍ، وَصَلاَةِ الضُّحَى، وَنَوْمٍ عَلَى وِتْرٍ',
        latin: "Aushānī khalīlī bi tsalātsin lā ada'uhunna hattā amūt: shiyāmi tsalātsati ayyāmin min kulli syahr, wa shalātid-dhuhā, wa naumin 'alā witr.",
        translation: 'Kekasihku (Rasulullah SAW) mewasiatkan kepadaku tiga perkara yang tidak pernah kutinggalkan hingga mati: puasa tiga hari setiap bulan, shalat Dhuha, dan tidur setelah menunaikan witir.',
        explanation: 'Wasiat emas Rasulullah SAW kepada Abu Hurairah RA.'
      },
      {
        type: 'hadith',
        source: 'HR. An-Nasa\'i (No. 2420) & At-Tirmidzi (No. 761)',
        arabic: 'يَا أَبَا ذَرٍّ إِذَا صُمْتَ مِنَ الشَّهْرِ ثَلاَثَةَ أَيَّامٍ فَصُمْ ثَلاَثَ عَشْرَةَ وَأَرْبَعَ عَشْرَةَ وَخَمْسَ عَشْرَةَ',
        latin: "Yā Abā Dzarr, idzā shumta minasy-syahri tsalātsata ayyāmin fashum tsalātsa 'asyrata wa arba'a 'asyrata wa khamsa 'asyrah.",
        translation: 'Wahai Abu Dzar, jika engkau berpuasa tiga hari dalam sebulan, maka berpuasalah pada tanggal tiga belas, empat belas, dan lima belas.'
      }
    ],
    rujukan: ['Shahih Al-Bukhari', 'Sunan An-Nasa\'i', 'Al-Adzkar - Imam Nawawi']
  },
  {
    id: 'puasa-syawwal',
    order: 7,
    tab: 'types',
    title: 'Puasa 6 Hari Bulan Syawwal',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'emerald',
    summary: 'Puasa enam hari di bulan Syawwal setelah Idul Fitri yang bernilai pahala puasa setahun penuh bila digabung Ramadan.',
    timeInfo: 'Mulai tanggal 2 Syawwal hingga akhir bulan Syawwal (haram berpuasa pada 1 Syawwal).',
    detailExplanation: [
      'Puasa 6 hari Syawwal merupakan pelengkap dan penyempurna ibadah puasa Ramadan.',
      'Perhitungan pahala: 1 bulan Ramadan dilipatgandakan 10 = 10 bulan (300 hari), 6 hari Syawwal dilipatgandakan 10 = 60 hari (2 bulan). Totalnya setara 12 bulan (1 tahun penuh).',
      'Pelaksanaan: Lebih utama dikerjakan berturut-turut mulai 2 Syawwal, namun tetap sah dan berhak atas pahala bila dikerjakan secara terpisah-pisah selama masih di bulan Syawwal.',
      'Bagi yang memiliki hutang puasa Ramadan, lebih utama mengqadha puasa wajibnya terlebih dahulu.'
    ],
    niatList: [
      {
        id: 'niat-syawwal',
        name: 'Lafadz Niat Puasa 6 Hari Syawwal',
        arabic: 'نَوَيْتُ صَوْمَ سِتَّةِ أَيَّامٍ مِنْ شَهْرِ شَوَّالٍ سُنَّةً لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma sittati ayyāmin min syahri Syawwālin sunnatan lillāhi ta'ālā.",
        translation: 'Aku berniat puasa enam hari dari bulan Syawwal sunnah karena Allah Ta\'ala.',
        note: 'Diniatkan sebelum melakukan puasa di bulan Syawwal.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 1164) dari Abu Ayyub Al-Anshari RA',
        arabic: 'مَنْ صَامَ رَمَضَانَ ثُمَّ أَتْبَعَهُ سِتًّا مِنْ شَوَّالٍ كَانَ كَصِيَامِ الدَّهْرِ',
        latin: "Man shāma Ramadhāna tsumma atba'ahū sittan min Syawwālin kāna kashiyāmid-dahr.",
        translation: 'Barangsiapa berpuasa Ramadan kemudian melanjutkannya dengan enam hari di bulan Syawwal, maka (pahalanya) seperti berpuasa sepanjang tahun.',
        explanation: 'Hadits shahih yang menegaskan keutamaan luar biasa puasa 6 hari Syawwal.'
      }
    ],
    rujukan: ['Shahih Muslim', 'Al-Majmu\' Syarah Al-Muhadzdzab']
  },
  {
    id: 'puasa-arafah',
    order: 8,
    tab: 'types',
    title: 'Puasa Arafah (9 Dzulhijjah)',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'amber',
    summary: 'Puasa sunnah pada hari Arafah bagi muslim yang tidak sedang wukuf haji, menghapuskan dosa dua tahun.',
    timeInfo: 'Tanggal 9 Dzulhijjah (bertepatan dengan hari wukuf jamaah haji di Padang Arafah).',
    detailExplanation: [
      'Puasa Arafah adalah puasa sunnah tahunan paling utama dalam Islam.',
      'Keutamaan spektakuler: Menghapuskan dosa-dosa kecil satu tahun yang telah lalu dan satu tahun yang akan datang.',
      'Disunnahkan bagi seluruh umat Islam yang TIDAK sedang melaksanakan ibadah haji.',
      'Bagi jamaah yang sedang wukuf di Arafah, disunnahkan untuk tidak berpuasa agar memiliki fisik yang kuat untuk banyak berdoa dan berdzikir.'
    ],
    niatList: [
      {
        id: 'niat-arafah',
        name: 'Lafadz Niat Puasa Arafah',
        arabic: 'نَوَيْتُ صَوْمَ عَرَفَةَ سُنَّةً لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma 'arafata sunnatan lillāhi ta'ālā.",
        translation: 'Aku berniat puasa sunnah Arafah karena Allah Ta\'ala.',
        note: 'Diniatkan pada hari ke-9 Dzulhijjah.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 1162) dari Abu Qatadah RA',
        arabic: 'صِيَامُ يَوْمِ عَرَفَةَ أَحْتَسِبُ عَلَى اللَّهِ أَنْ يُكَفِّرَ السَّنَةَ الَّتِي قَبْلَهُ وَالسَّنَةَ الَّتِي بَعْدَهُ',
        latin: "Shiyāmu yaumi 'arafata ahtasibu 'alallāhi an yukaffiras-sanatallatī qablahū was-sanatallatī ba'dah.",
        translation: 'Puasa hari Arafah, aku berharap kepada Allah dapat menghapuskan (dosa) setahun yang lalu dan setahun yang akan datang.',
        explanation: 'Keutamaan pengampunan dosa 2 tahun melalui puasa 1 hari Arafah.'
      }
    ],
    rujukan: ['Shahih Muslim', 'Subulus Salam - Imam Ash-Shan\'ani']
  },
  {
    id: 'puasa-tasua-asyura',
    order: 9,
    tab: 'types',
    title: 'Puasa Tasu\'a & Asyura (9 & 10 Muharram)',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'teal',
    summary: 'Puasa pada tanggal 9 dan 10 bulan Muharram untuk memperingati diselamatkannya Nabi Musa AS dari kejaran Fir\'aun.',
    timeInfo: 'Tanggal 9 Muharram (Tasu\'a) dan 10 Muharram (Asyura).',
    detailExplanation: [
      'Puasa Asyura (10 Muharram) memiliki keutamaan menghapuskan dosa-dosa kecil setahun yang lalu.',
      'Hari Asyura adalah hari bersejarah di mana Allah menyelamatkan Nabi Musa AS dan Bani Israil serta menenggelamkan Fir\'aun dan tentaranya di Laut Merah.',
      'Rasulullah SAW menganjurkan puasa Tasu\'a (9 Muharram) mendampingi Asyura untuk membedakan ibadah umat Islam dari tradisi Yahudi.',
      'Bila memungkinkan, dianjurkan berpuasa 3 hari berturut-turut: tanggal 9, 10, dan 11 Muharram.'
    ],
    niatList: [
      {
        id: 'niat-tasua',
        name: 'Lafadz Niat Puasa Tasu\'a (9 Muharram)',
        arabic: 'نَوَيْتُ صَوْمَ تَاسُوعَاءَ سُنَّةً لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma tāsū'ā'a sunnatan lillāhi ta'ālā.",
        translation: 'Aku berniat puasa sunnah Tasu\'a karena Allah Ta\'ala.',
        note: 'Dikerjakan pada tanggal 9 Muharram.'
      },
      {
        id: 'niat-asyura',
        name: 'Lafadz Niat Puasa Asyura (10 Muharram)',
        arabic: 'نَوَيْتُ صَوْمَ عَاشُورَاءَ سُنَّةً لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma 'āsyūrā'a sunnatan lillāhi ta'ālā.",
        translation: 'Aku berniat puasa sunnah Asyura karena Allah Ta\'ala.',
        note: 'Dikerjakan pada tanggal 10 Muharram.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 1162) dari Abu Qatadah RA',
        arabic: 'وَصِيَامُ يَوْمِ عَاشُورَاءَ أَحْتَسِبُ عَلَى اللَّهِ أَنْ يُكَفِّرَ السَّنَةَ الَّتِي قَبْلَهُ',
        latin: "Wa shiyāmu yaumi 'āsyūrā'a ahtasibu 'alallāhi an yukaffiras-sanatallatī qablah.",
        translation: 'Dan puasa hari Asyura, aku berharap kepada Allah dapat menghapuskan dosa setahun yang lalu.',
        explanation: 'Keutamaan penghapusan dosa setahun penuh dengan puasa Asyura.'
      },
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 1134) dari Ibnu Abbas RA',
        arabic: 'لَئِنْ بَقِيتُ إِلَى قَابِلٍ لأَصُومَنَّ التَّاسِعَ',
        latin: "La'in baqītu ilā qābilin la'ashūmannat-tāsi'.",
        translation: 'Sungguh jika aku masih hidup sampai tahun depan, niscaya aku akan berpuasa pada hari kesembilan (Tasu\'a).'
      }
    ],
    rujukan: ['Shahih Muslim', 'Fathul Bari - Ibnu Hajar Al-Asqalani']
  },
  {
    id: 'puasa-daud',
    order: 10,
    tab: 'types',
    title: 'Puasa Daud (Puasa Paling Utama)',
    badge: 'Sunnah Tertinggi',
    badgeColor: 'purple',
    summary: 'Puasa sunnah dengan pola selang-seling: sehari berpuasa dan sehari berbuka secara berkelanjutan.',
    timeInfo: 'Dilakukan selang-seling sepanjang tahun (kecuali pada hari-hari yang diharamkan berpuasa).',
    detailExplanation: [
      'Puasa Daud adalah puasa sunnah yang paling dicintai Allah SWT dan merupakan derajat puasa sunnah tertinggi.',
      'Seseorang yang mengamalkan puasa Daud berpuasa pada satu hari, lalu berbuka pada hari berikutnya, dan berpuasa kembali pada hari berikutnya.',
      'Tidak dibenarkan berpuasa melebihi puasa Daud (seperti berpuasa setiap hari tanpa jeda/shaumud dahr) karena dilarang oleh Rasulullah SAW.',
      'Puasa ini melatih kedisiplinan diri, ketahanan fisik, dan keseimbangan antara hak ibadah kepada Allah dan hak kesehatan tubuh.'
    ],
    niatList: [
      {
        id: 'niat-daud',
        name: 'Lafadz Niat Puasa Daud',
        arabic: 'نَوَيْتُ صَوْمَ دَاوُدَ سُنَّةً لِلّٰهِ تَعَالَى',
        latin: "Nawaitu shauma dāwūda sunnatan lillāhi ta'ālā.",
        translation: 'Aku berniat puasa sunnah Daud karena Allah Ta\'ala.',
        note: 'Diniatkan pada hari giliran berpuasa.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1976) & Muslim (No. 1159)',
        arabic: 'أَحَبُّ الصِّيَامِ إِلَى اللَّهِ صِيَامُ دَاوُدَ، كَانَ يَصُومُ يَوْمًا وَيُفْطِرُ يَوْمًا',
        latin: "Ahabbush-shiyāmi ilallāhi shiyāmu dāwūd, kāna yashūmu yauman wa yufthiru yaumā.",
        translation: 'Puasa yang paling dicintai Allah adalah puasa Nabi Daud. Beliau berpuasa sehari dan berbuka sehari.',
        explanation: 'Pujian tertinggi dari Rasulullah SAW terhadap tata cara puasa Nabi Daud AS.'
      }
    ],
    rujukan: ['Shahih Al-Bukhari', 'Riyadhus Shalihin']
  },
  {
    id: 'hari-dilarang-puasa',
    order: 11,
    tab: 'types',
    title: 'Hari yang Dilarang Berpuasa (Haram & Makruh)',
    badge: 'Haram & Makruh',
    badgeColor: 'rose',
    summary: 'Hari-hari tertentu dalam kalender Islam di mana syariat mengharamkan atau memakruhkan umat Islam berpuasa.',
    timeInfo: '1 Syawwal, 10 Dzulhijjah, 11-13 Dzulhijjah (Tasyrik), hari Syak, dan hari Jumat tunggal.',
    detailExplanation: [
      'Hari yang HARAM berpuasa (bila berpuasa berdosa dan puasanya tidak sah):',
      '1. Hari Raya Idul Fitri (1 Syawwal) — Hari bergembira dan berbuka setelah Ramadan.',
      '2. Hari Raya Idul Adha (10 Dzulhijjah) — Hari menyembelih kurban dan bersuka cita.',
      '3. Hari-Hari Tasyrik (11, 12, dan 13 Dzulhijjah) — Hari makan, minum, dan berdzikir mengingat Allah.',
      '4. Hari Syak (30 Sya\'ban yang diragukan hilal) — Kecuali bagi orang yang sudah terbiasa berpuasa rutin.',
      '5. Puasa wanita yang sedang haid atau nifas.',
      'Hari yang MAKRUH berpuasa:',
      '1. Puasa khusus hari Jumat saja atau hari Sabtu saja tanpa disambung dengan hari sebelum atau sesudahnya.',
      '2. Puasa sepanjang masa (Shaumud Dahr) tanpa pernah berbuka.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1990) & Muslim (No. 1138)',
        arabic: 'نَهَى رَسُولُ اللَّهِ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ عَنْ صِيَامِ يَوْمَيْنِ: يَوْمِ الْفِطْرِ وَيَوْمِ النَّحْرِ',
        latin: "Nahā rasūlullāhi shallallāhu 'alaihi wa sallama 'an shiyāmi yaumain: yaumil-fithri wa yaumin-nahr.",
        translation: 'Rasulullah SAW melarang berpuasa pada dua hari: Hari Raya Idul Fitri dan Hari Raya Idul Adha (Kurban).',
        explanation: 'Larangan mutlak berpuasa pada dua hari raya Islam.'
      },
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 1141) dari Nubaisyah Al-Hudzali RA',
        arabic: 'أَيَّامُ التَّشْرِيقِ أَيَّامُ أَكْلٍ وَشُرْبٍ وَذِكْرٍ لِلَّهِ',
        latin: "Ayyāmut-tasyrīqi ayyāmu aklin wa syurbin wa dzikril-lillāh.",
        translation: 'Hari-hari Tasyrik (11, 12, 13 Dzulhijjah) adalah hari-hari untuk makan, minum, dan mengingat Allah SWT.'
      }
    ],
    rujukan: ['Bidayatul Mujtahid', 'Fathul Wahhab - Syaikh Zakariya Al-Anshari']
  },

  // ==========================================
  // TAB 2: AMALAN SUNNAH PUASA (recommended)
  // ==========================================
  {
    id: 'amalan-sahur',
    order: 1,
    tab: 'recommended',
    title: 'Makan Sahur dan Keberkahannya',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'emerald',
    summary: 'Menyantap makanan atau minuman sebelum fajar yang mengandung keberkahan dan kekuatan untuk berpuasa.',
    timeInfo: 'Malam hari hingga sesaat sebelum terbit fajar shadiq (Subuh).',
    detailExplanation: [
      'Sahur adalah sunnah yang sangat ditekankan oleh Rasulullah SAW karena terdapat keberkahan di dalamnya.',
      'Sahur sudah tercapai pahalanya meskipun hanya dengan meminum seteguk air atau memakan sebutir kurma.',
      'Sahur membedakan puasa kaum muslimin dengan puasa ahli kitab (Yahudi dan Nasrani).',
      'Para malaikat bershalawat dan mendoakan ampunan bagi orang-orang yang makan sahur.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1923) & Muslim (No. 1095)',
        arabic: 'تَسَحَّرُوا فَإِنَّ فِي السَّحُورِ بَرَكَةً',
        latin: "Tasahharū fa inna fis-sahūri barakah.",
        translation: 'Makan sahurlah kalian, karena sesungguhnya di dalam sahur itu terdapat keberkahan.',
        explanation: 'Perintah sunnah Nabi SAW untuk tidak meninggalkan sahur.'
      },
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 1096) dari Amr bin Al-Ash RA',
        arabic: 'فَصْلُ مَا بَيْنَ صِيَامِنَا وَصِيَامِ أَهْلِ الْكِتَابِ أَكْلَةُ السَّحَرِ',
        latin: "Fashlu mā baina shiyāminā wa shiyāmi ahlil-kitābi aklatus-sahar.",
        translation: 'Pembeda antara puasa kita (umat Islam) dengan puasa Ahli Kitab adalah makan sahur.'
      }
    ],
    rujukan: ['Shahih Bukhari', 'Shahih Muslim', 'Riyadhus Shalihin']
  },
  {
    id: 'amalan-akhirkan-sahur',
    order: 2,
    tab: 'recommended',
    title: 'Mengakhirkan Waktu Sahur',
    badge: 'Sunnah',
    badgeColor: 'teal',
    summary: 'Menunda waktu makan sahur hingga mendekati waktu terbit fajar (waktu imsak).',
    timeInfo: 'Sekitar 15-30 menit sebelum azan Subuh berkumandang.',
    detailExplanation: [
      'Disunnahkan mengakhirkan sahur mendekati waktu fajar selama tidak ragu akan masuknya waktu Subuh.',
      'Jarak waktu selesainya sahur Rasulullah SAW dengan adzan Subuh diperkirakan seukuran membaca 50 ayat Al-Qur\'an.',
      'Waktu Imsak (sekitar 10 menit sebelum Subuh) merupakan tindakan kehati-hatian (ihtiyath) agar tidak makan saat adzan berkumandang.',
      'Batas akhir boleh makan dan minum adalah saat terbit fajar shadiq (masuknya waktu shalat Subuh).'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1921) & Muslim (No. 1097)',
        arabic: 'تَسَحَّرْنَا مَعَ النَّبِيِّ ثُمَّ قَامَ إِلَى الصَّلاَةِ. قُلْتُ: كَمْ كَانَ بَيْنَ الأَذَانِ وَالسَّحُورِ؟ قَالَ: قَدْرُ خَمْسِينَ آيَةً',
        latin: "Tasahharnā ma'an-nabiyyi tsumma qāma ilash-shalāh. Qultu: kam kāna bainal-adzāni was-sahūr? Qāla: qadru khamsīna āyah.",
        translation: 'Kami makan sahur bersama Nabi SAW kemudian beliau bangkit untuk shalat. Aku bertanya: Berapa lama jarak antara adzan dan sahur? Beliau menjawab: Kira-kira seukuran membaca 50 ayat.',
        explanation: 'Bukti amaliah sunnah mengakhirkan sahur.'
      }
    ],
    rujukan: ['Shahih Al-Bukhari', 'Fathul Bari']
  },
  {
    id: 'amalan-segerakan-berbuka',
    order: 3,
    tab: 'recommended',
    title: 'Menyegerakan Berbuka Puasa',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'emerald',
    summary: 'Segera membatalkan puasa tepat saat matahari telah terbenam (masuk waktu Maghrib).',
    timeInfo: 'Saat matahari terbenam sempurna / azan Maghrib mulai berkumandang.',
    detailExplanation: [
      'Menyegerakan berbuka adalah tanda kebaikan umat Islam yang selalu berada di atas sunnah.',
      'Disunnahkan berbuka dengan kurma basah (ruthab), jika tidak ada maka kurma kering (tamr), jika tidak ada maka air putih.',
      'Mendahulukan berbuka puasa dan shalat Maghrib sebelum makan makanan berat.',
      'Tidak menunda berbuka puasa tanpa alasan syar\'i.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1957) & Muslim (No. 1098)',
        arabic: 'لاَ يَزَالُ النَّاسُ بِخَيْرٍ مَا عَجَّلُوا الْفِطْرَ',
        latin: "Lā yazālun-nāsu bikhairin mā 'ajjalul-fithr.",
        translation: 'Manusia akan senantiasa berada dalam kebaikan selama mereka menyegerakan berbuka puasa.',
        explanation: 'Keberkahan dan kebaikan selalu menyertai mereka yang menyegerakan berbuka.'
      },
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 2356) & At-Tirmidzi (No. 696)',
        arabic: 'كَانَ رَسُولُ اللَّهِ يُفْطِرُ عَلَى رُطَبَاتٍ قَبْلَ أَنْ يُصَلِّيَ، فَإِنْ لَمْ تَكُنْ رُطَبَاتٌ فَعَلَى تَمَرَاتٍ، فَإِنْ لَمْ تَكُنْ حَسَا حَسَوَاتٍ مِنْ مَاءٍ',
        latin: "Kāna rasūlullāhi yufthiru 'alā ruthabātin qabla an yushalliya, fa in lam takun ruthabātun fa'alā tamarāt, fa in lam takun hasā hasawātin mim-mā'.",
        translation: 'Rasulullah SAW biasa berbuka dengan beberapa biji kurma basah sebelum shalat. Jika tidak ada, dengan kurma kering. Jika tidak ada, beliau meneguk beberapa teguk air.'
      }
    ],
    rujukan: ['Sunan Abi Dawud', 'Shahih Al-Bukhari']
  },
  {
    id: 'amalan-doa-berbuka',
    order: 4,
    tab: 'recommended',
    title: 'Membaca Doa Berbuka Puasa yang Shahih',
    badge: 'Sunnah',
    badgeColor: 'teal',
    summary: 'Melafalkan doa syukur saat membatalkan puasa sebagai bentuk pengakuan atas nikmat dan pertolongan Allah.',
    timeInfo: 'Saat mencicipi makanan/minuman pembuka puasa di waktu Maghrib.',
    detailExplanation: [
      'Waktu berbuka puasa adalah salah satu waktu mustajab di mana doa orang yang berpuasa tidak akan tertolak.',
      'Terdapat dua lafadz doa berbuka yang masyhur diamalkan: doa riwayat Abu Dawud (Dzahabazh Zhama\'u) yang dinilai shahih, dan doa masyhur (Allahumma laka shumtu).',
      'Dianjurkan memanjatkan doa-doa kebaikan pribadi dan umat sebelum atau sesaat setelah berbuka.'
    ],
    doaList: [
      {
        id: 'doa-buka-shahih',
        name: 'Doa Berbuka Puasa Shahih (HR. Abu Dawud)',
        arabic: 'ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الأَجْرُ إِنْ شَاءَ اللَّهُ',
        latin: "Dzahabazh-zhama'u wabtallatil-'urūqu wa tsabatal-ajru in syā'allāh.",
        translation: 'Telah hilang rasa haus, telah basah urat-urat, dan telah tetap pahala, insya Allah.',
        note: 'Hadits shahih riwayat Abu Dawud (No. 2357).'
      },
      {
        id: 'doa-buka-masyhur',
        name: 'Doa Berbuka Puasa Masyhur',
        arabic: 'اللَّهُمَّ لَكَ صُمْتُ وَعَلَى رِزْقِكَ أَفْطَرْتُ بِرَحْمَتِكَ يَا أَرْحَمَ الرَّاحِمِينَ',
        latin: "Allāhumma laka shumtu wa 'alā rizqika afthartu birahmatika yā arhamar-rāhimīn.",
        translation: 'Ya Allah, untuk-Mu aku berpuasa dan dengan rezeki-Mu aku berbuka, dengan rahmat-Mu wahai Tuhan Yang Maha Pengasih.',
        note: 'Banyak diamalkan oleh para ulama dan masyarakat muslim.'
      }
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 2357) & An-Nasa\'i',
        arabic: 'كَانَ رَسُولُ اللَّهِ إِذَا أَفْطَرَ قَالَ: ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الأَجْرُ إِنْ شَاءَ اللَّهُ',
        latin: "Kāna rasūlullāhi idzā afthara qāla: dzahabazh-zhama'u wabtallatil-'urūqu wa tsabatal-ajru in syā'allāh.",
        translation: 'Adalah Rasulullah SAW apabila berbuka puasa membaca: "Telah hilang rasa haus, telah basah urat-urat, dan telah tetap pahala insya Allah."',
        explanation: 'Doa resmi Rasulullah SAW saat meneguk air berbuka puasa.'
      },
      {
        type: 'hadith',
        source: 'HR. At-Tirmidzi (No. 3598)',
        arabic: 'ثَلاَثَةٌ لاَ تُرَدُّ دَعْوَتُهُمْ: الصَّائِمُ حَتَّى يُفْطِرَ، وَالإِمَامُ الْعَادِلُ، وَدَعْوَةُ الْمَظْلُومِ',
        latin: "Tsalātsatun lā turaddu da'watuhum: ash-shā'imu hattā yufthir, wal-imāmul-'ādil, wa da'watul-mazhlūm.",
        translation: 'Tiga orang yang tidak tertolak doanya: orang yang berpuasa hingga ia berbuka, pemimpin yang adil, dan doa orang yang terzalimi.'
      }
    ],
    rujukan: ['Sunan Abi Dawud', 'Sunan At-Tirmidzi', 'Al-Adzkar - Imam Nawawi']
  },
  {
    id: 'amalan-memberi-makan-berbuka',
    order: 5,
    tab: 'recommended',
    title: 'Memberi Makan Orang yang Berpuasa (Iftar)',
    badge: 'Sunnah Bernilai Pahala Besar',
    badgeColor: 'amber',
    summary: 'Menyediakan makanan atau hidangan berbuka bagi orang lain yang berpuasa.',
    timeInfo: 'Menjelang waktu berbuka puasa Maghrib.',
    detailExplanation: [
      'Orang yang memberi makan orang berpuasa akan mendapatkan pahala yang setara dengan pahala orang yang berpuasa tersebut tanpa mengurangi pahalanya sedikitpun.',
      'Pahala ini berlaku meskipun hanya memberikan sebutir kurma, seteguk air, atau hidangan makan malam lengkap.',
      'Menjadi sarana mempererat tali ukhuwah islamiyah dan solidaritas sosial umat.',
      'Termasuk sedekah yang paling utama di bulan Ramadan.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. At-Tirmidzi (No. 807) & Ibnu Majah (No. 1746)',
        arabic: 'مَنْ فَطَّرَ صَائِمًا كَانَ لَهُ مِثْلُ أَجْرِهِ، غَيْرَ أَنَّهُ لاَ يَنْقُصُ مِنْ أَجْرِ الصَّائِمِ شَيْئًا',
        latin: "Man fath-thara shā'iman kāna lahū mitslu ajrih, ghaira annahū lā yanqushu min ajrish-shā'imi syai'ā.",
        translation: 'Barangsiapa memberi makan berbuka puasa kepada orang yang berpuasa, maka baginya pahala seperti orang yang berpuasa tersebut tanpa mengurangi pahala orang itu sedikitpun.',
        explanation: 'Keutamaan luar biasa berbagi hidangan berbuka puasa.'
      }
    ],
    rujukan: ['Sunan At-Tirmidzi', 'Riyadhus Shalihin']
  },
  {
    id: 'amalan-tilawah-quran',
    order: 6,
    tab: 'recommended',
    title: 'Membaca & Mentadabburi Al-Qur\'an (Tadarus)',
    badge: 'Sunnah Utama',
    badgeColor: 'emerald',
    summary: 'Memperbanyak interaksi dengan Al-Qur\'an di bulan Ramadan, bulan diturunkannya kitab suci Al-Qur\'an.',
    timeInfo: 'Sepanjang siang dan malam di bulan Ramadan.',
    detailExplanation: [
      'Ramadan adalah Syahrul Qur\'an (bulan Al-Qur\'an) karena pada bulan inilah Al-Qur\'an pertama kali diturunkan.',
      'Malaikat Jibril AS menemui Rasulullah SAW setiap malam di bulan Ramadan untuk bertadarus dan menyimak bacaan Al-Qur\'an beliau.',
      'Para ulama salaf mengutamakan membaca dan mengkhatamkan Al-Qur\'an dibandingkan ibadah sunnah lainnya saat bulan Ramadan.',
      'Membaca satu huruf dari Al-Qur\'an mendatangkan 10 kebaikan, yang dilipatgandakan berkali-kali lipat pada bulan Ramadan.'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Baqarah: 185',
        arabic: 'شَهْرُ رَمَضَانَ الَّذِي أُنْزِلَ فِيهِ الْقُرْآنُ هُدًى لِلنَّاسِ وَبَيِّنَاتٍ مِنَ الْهُدَىٰ وَالْفُرْقَانِ',
        latin: "Syahru Ramadhānalladzī unzila fīhil-Qur'ānu hudal-linnāsi wa bayyinātim-minal-hudā wal-furqān.",
        translation: 'Bulan Ramadan adalah (bulan) yang di dalamnya diturunkan Al-Qur\'an sebagai petunjuk bagi manusia dan penjelasan-penjelasan mengenai petunjuk itu dan pembeda (antara yang benar dan yang batil).',
        explanation: 'Keterikatan erat dan abadi antara bulan Ramadan dengan Al-Qur\'an.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 6) & Muslim (No. 2308)',
        arabic: 'كَانَ جِبْرِيلُ يَلْقَاهُ فِي كُلِّ لَيْلَةٍ مِنْ رَمَضَانَ فَيُدَارِسُهُ الْقُرْآنَ',
        latin: "Kāna Jibrīlu yalqāhu fī kulli lailatim-mir-Ramadhāna fayudārisuhul-Qur'ān.",
        translation: 'Malaikat Jibril senantiasa menemui Nabi SAW pada setiap malam di bulan Ramadan untuk saling bertadarus Al-Qur\'an.'
      }
    ],
    rujukan: ['Shahih Al-Bukhari', 'Latha\'if Al-Ma\'arif - Ibnu Rajab']
  },
  {
    id: 'amalan-jaga-lisan',
    order: 7,
    tab: 'recommended',
    title: 'Menjaga Lisan dan Perilaku dari Dosa',
    badge: 'Kewajiban Hakikat Puasa',
    badgeColor: 'rose',
    summary: 'Menahan lidah dari dusta, ghibah, fitnah, adu domba, dan perkataan kotor agar pahala puasa tidak sirna.',
    timeInfo: 'Sepanjang berpuasa dan seluruh kehidupan.',
    detailExplanation: [
      'Hakikat puasa bukan hanya menahan lapar dan dahaga, melainkan menahan seluruh anggota badan dari perbuatan dosa.',
      'Perkataan dusta (az-zur), ghibah (menggunjing), namimah (adu domba), dan pertengkaran dapat menghapuskan seluruh pahala puasa hingga tersisa rasa lapar belaka.',
      'Bila ada seseorang yang mencela atau mengajak bertengkar, disunnahkan untuk menahan diri dan berkata: "Innī shā\'im" (Sesungguhnya aku sedang berpuasa).'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1903) dari Abu Hurairah RA',
        arabic: 'مَنْ لَمْ يَدَعْ قَوْلَ الزُّورِ وَالْعَمَلَ بِهِ فَلَيْسَ لِلَّهِ حَاجَةٌ فِي أَنْ يَدَعَ طَعَامَهُ وَشَرَابَهُ',
        latin: "Mal-lam yada' qaulaz-zūri wal-'amala bihī falaisa lillāhi hājatun fī ay-yada'a tha'āmahū wa syarābah.",
        translation: 'Barangsiapa yang tidak meninggalkan perkataan dusta dan perbuatan maksiat, maka Allah tidak butuh terhadap puasanya yang meninggalkan makan dan minum.',
        explanation: 'Peringatan keras bagi orang yang berpuasa tetapi tidak menjaga lisan dan akhlak.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1894) & Muslim (No. 1151)',
        arabic: 'وَإِذَا كَانَ يَوْمُ صَوْمِ أَحَدِكُمْ فَلاَ يَرْفُثْ وَلاَ يَصْخَبْ، فَإِنْ سَابَّهُ أَحَدٌ أَوْ قَاتَلَهُ فَلْيَقُلْ: إِنِّي امْرُؤٌ صَائِمٌ',
        latin: "Wa idzā kāna yaumu shaumi ahadikum falā yarfuts wa lā yashkhab, fa in sābbahū ahadun au qātalahū fal-yaqul: innī-mru'un shā'im.",
        translation: 'Dan apabila hari puasa salah seorang di antara kalian, maka janganlah berkata kotor dan jangan bertengkar. Jika ada orang yang mencelanya atau mengajaknya berkelahi, hendaklah ia berkata: "Sesungguhnya aku sedang berpuasa."'
      }
    ],
    rujukan: ['Shahih Al-Bukhari', 'Ihya Ulumiddin - Imam Al-Ghazali']
  },
  {
    id: 'amalan-itikaf-lailatul-qadar',
    order: 8,
    tab: 'recommended',
    title: 'I\'tikaf di 10 Malam Terakhir & Meraih Lailatul Qadar',
    badge: 'Sunnah Mu\'akkad',
    badgeColor: 'purple',
    summary: 'Berdiam diri di masjid dengan niat beribadah pada sepuluh malam terakhir Ramadan demi meraih Lailatul Qadar.',
    timeInfo: 'Malam ke-21 hingga akhir Ramadan (terutama malam-malam ganjil: 21, 23, 25, 27, 29).',
    detailExplanation: [
      'Rasulullah SAW selalu bersungguh-sungguh mengencangkan ikat pinggang dan menghidupkan malam pada sepuluh malam terakhir Ramadan.',
      'I\'tikaf dilakukan di masjid dengan fokus shalat, dzikir, membaca Al-Qur\'an, berdoa, dan muhasabah diri.',
      'Malam Lailatul Qadar adalah malam kemuliaan yang lebih baik daripada seribu bulan (83 tahun 4 bulan).',
      'Doa khusus Lailatul Qadar yang diajarkan Rasulullah SAW kepada Aisyah RA adalah memohon ampunan (Al-\'Afw).'
    ],
    doaList: [
      {
        id: 'doa-lailatul-qadar',
        name: 'Doa Meraih Lailatul Qadar (Ajaran Nabi SAW)',
        arabic: 'اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي',
        latin: "Allāhumma innaka 'afuwwun tuhibbul-'afwa fa'fu 'annī.",
        translation: 'Ya Allah, sesungguhnya Engkau Maha Pengampun lagi Maha Pemaaf, Engkau menyukai pemaafan, maka maafkanlah (dan ampunilah) daku.',
        note: 'HR. At-Tirmidzi (No. 3513) dan Ibnu Majah (No. 3850).'
      }
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Qadr: 1-3',
        arabic: 'إِنَّا أَنْزَلْنَاهُ فِي لَيْلَةِ الْقَدْرِ . وَمَا أَدْرَاكَ مَا لَيْلَةُ الْقَدْرِ . لَيْلَةُ الْقَدْرِ خَيْرٌ مِنْ أَلْفِ شَهْرٍ',
        latin: "Innā anzalnāhu fī lailatil-qadr. Wa mā adrāka mā lailatul-qadr. Lailatul-qadri khairum-min alfi syahr.",
        translation: 'Sesungguhnya Kami telah menurunkannya (Al-Qur\'an) pada malam kemuliaan. Dan tahukah kamu apakah malam kemuliaan itu? Malam kemuliaan itu lebih baik dari seribu bulan.',
        explanation: 'Keagungan malam Lailatul Qadar yang tiada tandingannya.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 2024) & Muslim (No. 1174)',
        arabic: 'كَانَ رَسُولُ اللَّهِ إِذَا دَخَلَ الْعَشْرُ أَحْيَا اللَّيْلَ، وَأَيْقَظَ أَهْلَهُ، وَجَدَّ وَشَدَّ الْمِئْزَرَ',
        latin: "Kāna rasūlullāhi idzā dakhalal-'asyru ahyal-laila, wa aiqazha ahlahū, wa jadda wa syaddal-mi'zar.",
        translation: 'Rasulullah SAW apabila masuk sepuluh hari terakhir (Ramadan), beliau menghidupkan malam, membangunkan keluarganya, dan bersungguh-sungguh mengencangkan ikat pinggangnya.'
      }
    ],
    rujukan: ['Shahih Bukhari', 'Sunan At-Tirmidzi']
  },

  // ==========================================
  // TAB 3: HAL MEMBATALKAN PUASA (invalidators)
  // ==========================================
  {
    id: 'pembatal-makan-minum',
    order: 1,
    tab: 'invalidators',
    title: 'Makan atau Minum dengan Sengaja',
    badge: 'Batal & Wajib Qadha',
    badgeColor: 'rose',
    summary: 'Memasukkan makanan, minuman, atau zat apa pun ke dalam rongga pencernaan secara sengaja dan sadar.',
    detailExplanation: [
      'Makan dan minum dengan sengaja saat waktu puasa membatalkan puasa secara ijma\' (kesepakatan bulat ulama).',
      'Pelaku wajib mengqadha puasanya dan bertaubat kepada Allah SWT.',
      'Pengecualian LUPA: Jika seseorang makan atau minum dalam keadaan benar-benar lupa bahwa ia sedang berpuasa, puasanya TIDAK batal dan wajib melanjutkan puasanya karena itu adalah rezeki dari Allah.',
      'Syarat batal: Mengetahui keharamannya, sadar sedang berpuasa, dan melakukannya atas kehendak sendiri (bukan dipaksa).'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Baqarah: 187',
        arabic: 'وَكُلُوا وَاشْرَبُوا حَتَّىٰ يَتَبَيَّنَ لَكُمُ الْخَيْطُ الْأَبْيَضُ مِنَ الْخَيْطِ الْأَسْوَدِ مِنَ الْفَجْرِ ۖ ثُمَّ أَتِمُّوا الصِّيَامَ إِلَى اللَّيْلِ',
        latin: "Wa kulū wasyrabū hattā yatabayyana lakumul-khaithul-abyadhu minal-khaithil-aswadi minal-fajr, tsumma atimmush-shiyāma ilal-lail.",
        translation: 'Dan makan minumlah hingga terang bagimu benang putih dari benang hitam, yaitu fajar. Kemudian sempurnakanlah puasa itu sampai (datang) malam.',
        explanation: 'Batasan waktu makan/minum dan kewajiban menahan diri hingga maghrib.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1933) & Muslim (No. 1155) dari Abu Hurairah RA',
        arabic: 'مَنْ نَسِيَ وَهُوَ صَائِمٌ فَأَكَلَ أَوْ شَرِبَ فَلْيُتِمَّ صَوْمَهُ، فَإِنَّمَا أَطْعَمَهُ اللَّهُ وَسَقَاهُ',
        latin: "Man nasiya wa huwa shā'imun fa akala au syariba falyutimma shaumah, fa innamā ath'amahullāhu wa saqāh.",
        translation: 'Barangsiapa yang lupa sedangkan ia dalam keadaan berpuasa, lalu ia makan atau minum, maka hendaklah ia menyempurnakan puasanya, karena sesungguhnya Allah-lah yang memberinya makan dan minum.'
      }
    ],
    rujukan: ['Al-Majmu\' Syarah Al-Muhadzdzab', 'Fathul Qarib']
  },
  {
    id: 'pembatal-hubungan-badan',
    order: 2,
    tab: 'invalidators',
    title: 'Bersetubuh (Jima\') di Siang Hari',
    badge: 'Batal + Qadha + Kafarat Berat',
    badgeColor: 'rose',
    summary: 'Melakukan hubungan suami istri di siang hari Ramadan saat sedang berpuasa.',
    detailExplanation: [
      'Bersetubuh di siang hari bulan Ramadan saat berpuasa merupakan pembatal puasa paling berat dan dosa besar.',
      'Konsekuensi hukum bagi suami: Puasa batal, berdosa besar, wajib qadha 1 hari, dan WAJIB menunaikan Kafarat Kubra (Denda Berat).',
      'Urutan Kafarat Kubra: (1) Memerdekakan seorang budak muslim, jika tidak mampu maka (2) Berpuasa 2 bulan berturut-turut, jika tidak mampu maka (3) Memberi makan 60 orang miskin (masing-masing 1 mud/0.75 kg beras).',
      'Hubungan suami istri diperbolehkan pada malam hari (setelah Maghrib hingga sebelum Subuh).'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Baqarah: 187',
        arabic: 'أُحِلَّ لَكُمْ لَيْلَةَ الصِّيَامِ الرَّفَثُ إِلَىٰ نِسَائِكُمْ',
        latin: "Uhilla lakum lailatash-shiyāmir-rafatsu ilā nisā'ikum.",
        translation: 'Dihalalkan bagi kamu pada malam hari bulan puasa bercampur dengan istri-istri kamu.',
        explanation: 'Kehalalan jima\' hanya berlaku pada malam hari puasa.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1936) & Muslim (No. 1111)',
        arabic: 'جَاءَ رَجُلٌ إِلَى النَّبِيِّ فَقَالَ: هَلَكْتُ! قَالَ: وَمَا أَهْلَكَكَ؟ قَالَ: وَقَعْتُ عَلَى امْرَأَتِي فِي رَمَضَانَ',
        latin: "Jā'a rajulun ilan-nabiyyi faqāla: halaktu! Qāla: wa mā ahlakak? Qāla: waqa'tu 'alāmra'atī fī Ramadhān.",
        translation: 'Seorang laki-laki datang kepada Nabi SAW seraya berkata: "Celaka aku!" Nabi bertanya: "Apa yang mencelakakanmu?" Ia menjawab: "Aku telah bersetubuh dengan istriku di siang hari Ramadan."'
      }
    ],
    rujukan: ['Shahih Bukhari', 'Bidayatul Mujtahid']
  },
  {
    id: 'pembatal-keluar-mani',
    order: 3,
    tab: 'invalidators',
    title: 'Mengeluarkan Mani dengan Sengaja',
    badge: 'Batal & Wajib Qadha',
    badgeColor: 'rose',
    summary: 'Keluarnya sperma/mani akibat perbuatan sengaja seperti onani/masturbasi atau sentuhan bernafsu.',
    detailExplanation: [
      'Keluarnya mani yang disebabkan oleh tindakan sengaja (onani, masturbasi, atau bercumbu) membatalkan puasa menurut kesepakatan empat mazhab.',
      'Hukumnya: Puasa batal, berdosa, dan wajib mengqadha hari tersebut setelah Ramadan.',
      'Pengecualian Mimpi Basah (Ihtilam): Keluarnya mani karena mimpi basah di saat tidur TIDAK membatalkan puasa karena terjadi di luar kehendak dan kesadaran.',
      'Keluarnya cairan madzi atau wadi menurut mazhab Syafi\'i tidak membatalkan puasa, namun membatalkan wudhu.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1894) - Hadits Qudsi',
        arabic: 'يَتْرُكُ طَعَامَهُ وَشَرَابَهُ وَشَهْوَتَهُ مِنْ أَجْلِي',
        latin: "Yatruku tha'āmahū wa syarābahū wa syahwatahū min ajlī.",
        translation: 'Ia (orang yang berpuasa) meninggalkan makanannya, minumannya, dan syahwatnya demi Aku.',
        explanation: 'Orang yang sengaja memuaskan syahwatnya telah melanggar prinsip dasar puasa.'
      }
    ],
    rujukan: ['Al-Majmu\' - Imam Nawawi', 'Al-Mughni - Ibnu Qudamah']
  },
  {
    id: 'pembatal-muntah-sengaja',
    order: 4,
    tab: 'invalidators',
    title: 'Muntah yang Disengaja (Istiqā\'ah)',
    badge: 'Batal & Wajib Qadha',
    badgeColor: 'rose',
    summary: 'Sengaja memicu muntah dengan memasukkan jari ke tenggorokan atau cara lainnya.',
    detailExplanation: [
      'Sengaja membuat diri muntah membatalkan puasa, baik yang keluar sedikit maupun banyak.',
      'Muntah tanpa sengaja (karena mual, sakit, atau pusing) TIDAK membatalkan puasa sama sekali, asalkan tidak ada sisa muntahan yang sengaja ditelan kembali.',
      'Setelah muntah tidak sengaja, mulut cukup berkumur untuk membersihkan najis dan melanjutkan puasa.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 2380), At-Tirmidzi (No. 720), Ibnu Majah (No. 1676)',
        arabic: 'مَنْ ذَرَعَهُ الْقَيْءُ فَلَيْسَ عَلَيْهِ قَضَاءٌ، وَمَنِ اسْتَقَاءَ عَمْدًا فَلْيَقْضِ',
        latin: "Man dzara'ahul-qai'u falaisa 'alaihi qadhā', wa manis-taqā'a 'amdan falyaqdh.",
        translation: 'Barangsiapa yang terdorong muntah (tidak sengaja) maka tidak ada qadha baginya, dan barangsiapa yang sengaja memancing muntah maka wajib mengqadha.',
        explanation: 'Pembeda yang jelas antara muntah spontan dan muntah disengaja.'
      }
    ],
    rujukan: ['Sunan Abi Dawud', 'Sunan At-Tirmidzi']
  },
  {
    id: 'pembatal-haid-nifas',
    order: 5,
    tab: 'invalidators',
    title: 'Keluarnya Darah Haid atau Nifas',
    badge: 'Batal & Wajib Qadha',
    badgeColor: 'rose',
    summary: 'Keluarnya darah haid atau nifas bagi wanita, meskipun sesaat sebelum matahari terbenam.',
    detailExplanation: [
      'Wanita yang mengalami haid atau nifas otomatis puasanya batal seketika, meskipun darah baru keluar satu menit sebelum adzan Maghrib.',
      'Wanita haid dan nifas diharamkan berpuasa, dan wajib mengqadha hari-hari yang ditinggalkan setelah suci di luar bulan Ramadan.',
      'Darah istihadhah (darah penyakit di luar siklus haid/nifas) TIDAK membatalkan puasa dan tetap wajib berpuasa.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 304) dari Abu Sa\'id Al-Khudri RA',
        arabic: 'أَلَيْسَ إِذَا حَاضَتْ لَمْ تُصَلِّ وَلَمْ تَصُمْ؟ قُلْنَ: بَلَى',
        latin: "A laisa idzā hādhat lam tushalli wa lam tashum? Qulna: balā.",
        translation: 'Bukankah wanita itu jika sedang haid ia tidak shalat dan tidak berpuasa? Para wanita menjawab: Benar.',
        explanation: 'Dalil ijma\' bahwa haid menggugurkan keabsahan puasa.'
      }
    ],
    rujukan: ['Shahih Bukhari', 'Al-Majmu\' Syarah Al-Muhadzdzab']
  },
  {
    id: 'pembatal-memasukkan-benda-rongga',
    order: 6,
    tab: 'invalidators',
    title: 'Memasukkan Benda ke Lubang Terbuka Tubuh (Jauf)',
    badge: 'Batal (Ketentuan Fiqih)',
    badgeColor: 'rose',
    summary: 'Memasukkan benda nyata (\'ain) ke dalam rongga tubuh terbuka seperti mulut, hidung hingga pangkal, telinga, atau kubul/dubur.',
    detailExplanation: [
      'Menurut mazhab Syafi\'i, masuknya benda (\'ain) secara sengaja melalui lubang terbuka (manfad maftuh) menuju rongga dalam (jauf) membatalkan puasa.',
      'Lubang terbuka meliputi: Mulut, hidung (sampai pangkal hidung/tenggorokan), telinga, kemaluan depan, dan anus.',
      'Berkumur-kumur atau istinsyaq (menghirup air ke hidung) saat wudhu TIDAK membatalkan puasa selama tidak berlebihan (mubalaghah).',
      'Menelan air liur sendiri yang murni dan berada di dalam mulut tidak membatalkan puasa.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 142) & At-Tirmidzi (No. 788)',
        arabic: 'وَبَالِغْ فِي الاِسْتِنْشَاقِ إِلاَّ أَنْ تَكُونَ صَائِمًا',
        latin: "Wa bāligh fil-istin syāqi illā an takūna shā'imā.",
        translation: 'Dan bersungguh-sungguhlah dalam menghirup air ke hidung (saat wudhu) kecuali jika engkau sedang berpuasa.',
        explanation: 'Larangan berlebihan memasukkan air saat berpuasa agar tidak tertelan.'
      }
    ],
    rujukan: ['Matan Fathul Qarib', 'Tuhfatul Muhtaj']
  },
  {
    id: 'pembatal-infus-nutrisi',
    order: 7,
    tab: 'invalidators',
    title: 'Suntikan & Infus yang Mengandung Nutrisi',
    badge: 'Batal (Fatwa Kontemporer)',
    badgeColor: 'rose',
    summary: 'Pemberian cairan infus atau injeksi yang berfungsi menggantikan makanan/minuman dan memberi suplai energi.',
    detailExplanation: [
      'Infus intravena (IV drip) yang mengandung cairan nutrisi, glukosa, atau elektrolit yang menggantikan rasa lapar/haus membatalkan puasa menurut mayoritas ulama dan Lembaga Fiqih Internasional.',
      'Suntikan obat (injeksi intramuskular/subkutan) yang TIDAK mengandung nutrisi (seperti antibiotik, insulin diabetes, atau vaksin) TIDAK membatalkan puasa.',
      'Pengambilan sampel darah sedikit untuk tes laboratorium tidak membatalkan puasa.'
    ],
    dalilList: [
      {
        type: 'kaidah',
        source: 'Keputusan Majma\' Al-Fiqh Al-Islami (No. 93)',
        arabic: 'الحُقَنُ المُغَذِّيَةُ تُفْطِرُ الصَّائِمَ لِأَنَّهَا بِمَعْنَى الأَكْلِ وَالشُّرْبِ',
        latin: "Al-huqanul-mughaddziyatu tufthirush-shā'ima li'annahā bima'nal-akli wasy-syurb.",
        translation: 'Suntikan/infus nutrisi membatalkan puasa karena fungsinya semakna dengan makan dan minum.',
        explanation: 'Kaidah fiqih kontemporer mengenai prosedur medis saat berpuasa.'
      }
    ],
    rujukan: ['Keputusan Lembaga Fikih OKI (Majma\' Fiqh Islami)', 'Fatwa MUI']
  },
  {
    id: 'pembatal-murtad-hilang-akal',
    order: 8,
    tab: 'invalidators',
    title: 'Murtad dan Hilang Akal (Gila/Pingsan)',
    badge: 'Batal Otomatis',
    badgeColor: 'rose',
    summary: 'Keluar dari Islam (murtad) atau kehilangan akal sehat karena gila atau pingsan sepanjang hari.',
    detailExplanation: [
      'Murtad (keluar dari Islam) membatalkan seluruh amal ibadah seketika, termasuk puasa.',
      'Gila walau hanya sesaat di siang hari membatalkan puasa karena syarat sah puasa adalah berakal (tamyiz).',
      'Pingsan atau mabuk sepanjang hari dari terbit fajar hingga terbenam matahari membatalkan puasa. Namun bila sempat sadar walau sekejap di siang hari, puasanya tetap sah menurut mazhab Syafi\'i.'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Az-Zumar: 65',
        arabic: 'لَئِنْ أَشْرَكْتَ لَيَحْبَطَنَّ عَمَلُكَ وَلَتَكُونَنَّ مِنَ الْخَاسِرِينَ',
        latin: "La'in asyrakta layahbathanna 'amaluka wa latakūnanna minal-khāsirīn.",
        translation: 'Jika engkau mempersekutukan (Allah), niscaya akan hapuslah amalmu dan tentulah engkau termasuk orang-orang yang merugi.',
        explanation: 'Kemurtadan menggugurkan seluruh keabsahan ibadah.'
      }
    ],
    rujukan: ['Al-Majmu\' Syarah Al-Muhadzdzab', 'Kifayatul Akhyar']
  },

  // ==========================================
  // TAB 4: RUKHSAH & FIDYAH (exemptions)
  // ==========================================
  {
    id: 'rukhsah-sakit-sementara',
    order: 1,
    tab: 'exemptions',
    title: 'Sakit Sementara (Dapat Sembuh)',
    badge: 'Boleh Berbuka & Wajib Qadha',
    badgeColor: 'amber',
    summary: 'Keringanan berbuka bagi orang sakit yang jika berpuasa akan memperparah penyakit atau memperlambat kesembuhan.',
    detailExplanation: [
      'Orang sakit yang mendapat keringanan adalah yang merasakan kepayahan berat (masyaqqah) atau bila berpuasa dikhawatirkan membahayakan jiwanya atau memperparah sakitnya berdasarkan petunjuk dokter terpercaya.',
      'Kewajiban pengganti: Wajib mengqadha puasa sejumlah hari yang ditinggalkan setelah sembuh.',
      'Tidak wajib membayar fidyah jika penyakitnya tergolong penyakit sementara yang ada harapan sembuh.',
      'Bila sakit ringan (seperti flu ringan atau sakit gigi yang tidak terganggu oleh puasa), tetap wajib berpuasa.'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Baqarah: 185',
        arabic: 'وَمَنْ كَانَ مَرِيضًا أَوْ عَلَىٰ سَفَرٍ فَعِدَّةٌ مِنْ أَيَّامٍ أُخَرَ ۗ يُرِيدُ اللَّهُ بِكُمُ الْيُسْرَ وَلَا يُرِيدُ بِكُمُ الْعُسْرَ',
        latin: "Wa man kāna marīdhan au 'alā safarin fa 'iddatum min ayyāmin ukhar, yurīdullāhu bikumul-yusra wa lā yurīdu bikumul-'usr.",
        translation: 'Dan barangsiapa sakit atau dalam perjalanan (lalu ia berbuka), maka (wajiblah baginya berpuasa), sebanyak hari yang ditinggalkannya itu, pada hari-hari yang lain. Allah menghendaki kemudahan bagimu, dan tidak menghendaki kesukaran bagimu.',
        explanation: 'Prinsip kemudahan syariat bagi orang yang sedang sakit.'
      }
    ],
    rujukan: ['Tafsir Ibnu Katsir', 'Al-Fiqh Al-Islami wa Adillatuh']
  },
  {
    id: 'rukhsah-musafir',
    order: 2,
    tab: 'exemptions',
    title: 'Musafir (Dalam Perjalanan Jauh)',
    badge: 'Boleh Berbuka & Wajib Qadha',
    badgeColor: 'teal',
    summary: 'Keringanan bagi musafir yang menempuh perjalanan jarak jauh (marhalatain) yang bukan perjalanan maksiat.',
    detailExplanation: [
      'Syarat rukhsah musafir:',
      '1. Jarak perjalanan mencapai jarak qashar shalat (sekitar 81-89 km atau 2 marhalah).',
      '2. Perjalanan mubah atau ketaatan (bukan safar maksiat).',
      '3. Telah keluar dari batas wilayah domisili sebelum terbit fajar (menurut jumhur ulama).',
      'Kewajiban: Wajib mengqadha puasa di hari lain setelah safar selesai.',
      'Mana yang lebih utama? Bila tidak merasa berat, berpuasa lebih utama. Namun bila perjalanan sangat melelahkan, mengambil rukhsah untuk berbuka adalah lebih utama.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 1946) & Muslim (No. 1115)',
        arabic: 'لَيْسَ مِنَ الْبِرِّ الصِّيَامُ فِي السَّفَرِ',
        latin: "Laisa minal-birrish-shiyāmu fis-safar.",
        translation: 'Bukanlah termasuk kebaikan memaksakan diri berpuasa dalam perjalanan (yang membahayakan fisik).',
        explanation: 'Anjuran mengambil keringanan saat perjalanan sangat memberatkan.'
      },
      {
        type: 'hadith',
        source: 'HR. Muslim (No. 1116) dari Jabir RA',
        arabic: 'إِنَّ اللَّهَ يُحِبُّ أَنْ تُؤْتَى رُخَصُهُ كَمَا يَكْرَهُ أَنْ تُؤْتَى مَعْصِيَتُهُ',
        latin: "Innallāha yuhibbu an tu'tā rukhashuhū kamā yakrahu an tu'tā ma'shiyatuh.",
        translation: 'Sesungguhnya Allah menyukai apabila keringanan-keringanan-Nya (rukhsah) diambil, sebagaimana Dia membenci apabila kemaksiatan kepada-Nya dikerjakan.'
      }
    ],
    rujukan: ['Shahih Bukhari', 'Shahih Muslim', 'Raudhatuth Thalibin']
  },
  {
    id: 'rukhsah-ibu-hamil-menyusui',
    order: 3,
    tab: 'exemptions',
    title: 'Wanita Hamil dan Menyusui',
    badge: 'Keringanan Khusus (Qadha & Fidyah)',
    badgeColor: 'purple',
    summary: 'Keringanan bagi ibu hamil atau menyusui bila berpuasa dikhawatirkan mengganggu kesehatan ibu atau bayinya.',
    detailExplanation: [
      'Ketentuan menurut Mazhab Syafi\'i:',
      '1. Jika khawatir terhadap keselamatan DIRINYA SENDIRI (atau diri dan bayinya sekaligus): Boleh berbuka dan HANYA wajib Qadha puasa tanpa fidyah.',
      '2. Jika khawatir HANYA terhadap keselamatan BAYINYA (misalnya khawatir keguguran atau air susu berkurang drastis): Boleh berbuka, wajib Qadha puasa DAN wajib membayar Fidyah 1 mud per hari.',
      'Kekhawatiran harus berlandaskan pengalaman nyata atau rekomendasi medis dokter ahli.'
    ],
    dalilList: [
      {
        type: 'hadith',
        source: 'HR. Abu Dawud (No. 2408), At-Tirmidzi (No. 715), An-Nasa\'i (No. 2274)',
        arabic: 'إِنَّ اللَّهَ تَعَالَى وَضَعَ عَنِ الْمُسَافِرِ الصَّوْمَ وَشَطْرَ الصَّلاَةِ، وَعَنِ الْحَامِلِ أَوِ الْمُرْضِعِ الصَّوْمَ',
        latin: "Innallāha ta'ālā wadha'a 'anil-musāfirish-shauma wa syatrash-shalāh, wa 'anil-hāmili awil-murdhi'ish-shaum.",
        translation: 'Sesungguhnya Allah Ta\'ala menggugurkan kewajiban puasa dan separuh shalat bagi musafir, serta menggugurkan kewajiban puasa bagi wanita hamil dan menyusui.',
        explanation: 'Hadits hasan yang menjadi landasan rukhsah bagi ibu hamil dan menyusui.'
      }
    ],
    rujukan: ['Matan Al-Ghayah wat Taqrib', 'Kifayatul Akhyar', 'Fatwa Tarjih']
  },
  {
    id: 'rukhsah-lansia',
    order: 4,
    tab: 'exemptions',
    title: 'Lanjut Usia (Lansia / Renta)',
    badge: 'Boleh Tidak Puasa & Wajib Fidyah',
    badgeColor: 'amber',
    summary: 'Keringanan bagi orang tua yang sudah sangat renta dan tidak mampu lagi secara fisik untuk berpuasa.',
    detailExplanation: [
      'Orang lanjut usia yang fisiknya sangat lemah sehingga tidak mampu menjalankan puasa tidak diwajibkan berpuasa.',
      'Kewajiban pengganti: TIDAK wajib qadha, melainkan WAJIB membayar Fidyah sebesar 1 mud bahan makanan pokok (sekitar 675 gram - 0.75 kg beras) untuk setiap hari puasa yang ditinggalkan.',
      'Fidyah disalurkan kepada fakir miskin.',
      'Bila lansia tersebut dalam kondisi pikun (hilang ingatan), maka gugur kewajiban puasa dan gugur pula kewajiban fidyah atasnya karena telah hilang taklif (beban syariat).'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Baqarah: 184',
        arabic: 'وَعَلَى الَّذِينَ يُطِيقُونَهُ فِدْيَةٌ طَعَامُ مِسْكِينٍ',
        latin: "Wa 'alalladzīna yuthīqūnahū fidyatun tha'āmu miskīn.",
        translation: 'Dan wajib bagi orang-orang yang berat menjalankannya (jika mereka tidak berpuasa) membayar fidyah, (yaitu): memberi makan seorang miskin.',
        explanation: 'Ibnu Abbas RA menafsirkan ayat ini turun bagi orang tua renta yang tidak mampu berpuasa.'
      },
      {
        type: 'hadith',
        source: 'HR. Bukhari (No. 4505) dari Ibnu Abbas RA',
        arabic: 'هُوَ الشَّيْخُ الْكَبِيرُ وَالْمَرْأَةُ الْكَبِيرَةُ لاَ يَسْتَطِيعَانِ أَنْ يَصُومَا، فَيُطْعِمَانِ مَكَانَ كُلِّ يَوْمٍ مِسْكِينًا',
        latin: "Huwas-syaikhul-kabīru wal-mar'atul-kabīratu lā yastathī'āni ay-yashūmā, fayuth'imāni makāna kulli yaumim-miskīnā.",
        translation: 'Ayat itu ditujukan untuk kakek tua dan nenek tua yang tidak mampu lagi berpuasa, maka keduanya memberi makan seorang miskin untuk setiap hari (yang ditinggalkan).'
      }
    ],
    rujukan: ['Shahih Al-Bukhari', 'Tafsir Ath-Thabari']
  },
  {
    id: 'rukhsah-sakit-menahun',
    order: 5,
    tab: 'exemptions',
    title: 'Sakit Menahun (Tidak Ada Harapan Sembuh)',
    badge: 'Boleh Tidak Puasa & Wajib Fidyah',
    badgeColor: 'amber',
    summary: 'Keringanan bagi penderita sakit kronis berkepanjangan yang menurut vonis medis tidak memungkinkan berpuasa.',
    detailExplanation: [
      'Penderita penyakit kronis permanen (seperti gagal ginjal cuci darah rutin, diabetes akut dengan injeksi rutin, kanker stadium lanjut) yang tidak ada harapan sembuh diperbolehkan tidak berpuasa.',
      'Hukumnya disamakan dengan orang tua renta: TIDAK wajib qadha, melainkan WAJIB membayar Fidyah.',
      'Besaran fidyah adalah 1 mud (sekitar 0.75 kg) bahan makanan pokok untuk setiap hari yang ditinggalkan kepada fakir miskin.',
      'Pembayaran fidyah boleh dilakukan setiap hari saat hari puasa tersebut terlewati, atau diakumulasikan di akhir bulan Ramadan.'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Baqarah: 184',
        arabic: 'فَمَنْ تَطَوَّعَ خَيْرًا فَهُوَ خَيْرٌ لَهُ ۚ وَأَنْ تَصُومُوا خَيْرٌ لَكُمْ ۖ إِنْ كُنْتُمْ تَعْلَمُونَ',
        latin: "Fa man tathawwa'a khairan fahuwa khairul-lah, wa an tashūmū khairul-lakum in kuntum ta'lamūn.",
        translation: 'Maka barangsiapa dengan kerelaan hati mengerjakan kebajikan, maka itulah yang lebih baik baginya. Dan berpuasa lebih baik bagimu jika kamu mengetahui.',
        explanation: 'Fidyah sebagai rahmat dan jalan keluar bagi orang sakit menahun.'
      }
    ],
    rujukan: ['Al-Majmu\' Syarah Al-Muhadzdzab', 'Fatwa Darul Ifta Al-Mishriyyah']
  },
  {
    id: 'panduan-lengkap-fidyah',
    order: 6,
    tab: 'exemptions',
    title: 'Tata Cara & Besaran Pembayaran Fidyah',
    badge: 'Panduan Fidyah Lengkap',
    badgeColor: 'emerald',
    summary: 'Rincian takaran, waktu pembayaran, bentuk makanan, dan mustahik (penerima) fidyah puasa.',
    detailExplanation: [
      'Siapa yang wajib membayar fidyah?',
      '1. Orang tua renta yang tidak mampu berpuasa.',
      '2. Orang sakit menahun tanpa harapan sembuh.',
      '3. Ibu hamil/menyusui yang khawatir hanya pada kondisi bayinya.',
      '4. Orang yang menunda qadha puasa Ramadan hingga tiba Ramadan berikutnya tanpa uzur.',
      'Ukuran dan Takaran Fidyah:',
      '• Menurut Mazhab Syafi\'i: 1 Mud beras per hari = sekitar 675 gram atau 0.75 kg beras (digenapkan 1 kg beras agar aman).',
      '• Menurut Mazhab Hanafi: 1 Sha\' (sekitar 2.5 - 3 kg beras atau senilai makanan matang mengenyangkan dua kali makan). Boleh dibayarkan dalam bentuk uang senilai porsi makanan fakir miskin.',
      'Waktu Pembayaran Fidyah:',
      '• Boleh dibayar setiap hari setelah terbit fajar atau setelah Maghrib pada hari tidak berpuasa.',
      '• Boleh dibayar sekaligus di akhir bulan Ramadan untuk total hari yang ditinggalkan.',
      '• TIDAK SAH membayar fidyah mendahului bulan Ramadan (misalnya di bulan Sya\'ban).'
    ],
    dalilList: [
      {
        type: 'quran',
        source: 'QS. Al-Baqarah: 184',
        arabic: 'وَعَلَى الَّذِينَ يُطِيقُونَهُ فِدْيَةٌ طَعَامُ مِسْكِينٍ',
        latin: "Wa 'alalladzīna yuthīqūnahū fidyatun tha'āmu miskīn.",
        translation: 'Dan wajib bagi orang-orang yang berat menjalankannya (jika mereka tidak berpuasa) membayar fidyah, (yaitu): memberi makan seorang miskin.',
        explanation: 'Landasan pensyariatan fidyah dalam Al-Qur\'an.'
      },
      {
        type: 'hadith',
        source: 'Atsar Sahabat - Riwayat Al-Baihaqi & Ad-Daraquthni',
        arabic: 'أَنَّ أَنَسَ بْنَ مَالِكٍ كَبِرَ حَتَّى كَانَ لاَ يَسْتَطِيعُ الصَّوْمَ، فَأَطْعَمَ كُلَّ يَوْمٍ مِسْكِينًا خُبْزًا وَلَحْمًا',
        latin: "Anna Anasa-bna Mālikin kabira hattā kāna lā yastathī'ush-shaum, fa ath'ama kulla yaumim-miskīnan khubzan wa lahmā.",
        translation: 'Bahwasanya sahabat Anas bin Malik RA ketika telah berusia lanjut dan tidak mampu berpuasa, beliau memberi makan seorang miskin setiap harinya dengan roti dan daging.'
      }
    ],
    rujukan: ['Kitab Al-Umm - Imam Asy-Syafi\'i', 'Fathul Mu\'in', 'Fatwa BAZNAS RI']
  }
];

export const getPuasaByTab = (tab: 'types' | 'recommended' | 'invalidators' | 'exemptions') => {
  return PUASA_DATA.filter((item) => item.tab === tab);
};

export const getPuasaById = (id: string) => {
  return PUASA_DATA.find((item) => item.id === id);
};
