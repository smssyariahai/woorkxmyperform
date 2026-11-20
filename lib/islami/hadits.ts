import fs from "fs";
import path from "path";

export type HaditsGroupType = "kutub_sittah" | "kutub_tisah" | "lainnya";

export interface KitabMetadata {
  id: string;
  nama: string;
  namaArab: string;
  grup: HaditsGroupType;
  grupLabel: string;
  pengarang: string;
  wafat: string;
  totalHadits: number;
  sumberData: string;
  isMasterSource: boolean;
  deskripsi: string;
  derajat?: string;
  aliases?: string[];
}

export interface RawHaditsRecord {
  id: string;
  nomor: number;
  kitabId: string;
  kitabNama: string;
  arab: string;
  terjemahan: string;
  bab?: string;
  perawi?: string;
  derajat?: string;
}

export function normalizeKitabId(rawId?: string | null): string {
  if (!rawId) return "";
  const s = rawId.toLowerCase().replace(/_/g, "-").trim();
  if (s === "shahih-bukhari" || s === "bukhari" || s === "shahih_bukhari") return "bukhari";
  if (s === "shahih-muslim" || s === "muslim" || s === "shahih_muslim") return "muslim";
  if (s === "sunan-abu-dawud" || s === "abu-dawud" || s === "abu_dawud" || s === "abudaud" || s === "abu-daud") return "abu-dawud";
  if (s === "jami-at-tirmidzi" || s === "tirmidzi" || s === "jami_at_tirmidzi" || s === "at-tirmidzi" || s === "tirmizi") return "tirmidzi";
  if (s === "sunan-an-nasai" || s === "nasai" || s === "sunan_an_nasai" || s === "an-nasai") return "nasai";
  if (s === "sunan-ibnu-majah" || s === "ibnu-majah" || s === "sunan_ibnu_majah" || s === "ibnumajah") return "ibnu-majah";
  if (s === "muwatta-malik" || s === "malik" || s === "muwatta_malik" || s === "muwatha-malik") return "malik";
  if (s === "musnad-ahmad" || s === "ahmad" || s === "musnad_ahmad") return "ahmad";
  if (s === "sunan-ad-darimi" || s === "darimi" || s === "sunan_ad_darimi" || s === "ad-darimi") return "darimi";
  if (s === "riyadhus-shalihin" || s === "riyadhus_shalihin" || s === "riyadhusshalihin") return "riyadhus-shalihin";
  if (s === "musnad-syafii" || s === "syafii" || s === "musnad_syafii" || s === "imam-syafii") return "syafii";
  if (s === "shahih-ibnu-hibban" || s === "ibnu-hibban" || s === "shahih_ibnu_hibban") return "ibnu-hibban";
  if (s === "shahih-ibnu-khuzaimah" || s === "ibnu-khuzaimah" || s === "shahih_ibnu_khuzaimah") return "ibnu-khuzaimah";
  if (s === "al-mustadrak" || s === "al_mustadrak" || s === "mustadrak") return "al-mustadrak";
  if (s === "sunan-daruquthni" || s === "daruquthni" || s === "sunan_daruquthni") return "daruquthni";
  return s;
}

