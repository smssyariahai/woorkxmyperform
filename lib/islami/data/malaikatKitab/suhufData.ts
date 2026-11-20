import { KitabSuhufItem } from './types';

export const SUHUF_DATA: KitabSuhufItem[] = [
  {
    id: 'suhuf-ibrahim',
    order: 1,
    category: 'suhuf',
    name: 'Suhuf Nabi Ibrahim AS',
    arabicName: 'صُحُفُ إِبْرَاهِيمَ',
    recipient: 'Nabi Ibrahim AS (Khalilullah)',
    language: 'Bahasa Suryani / Babilonia Kuno',
    era: 'Sekitar Abad ke-19 SM di Mesopotamia & Kanaan',
    briefSummary: 'Lembaran-lembaran wahyu (Suhuf) yang memuat perumpamaan mendalam, nasihat kebijaksanaan hidup, ketakwaan, peringatan kehidupan akhirat, serta kritik terhadap orang-orang yang terlalu mencintai dunia fana.',
    coreContents: [
      'Pelajaran bahwa kekuasaan dunia hanyalah titipan sementara yang harus dijalankan dengan keadilan dan perlindungan bagi orang tertindas.',
      'Kewajiban bagi orang berakal untuk membagi waktunya: waktu bermunajat kepada Allah, waktu menghisab diri, waktu bertadabbur atas ciptaan Allah, dan waktu mencari rezeki halal.',
      'Peringatan keras agar tidak terpedaya oleh tipu daya gemerlap dunia dan melupakan kenikmatan abadi di akhirat.',
      'Prinsip keadilan akhirat: Seseorang tidak akan memikul dosa orang lain, dan manusia hanya memperoleh apa yang diusahakannya.'
    ],
    fullExplanation: `Suhuf Nabi Ibrahim 'Alaihissalam adalah wahyu samawi yang diturunkan dalam bentuk lembaran-lembaran (shahifah/suhuf) kepada Nabi Ibrahim AS. Keberadaan Suhuf Ibrahim diabadikan secara mulia di dalam Al-Qur'an pada Surah Al-A'la (ayat 18-19) dan Surah An-Najm (ayat 36-37).

Dalam sebuah hadits shahih yang diriwayatkan oleh Imam Ibnu Hibban dari Abu Dzar Al-Ghifari RA, Abu Dzar bertanya kepada Rasulullah SAW: *"Wahai Rasulullah, apakah isi Suhuf Nabi Ibrahim itu?"* Rasulullah SAW menjawab:
*"Seluruh isinya adalah tamsil dan perumpamaan (hikmah kebijaksanaan): 'Wahai raja yang berkuasa, terpedaya dan sombong! Sesungguhnya Aku tidak mengutusmu untuk mengumpulkan harta dunia, melainkan Aku mengutusmu untuk mengabulkan doa orang yang terzalimi, karena Aku tidak akan menolak doa orang yang dizalimi walau ia orang kafir... Dan sepantasnya bagi orang yang berakal membagi waktunya menjadi empat bagian: waktu bermunajat kepada Tuhannya, waktu menghitung amalan dirinya, waktu memikirkan ciptaan Allah, dan waktu memenuhi kebutuhan makan dan minumnya yang halal.'"*`,
    quranVerses: [
      {
        surah: 'Al-A\'la',
        ayah: '18-19',
        arabic: 'إِنَّ هَـٰذَا لَفِى ٱلصُّحُفِ ٱلْأُولَىٰ ۝ صُحُفِ إِبْرَٰهِيمَ وَمُوسَىٰ',
        translation: 'Sesungguhnya ini benar-benar terdapat dalam kitab-kitab yang terdahulu, (yaitu) kitab-kitab (suhuf) Ibrahim dan Musa.'
      },
      {
        surah: 'An-Najm',
        ayah: '36-41',
        arabic: 'أَمْ لَمْ يُنَبَّأْ بِمَا فِى صُحُفِ مُوسَىٰ ۝ وَإِبْرَٰهِيمَ ٱلَّذِى وَفَّىٰٓ ۝ أَلَّا تَزِرُ وَازِرَةٌ وِزْرَ أُخْرَىٰ ۝ وَأَن لَّيْسَ لِلْإِنسَـٰنِ إِلَّا مَا سَعَىٰ',
        translation: 'Ataukah belum diberitakan kepadanya apa yang ada dalam lembaran-lembaran (suhuf) Musa? Dan (lembaran-lembaran) Ibrahim yang selalu menyempurnakan janji? (Yaitu) bahwa seseorang yang berdosa tidak akan memikul dosa orang lain, dan bahwa manusia hanya memperoleh apa yang telah diusahakannya.'
      }
    ],
    hadiths: [
      {
        narrator: 'Shahih Ibnu Hibban & Thabrani',
        reference: 'HR. Ibnu Hibban No. 361 (Hadits Abu Dzar RA)',
        translation: 'Rasulullah SAW menjelaskan jumlah suhuf yang diturunkan kepada para nabi dan isi pokok nasihat kebijaksanaan dalam Suhuf Ibrahim.'
      }
    ],
    wisdoms: [
      'Menata dan membagi manajemen waktu harian secara seimbang antara ibadah, muhasabah, belajar, dan berikhtiar rezeki.',
      'Menjaga lisan dan menahan diri dari pembicaraan yang sia-sia (laghwu).',
      'Mengutamakan persiapan bekal akhirat di atas perlombaan mengumpulkan kemewahan dunia.'
    ],
    references: [
      'Tafsir Ibnu Katsir Surah Al-A\'la: 18-19 & An-Najm: 36-41',
      'Shahih Ibnu Hibban Kitab Ar-Riqaq',
      'Al-Bidayah wan Nihayah karya Al-Hafizh Ibnu Katsir'
    ]
  },
  {
    id: 'suhuf-musa',
    order: 2,
    category: 'suhuf',
    name: 'Suhuf Nabi Musa AS',
    arabicName: 'صُحُفُ مُوسَى',
    recipient: 'Nabi Musa AS (Kalimullah)',
    language: 'Bahasa Ibrani / Qibthi Kuno',
    era: 'Sebelum Kitab Taurat diturunkan secara utuh di padang Tih',
    briefSummary: 'Lembaran-lembaran wahyu yang memuat nasihat spiritual mendalam mengenai keadilan mutlak Allah, kepastian maut, dan hisab amal perbuatan manusia.',
    coreContents: [
      'Peringatan terhadap orang yang meyakini kematian namun masih dapat tertawa lalai.',
      'Peringatan terhadap orang yang meyakini adanya neraka namun masih gemar berbuat dosa dan kemaksiatan.',
      'Peringatan terhadap orang yang meyakini takdir namun masih larut dalam keluh kesah dan penyesalan berlebihan.',
      'Kepastian bahwa balasan amal kebajikan akan diperlihatkan secara nyata pada hari kiamat.'
    ],
    fullExplanation: `Suhuf Nabi Musa 'Alaihissalam adalah lembaran-lembaran wahyu yang diwahyukan oleh Allah SWT kepada Nabi Musa AS selain dari Kitab Taurat. Para ulama tafsir menerangkan bahwa Suhuf Musa memuat mutiara ibrah (pelajaran) yang sangat menyentuh kalbu.

Dalam riwayat hadits shahih Abu Dzar Al-Ghifari RA, Rasulullah SAW menguraikan isi kandungan Suhuf Musa:
*"Seluruh isinya adalah pelajaran berharga (Ibrah): 'Aku merasa heran terhadap orang yang meyakini adanya kematian, bagaimana ia bisa bergembira ria tanpa bekal? Aku heran terhadap orang yang meyakini adanya neraka, bagaimana ia bisa tertawa terbahak-bahak? Aku heran terhadap orang yang melihat dunia dan bagaimana ia membolak-balikkan nasib para penghuninya, bagaimana ia bisa merasa tenang kepadanya? Aku heran terhadap orang yang meyakini takdir, bagaimana ia bisa bersusah hati secara berlarut-larut? Dan Aku heran terhadap orang yang meyakini adanya hisab (perhitungan amal) kelak, bagaimana ia tidak giat beramal shalih?'"*`,
    quranVerses: [
      {
        surah: 'An-Najm',
        ayah: '36',
        arabic: 'أَمْ لَمْ يُنَبَّأْ بِمَا فِى صُحُفِ مُوسَىٰ',
        translation: 'Ataukah belum diberitakan kepadanya apa yang ada dalam lembaran-lembaran (suhuf) Musa?'
      },
      {
        surah: 'Al-A\'la',
        ayah: '19',
        arabic: 'صُحُفِ إِبْرَٰهِيمَ وَمُوسَىٰ',
        translation: '(Yaitu) kitab-kitab (suhuf) Ibrahim dan Musa.'
      }
    ],
    hadiths: [
      {
        narrator: 'Shahih Ibnu Hibban & Kitab Az-Zuhd',
        reference: 'HR. Ibnu Hibban No. 361 & Imam Ahmad dalam Kitab Az-Zuhd',
        translation: 'Nabi SAW menjelaskan lima keheranan (Ibrah) yang tercantum di dalam Suhuf Nabi Musa AS mengenai perilaku manusia yang lalai dari akhirat.'
      }
    ],
    wisdoms: [
      'Menyelaraskan keyakinan hati dengan amal perbuatan nyata sehari-hari.',
      'Menghindari tertawa dan bergurau secara berlebihan yang dapat mematikan kepekaan hati nurani.',
      'Ridha terhadap qada dan qadar Allah serta senantiasa berprasangka baik (husnuzhan) kepada-Nya.'
    ],
    references: [
      'Tafsir Ibnu Katsir Surah An-Najm & Al-A\'la',
      'Kitab Az-Zuhd karya Imam Ahmad bin Hanbal',
      'Qashashul Anbiya\' karya Ibnu Katsir'
    ]
  },
  {
    id: 'suhuf-syits',
    order: 3,
    category: 'suhuf',
    name: 'Suhuf Nabi Syits AS',
    arabicName: 'صُحُفُ شِيثَ',
    recipient: 'Nabi Syits AS (Putra Nabi Adam AS)',
    language: 'Bahasa Suryani Kuno',
    era: 'Masa Generasi Awal Manusia setelah wafatnya Nabi Adam AS',
    briefSummary: 'Sebanyak 50 lembaran wahyu samawi yang memuat hukum-hukum tata kehidupan dasar manusia, larangan berbuat zalim, dan ibadah tauhid pertama pasca wafatnya Nabi Adam AS.',
    coreContents: [
      'Penetapan pokok-pokok syariat ibadah dan batasan muamalah antar keturunan Nabi Adam.',
      'Larangan keras terhadap pergaulan bebas dan pencampuran antara keturunan Qabil yang gemar maksiat dengan keturunan Syits yang shalih.',
      'Ajaran etika bertani, berternak, membangun pemukiman, dan menjaga kelestarian bumi.',
      'Kewajiban menjaga tali silaturahmi dan menolong sesama yang lemah.'
    ],
    fullExplanation: `Nabi Syits 'Alaihissalam adalah putra Nabi Adam AS yang dianugerahkan oleh Allah setelah peristiwa terbunuhnya Habil. Nama 'Syits' bermakna 'Anugerah/Hibah dari Allah' (Hibatullah). 

Berdasarkan hadits riwayat Ibnu Hibban, Nabi Syits AS adalah nabi yang menerima suhuf paling banyak di antara para nabi, yaitu sebanyak 50 lembaran (shahifah). Suhuf ini menjadi undang-undang pedoman bagi umat manusia generasi awal untuk mengatur pernikahan yang sah, ibadah shalat dan puasa, serta tata krama sosial.

Nabi Syits menyampaikan suhuf ini dengan penuh kelembutan dan wibawa, memimpin umat manusia tetap berada di atas jalan tauhid selama ratusan tahun sebelum datangnya fitnah penyembahan berhala pada zaman kaum Nabi Nuh AS.`,
    quranVerses: [
      {
        surah: 'Al-Baqarah',
        ayah: '213',
        arabic: 'كَانَ ٱلنَّاسُ أُمَّةً وَٰحِدَةً فَبَعَثَ ٱللَّهُ ٱلنَّبِيِّـۧنَ مُبَشِّرِينَ وَمُنذِرِينَ',
        translation: 'Manusia itu (dahulunya) satu umat (yang berada di atas petunjuk tauhid). Lalu Allah mengutus nabi-nabi sebagai penyampai kabar gembira dan pemberi peringatan...'
      }
    ],
    hadiths: [
      {
        narrator: 'Shahih Ibnu Hibban',
        reference: 'HR. Ibnu Hibban No. 361 dalam Shahihnya',
        translation: 'Rasulullah SAW bersabda: "Allah menurunkan 104 kitab/suhuf, Dia menurunkan kepada Syits sebanyak lima puluh suhuf..."'
      }
    ],
    wisdoms: [
      'Memahami bahwa syariat Allah telah hadir membimbing manusia sejak awal sejarah peradaban.',
      'Menjaga lingkungan pergaulan keluarga dari pengaruh gaya hidup yang merusak moral dan aqidah.',
      'Istiqamah dalam menjalankan kebaikan meskipun hidup di tengah godaan zaman.'
    ],
    references: [
      'Al-Bidayah wan Nihayah Jilid 1 karya Ibnu Katsir',
      'Tarikh Ar-Rusul wal Muluk karya Imam At-Thabari',
      'Shahih Ibnu Hibban'
    ]
  },
  {
    id: 'suhuf-idris',
    order: 4,
    category: 'suhuf',
    name: 'Suhuf Nabi Idris AS',
    arabicName: 'صُحُفُ إِدْرِيسَ',
    recipient: 'Nabi Idris AS (Akhnukh)',
    language: 'Bahasa Suryani Kuno',
    era: 'Sekitar Abad ke-35 SM di wilayah Babilonia & Mesir',
    briefSummary: 'Sebanyak 30 lembaran wahyu yang memuat ilmu hikmah ketauhidan, rahasia perbintangan/astronomi sebagai tanda kekuasaan Allah, dasar-dasar hitungan, etika menulis dengan pena, dan pemurnian jiwa.',
    coreContents: [
      'Tuntunan aqidah tauhid yang murni dan ajakan bertafakkur merenungi keagungan ciptaan langit dan bumi.',
      'Nasihat-nasihat kebijaksanaan (hikam) untuk menjaga keikhlasan hati dan menjauhi sifat dengki.',
      'Petunjuk menjahit pakaian penutup aurat dan tata krama berbusana yang sopan bagi manusia.',
      'Dasar-dasar ilmu tulis-menulis dengan qalam (pena) dan matematika untuk kemaslahatan hidup.'
    ],
    fullExplanation: `Nabi Idris 'Alaihissalam adalah kakek buyut Nabi Nuh AS. Beliau adalah manusia pertama yang diberi mukjizat kemahiran menulis dengan pena (qalam), menjahit pakaian dari kain, serta memahami ilmu falak (astronomi) dan hitungan.

Allah SWT menurunkan 30 lembaran suhuf kepada Nabi Idris AS sebagaimana disebutkan dalam hadits Abu Dzar RA. Suhuf ini berisi untaian mutiara kata hikmah yang mengajarkan manusia untuk tidak tamak terhadap kenikmatan duniawi, memperbanyak doa dan puasa, serta menjalankan tugas kepemimpinan dengan keadilan mutlak.

Karena keshalihan, ilmu, dan ketekunan ibadahnya yang luar biasa, Allah mengangkat derajat Nabi Idris ke martabat yang amat tinggi (Aliyya) sebagaimana diabadikan dalam Surah Maryam ayat 56-57.`,
    quranVerses: [
      {
        surah: 'Maryam',
        ayah: '56-57',
        arabic: 'وَٱذْكُرْ فِى ٱلْكِتَـٰبِ إِدْرِيسَ ۚ إِنَّهُۥ كَانَ صِدِّيقًا نَّبِيًّا ۝ وَرَفَعْنَـٰهُ مَكَانًا عَلِيًّا',
        translation: 'Dan ceritakanlah (Muhammad) kisah Idris di dalam Kitab (Al-Qur\'an). Sesungguhnya dia seorang yang sangat membenarkan (shiddiq) dan seorang nabi. Dan Kami telah mengangkatnya ke martabat yang tinggi.'
      }
    ],
    hadiths: [
      {
        narrator: 'Shahih Ibnu Hibban',
        reference: 'HR. Ibnu Hibban No. 361',
        translation: 'Nabi SAW menyebutkan bahwa Allah menurunkan 30 lembar suhuf kepada Nabi Idris AS.'
      }
    ],
    wisdoms: [
      'Menjadikan ilmu pengetahuan, literasi menulis, dan teknologi sebagai sarana mendekatkan diri kepada Allah.',
      'Menjaga kesucian diri dan kesopanan dalam berpakaian sebagai identitas hamba yang beriman.',
      'Rendah hati (tawadhu\') dalam menuntut ilmu dan mengamalkannya demi kemaslahatan umat.'
    ],
    references: [
      'Tafsir Ibnu Katsir Surah Maryam: 56-57',
      'Qashashul Anbiya\' Bab Kisah Nabi Idris AS karya Ibnu Katsir',
      'Tarikh Ibnul Atsir'
    ]
  },
  {
    id: 'suhuf-adam',
    order: 5,
    category: 'suhuf',
    name: 'Suhuf Nabi Adam AS',
    arabicName: 'صُحُفُ آدَمَ',
    recipient: 'Nabi Adam AS (Abul Basyar)',
    language: 'Bahasa Arab Samawi / Suryani',
    era: 'Awal mula penciptaan manusia di bumi',
    briefSummary: 'Sebanyak 10 lembaran wahyu perdana dari Allah SWT kepada bapak umat manusia (Nabi Adam AS) yang berisikan bimbingan ibadah, hukum makanan halal-haram, dan permohonan ampunan.',
    coreContents: [
      'Panduan ibadah shalat dan memuji Allah di waktu pagi dan petang.',
      'Kaidah makanan yang halal dan thoyyib serta larangan memakan bangkai, darah, dan hal yang najis.',
      'Peringatan terhadap permusuhan abadi Iblis dan bala tentaranya yang senantiasa berusaha menyesatkan anak cucu Adam.',
      'Doa-doa penyesalan (istighfar) dan taubat nasuha kepada Allah SWT.'
    ],
    fullExplanation: `Suhuf Nabi Adam 'Alaihissalam adalah lembaran wahyu samawi pertama yang diturunkan Allah kepada umat manusia setelah Nabi Adam dan Hawa diturunkan ke bumi.

Berdasarkan hadits Abu Dzar Al-Ghifari RA riwayat Ibnu Hibban, Allah menurunkan 10 lembaran suhuf kepada Nabi Adam AS. Suhuf ini memuat panduan pokok bagi Nabi Adam dan keluarganya untuk menjalani kehidupan di bumi, membedakan antara yang haq dan yang bathil, serta menjaga kesucian tauhid dari bujuk rayu Iblis.

Nabi Adam AS mengajarkan isi suhuf ini kepada putra-putri beliau agar mereka senantiasa bersyukur atas nikmat Allah dan berhati-hati terhadap tipu daya setan yang telah bersumpah akan menggoda manusia dari depan, belakang, kanan, dan kiri.`,
    quranVerses: [
      {
        surah: 'Al-Baqarah',
        ayah: '38',
        arabic: 'قُلْنَا ٱهْبِطُوا۟ مِنْهَا جَمِيعًا ۖ فَإِمَّا يَأْتِيَنَّكُم مِّنِّى هُدًى فَمَن تَبِعَ هُدَاىَ فَلَا خَوْفٌ عَلَيْهِمْ وَلَا هُمْ يَحْزَنُونَ',
        translation: 'Kami berfirman: "Turunlah kamu semua dari surga itu! Kemudian jika benar-benar datang petunjuk-Ku kepadamu, maka barang siapa mengikuti petunjuk-Ku, tidak ada rasa takut pada mereka dan mereka tidak bersedih hati."'
      },
      {
        surah: 'Al-A\'raf',
        ayah: '23',
        arabic: 'قَالَا رَبَّنَا ظَلَمْنَآ أَنفُسَنَا وَإِن لَّمْ تَغْفِرْ لَنَا وَتَرْحَمْنَا لَنَكُونَنَّ مِنَ ٱلْخَـٰسِرِينَ',
        translation: 'Keduanya berkata: "Ya Tuhan kami, kami telah menzalimi diri kami sendiri. Jika Engkau tidak mengampuni kami dan memberi rahmat kepada kami, niscaya pastilah kami termasuk orang-orang yang rugi."'
      }
    ],
    hadiths: [
      {
        narrator: 'Shahih Ibnu Hibban',
        reference: 'HR. Ibnu Hibban No. 361',
        translation: 'Rasulullah SAW menerangkan bahwa Allah menurunkan 10 lembar suhuf kepada Nabi Adam AS.'
      }
    ],
    wisdoms: [
      'Menyadari bahwa petunjuk (hidayah) Allah adalah kebutuhan pokok utama manusia melebihi kebutuhan makan dan minum.',
      'Menjadikan doa taubat Nabi Adam sebagai wirid harian saat menyadari kekhilafan diri.',
      'Meningkatkan kewaspadaan dan benteng diri dari bisikan serta perangkap Iblis laknatullah.'
    ],
    references: [
      'Tafsir Ibnu Katsir Surah Al-Baqarah: 38',
      'Qashashul Anbiya\' Bab Penciptaan Nabi Adam AS karya Ibnu Katsir',
      'Al-Bidayah wan Nihayah'
    ]
  }
];