export const DAFTAR_KITAB_METADATA: KitabMetadata[] = [
  // 1. Kutub al-Sittah (6 Kitab Utama)
  {
    id: "bukhari",
    nama: "Sahih al-Bukhari",
    namaArab: "صحيح البخاري",
    grup: "kutub_sittah",
    grupLabel: "Kutub al-Sittah",
    pengarang: "Imam Abu Abdillah Muhammad bin Ismail al-Bukhari",
    wafat: "256 H / 870 M",
    totalHadits: 7008,
    sumberData: "irsyadulibad/hadits-database",
    isMasterSource: true,
    deskripsi: "Kitab hadits paling shahih dan paling utama dalam Islam setelah Al-Qur'an, disusun dengan metodologi seleksi sanad super ketat.",
    derajat: "Shahih Mutlaq",
    aliases: ["shahih_bukhari", "shahih-bukhari", "bukhari"]
  },
  {
    id: "muslim",
    nama: "Sahih Muslim",
    namaArab: "صحيح مسلم",
    grup: "kutub_sittah",
    grupLabel: "Kutub al-Sittah",
    pengarang: "Imam Abul Husain Muslim bin al-Hajjaj an-Naisaburi",
    wafat: "261 H / 875 M",
    totalHadits: 5362,
    sumberData: "irsyadulibad/hadits-database",
    isMasterSource: true,
    deskripsi: "Kitab shahih kedua dengan keunggulan sistematika penyusunan jalur sanad dan matan yang sangat rapi.",
    derajat: "Shahih Mutlaq",
    aliases: ["shahih_muslim", "shahih-muslim", "muslim"]
  },
  {
    id: "abu-dawud",
    nama: "Sunan Abu Dawud",
    namaArab: "سنن أبي داود",
    grup: "kutub_sittah",
    grupLabel: "Kutub al-Sittah",
    pengarang: "Imam Abu Dawud Sulaiman bin al-Asy'ats as-Sijistani",
    wafat: "275 H / 889 M",
    totalHadits: 4590,
    sumberData: "irsyadulibad/hadits-database",
    isMasterSource: true,
    deskripsi: "Kitab rujukan hadits fiqih dan hukum syariah terlengkap, memuat dalil hukum yang menjadi pegangan para fuqaha mazhab.",
    derajat: "Shahih & Hasan Fiqih",
    aliases: ["sunan_abu_dawud", "sunan-abu-dawud", "abu-dawud", "abudaud"]
  },
  {
    id: "tirmidzi",
    nama: "Jami' at-Tirmidzi",
    namaArab: "جامع الترمذي",
    grup: "kutub_sittah",
    grupLabel: "Kutub al-Sittah",
    pengarang: "Imam Abu Isa Muhammad bin Isa at-Tirmidzi",
    wafat: "279 H / 892 M",
    totalHadits: 3891,
    sumberData: "irsyadulibad/hadits-database",
    isMasterSource: true,
    deskripsi: "Pelopor penilaian derajat hadits dan penjelasan pandangan fiqih para ulama sahabat & tabiin.",
    derajat: "Shahih, Hasan & Sunan",
    aliases: ["jami_at_tirmidzi", "jami-at-tirmidzi", "tirmidzi", "at-tirmidzi"]
  },
  {
    id: "nasai",
    nama: "Sunan an-Nasa'i",
    namaArab: "سنن النسائي",
    grup: "kutub_sittah",
    grupLabel: "Kutub al-Sittah",
    pengarang: "Imam Abu Abdirrahman Ahmad bin Syu'aib an-Nasa'i",
    wafat: "303 H / 915 M",
    totalHadits: 5662,
    sumberData: "irsyadulibad/hadits-database",
    isMasterSource: true,
    deskripsi: "Kitab sunan dengan standar kritik perawi dan kehati-hatian sanad yang paling ketat setelah Shahihain.",
    derajat: "Shahih & Hasan Mutabar",
    aliases: ["sunan_an_nasai", "sunan-an-nasai", "nasai", "an-nasai"]
  },
  {
    id: "ibnu-majah",
    nama: "Sunan Ibnu Majah",
    namaArab: "سنن ابن ماجه",
    grup: "kutub_sittah",
    grupLabel: "Kutub al-Sittah",
    pengarang: "Imam Abu Abdillah Muhammad bin Yazid Ibnu Majah",
    wafat: "273 H / 887 M",
    totalHadits: 4332,
    sumberData: "irsyadulibad/hadits-database",
    isMasterSource: true,
    deskripsi: "Kitab penutup Kutub al-Sittah dengan sistematika bab fiqih yang sangat rapi dan banyak memuat hadits tambahan unik.",
    derajat: "Sunan Mutabar",
    aliases: ["sunan_ibnu_majah", "sunan-ibnu-majah", "ibnu-majah", "ibnumajah"]
  },

  // 2. Kutub al-Tis'ah
  {
    id: "malik",
    nama: "Muwatta Malik",
    namaArab: "موطأ مالك",
    grup: "kutub_tisah",
    grupLabel: "Kutub al-Tis'ah",
    pengarang: "Imam Malik bin Anas al-Ashbahi (Imam Darul Hijrah)",
    wafat: "179 H / 795 M",
    totalHadits: 1594,
    sumberData: "irsyadulibad/hadits-database",
    isMasterSource: true,
    deskripsi: "Karya kodifikasi hadits dan fiqih tertua yang menjadi rujukan amalan penduduk Madinah.",
    derajat: "Shahih & Atsar Sahabat",
    aliases: ["muwatta_malik", "muwatta-malik", "malik"]
  },
  {
    id: "darimi",
    nama: "Sunan ad-Darimi",
    namaArab: "سنن الدارمي",
    grup: "kutub_tisah",
    grupLabel: "Kutub al-Tis'ah",
    pengarang: "Imam Abu Muhammad Abdullah bin Abdirrahman ad-Darimi",
    wafat: "255 H / 869 M",
    totalHadits: 3367,
    sumberData: "irsyadulibad/hadits-database",
    isMasterSource: true,
    deskripsi: "Kitab sunan bermutu tinggi dengan sanad-sanad pilihan dan bab muqaddimah sunnah yang sangat masyhur.",
    derajat: "Shahih & Hasan Sunan",
    aliases: ["sunan_ad_darimi", "sunan-ad-darimi", "darimi", "ad-darimi"]
  },

  // 3. Kitab Rujukan Lainnya
  {
    id: "riyadhus-shalihin",
    nama: "Riyadhus Shalihin",
    namaArab: "رياض الصالحين",
    grup: "lainnya",
    grupLabel: "Koleksi Kitab Hadits Lainnya",
    pengarang: "Imam Abu Zakariya Yahya bin Syaraf an-Nawawi",
    wafat: "676 H / 1277 M",
    totalHadits: 372,
    sumberData: "irsyadulibad/hadits-database",
    isMasterSource: true,
    deskripsi: "Kompilasi hadits tazkiyatun nafs, adab harian, dan petunjuk amal shalih yang paling populer dibaca umat Islam seluruh dunia.",
    derajat: "Shahih & Hasan Pilihan",
    aliases: ["riyadhus_shalihin", "riyadhus-shalihin", "riyadhusshalihin"]
  },
  {
    id: "syafii",
    nama: "Musnad asy-Syafi'i",
    namaArab: "مسند الإمام الشافعي",
    grup: "lainnya",
    grupLabel: "Koleksi Kitab Hadits Lainnya",
    pengarang: "Imam Muhammad bin Idris asy-Syafi'i",
    wafat: "204 H / 820 M",
    totalHadits: 1800,
    sumberData: "irsyadulibad/hadits-database",
    isMasterSource: true,
    deskripsi: "Himpunan hadits-hadits riwayat Imam Syafi'i yang menjadi fondasi ushul fiqih dan fiqih Mazhab Syafi'i.",
    derajat: "Musnad Mazhab Fiqih",
    aliases: ["musnad_syafii", "musnad-syafii", "syafii"]
  },
  {
    id: "ibnu-hibban",
    nama: "Shahih Ibnu Hibban",
    namaArab: "صحيح ابن حبان",
    grup: "lainnya",
    grupLabel: "Koleksi Kitab Hadits Lainnya",
    pengarang: "Imam Abu Hatim Muhammad bin Hibban al-Busti",
    wafat: "354 H / 965 M",
    totalHadits: 2770,
    sumberData: "edi-mj/hadits-dataset (Unique Import)",
    isMasterSource: false,
    deskripsi: "Kitab shahih independen dengan klasifikasi tematik mendalam dan kualitas sanad tinggi.",
    derajat: "Shahih Masyhur",
    aliases: ["shahih_ibnu_hibban", "shahih-ibnu-hibban", "ibnu-hibban"]
  },
  {
    id: "ibnu-khuzaimah",
    nama: "Shahih Ibnu Khuzaimah",
    namaArab: "صحيح ابن خزيمة",
    grup: "lainnya",
    grupLabel: "Koleksi Kitab Hadits Lainnya",
    pengarang: "Imam Abu Bakar Muhammad bin Ishaq Ibnu Khuzaimah",
    wafat: "311 H / 924 M",
    totalHadits: 1794,
    sumberData: "edi-mj/hadits-dataset (Unique Import)",
    isMasterSource: false,
    deskripsi: "Kitab shahih rujukan utama yang menjadi guru dan rujukan dari Imam Ibnu Hibban.",
    derajat: "Shahih Masyhur",
    aliases: ["shahih_ibnu_khuzaimah", "shahih-ibnu-khuzaimah", "ibnu-khuzaimah"]
  },
  {
    id: "al-mustadrak",
    nama: "Al-Mustadrak",
    namaArab: "المستدرك على الصحيحين",
    grup: "lainnya",
    grupLabel: "Koleksi Kitab Hadits Lainnya",
    pengarang: "Imam Abu Abdillah Muhammad bin Abdullah al-Hakim an-Naisaburi",
    wafat: "405 H / 1014 M",
    totalHadits: 672,
    sumberData: "edi-mj/hadits-dataset (Unique Import)",
    isMasterSource: false,
    deskripsi: "Kitab himpunan hadits shahih yang memenuhi kriteria Bukhari & Muslim namun tidak tercantum dalam kitab mereka.",
    derajat: "Mustadrak Shahihain",
    aliases: ["al_mustadrak", "al-mustadrak", "mustadrak"]
  },
  {
    id: "daruquthni",
    nama: "Sunan Daruquthni",
    namaArab: "سنن الدارقطني",
    grup: "lainnya",
    grupLabel: "Koleksi Kitab Hadits Lainnya",
    pengarang: "Imam Abul Hasan Ali bin Umar ad-Daruquthni",
    wafat: "385 H / 995 M",
    totalHadits: 4728,
    sumberData: "edi-mj/hadits-dataset (Unique Import)",
    isMasterSource: false,
    deskripsi: "Kitab rujukan hadits fiqih dengan pembahasan mendalam mengenai 'ilal (cacat tersembunyi sanad hadits).",
    derajat: "Sunan & Ilal Hadits",
    aliases: ["sunan_daruquthni", "sunan-daruquthni", "daruquthni"]
  }
];

// In-memory cache for fast access
const memoryCache = new Map<string, RawHaditsRecord[]>();

const HADITS_DIR = path.join(process.cwd(), "public/data/hadits");

function loadBookData(rawKitabId: string): RawHaditsRecord[] {
  const normalizedId = normalizeKitabId(rawKitabId);
  if (!normalizedId) return [];

  if (memoryCache.has(normalizedId)) {
    return memoryCache.get(normalizedId)!;
  }

  const filePath = path.join(HADITS_DIR, `${normalizedId}.json`);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as RawHaditsRecord[];
    memoryCache.set(normalizedId, parsed);
    return parsed;
  } catch (err) {
    console.error(`Failed to load hadits data for ${normalizedId}:`, err);
    return [];
  }
}

export function getHaditsBooks() {
  return DAFTAR_KITAB_METADATA;
}

export function getHaditsStats() {
  const totalKeseluruhan = DAFTAR_KITAB_METADATA.reduce((acc, k) => acc + k.totalHadits, 0);

  const groups = [
    {
      grup: "kutub_sittah" as HaditsGroupType,
      label: "Kutub al-Sittah (6 Kitab Utama)",
      totalKitab: DAFTAR_KITAB_METADATA.filter(k => k.grup === "kutub_sittah").length,
      totalHadits: DAFTAR_KITAB_METADATA.filter(k => k.grup === "kutub_sittah").reduce((acc, k) => acc + k.totalHadits, 0),
      kitabList: DAFTAR_KITAB_METADATA.filter(k => k.grup === "kutub_sittah").map(k => k.nama)
    },
    {
      grup: "kutub_tisah" as HaditsGroupType,
      label: "Kutub al-Tis'ah (9 Kitab Rujukan Akbar)",
      totalKitab: DAFTAR_KITAB_METADATA.filter(k => k.grup === "kutub_tisah").length,
      totalHadits: DAFTAR_KITAB_METADATA.filter(k => k.grup === "kutub_tisah").reduce((acc, k) => acc + k.totalHadits, 0),
      kitabList: DAFTAR_KITAB_METADATA.filter(k => k.grup === "kutub_tisah").map(k => k.nama)
    },
    {
      grup: "lainnya" as HaditsGroupType,
      label: "Koleksi Kitab Hadits Lainnya",
      totalKitab: DAFTAR_KITAB_METADATA.filter(k => k.grup === "lainnya").length,
      totalHadits: DAFTAR_KITAB_METADATA.filter(k => k.grup === "lainnya").reduce((acc, k) => acc + k.totalHadits, 0),
      kitabList: DAFTAR_KITAB_METADATA.filter(k => k.grup === "lainnya").map(k => k.nama)
    }
  ];

  return {
    totalKitabKeseluruhan: DAFTAR_KITAB_METADATA.length,
    totalHaditsKeseluruhan: totalKeseluruhan,
    grupBreakdown: groups,
    kitabStats: DAFTAR_KITAB_METADATA.map(k => ({
      id: k.id,
      nama: k.nama,
      namaArab: k.namaArab,
      grup: k.grup,
      grupLabel: k.grupLabel,
      pengarang: k.pengarang,
      totalHadits: k.totalHadits,
      sumberData: k.sumberData,
      isMasterSource: k.isMasterSource,
      derajat: k.derajat
    })),
    masterSource: {
      repository: "https://github.com/irsyadulibad/hadits-database",
      totalKitab: DAFTAR_KITAB_METADATA.filter(k => k.isMasterSource).length
    },
    secondarySource: {
      repository: "https://github.com/edi-mj/hadits-dataset",
      uniqueImportKitab: [
        "Shahih Ibnu Hibban",
        "Shahih Ibnu Khuzaimah",
        "Al-Mustadrak",
        "Sunan Daruquthni"
      ],
      deduplicationNotice: "Semua kitab yang sudah tersedia di master source tidak diduplikasi dari secondary source."
    }
  };
}

export function queryHaditsList(params: {
  kitabId?: string;
  grup?: string;
  search?: string;
  nomor?: number;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const search = (params.search || "").trim().toLowerCase();
  const nomor = params.nomor ? Number(params.nomor) : undefined;
  const rawGrup = params.grup && params.grup !== "all" ? params.grup : undefined;
  const rawKitabId = params.kitabId && params.kitabId !== "all" ? params.kitabId : undefined;
  const normalizedKitabId = rawKitabId ? normalizeKitabId(rawKitabId) : undefined;

  let targetBooks = DAFTAR_KITAB_METADATA;

  if (rawGrup) {
    targetBooks = targetBooks.filter(k => k.grup === rawGrup);
  }

  if (normalizedKitabId) {
    targetBooks = targetBooks.filter(k => k.id === normalizedKitabId || (k.aliases && k.aliases.includes(normalizedKitabId)));
  }

  let allMatches: (RawHaditsRecord & { grup: HaditsGroupType; grupLabel: string; derajat?: string })[] = [];

  for (const book of targetBooks) {
    const list = loadBookData(book.id);
    let bookFiltered = list;

    if (nomor !== undefined && !isNaN(nomor)) {
      bookFiltered = bookFiltered.filter(h => h.nomor === nomor);
    }

    if (search) {
      bookFiltered = bookFiltered.filter(h =>
        (h.terjemahan && h.terjemahan.toLowerCase().includes(search)) ||
        (h.arab && h.arab.includes(search)) ||
        (h.kitabNama && h.kitabNama.toLowerCase().includes(search)) ||
        (h.bab && h.bab.toLowerCase().includes(search))
      );
    }

    const decorated = bookFiltered.map(h => ({
      ...h,
      kitabNama: h.kitabNama || book.nama,
      grup: book.grup,
      grupLabel: book.grupLabel,
      derajat: book.derajat
    }));

    allMatches = allMatches.concat(decorated);

    // If searching across all books with no specific filter, chunk query for performance
    if (!normalizedKitabId && !search && nomor === undefined && allMatches.length >= page * limit + 200) {
      break;
    }
  }

  const total = allMatches.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const items = allMatches.slice(startIndex, endIndex);

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    },
    activeFilter: {
      kitabId: rawKitabId || "all",
      grup: rawGrup || "all",
      search: search || "",
      nomor: nomor || null
    }
  };
}

export function getSingleHadits(rawKitabId: string, nomor: number) {
  const normalizedId = normalizeKitabId(rawKitabId);
  const book = DAFTAR_KITAB_METADATA.find(k => k.id === normalizedId || (k.aliases && k.aliases.includes(normalizedId)));
  if (!book) return null;

  const list = loadBookData(book.id);
  const item = list.find(h => h.nomor === nomor);
  if (!item) return null;

  return {
    ...item,
    kitabNama: item.kitabNama || book.nama,
    grup: book.grup,
    grupLabel: book.grupLabel,
    derajat: book.derajat,
    pengarang: book.pengarang,
    wafat: book.wafat,
    sumberData: book.sumberData
  };
}
