// Porting minimal dari backup src/services/logamMuliaApi.ts — hanya yang dipakai
// halaman Kalkulator Zakat: harga acuan emas Antam (Logam Mulia) untuk nisab.
//
// Perbedaan dari backup:
// - Backup mencoba dulu proxy server backup `/api/prices` lalu fallback ke
//   worker publik. Woork TIDAK punya `/api/prices`, jadi langsung fetch ke
//   worker publik https://logam-mulia-api.iamutaki.workers.dev (client-side).
// - Riwayat harga dari database backup (`/api/pg/gold/history`) TIDAK dibawa:
//   tidak ada endpoint/tabel itu di woork. Harga default manual tetap ada.

export interface LogamMuliaPriceItem {
  source: string;
  material: string;
  materialType: string;
  weight: number;
  weightUnit: string;
  sellPrice: number | null;
  buybackPrice: number | null;
  currency: string;
  recordedDate: string;
  displayName: string;
  logo?: string;
}

export interface LogamMuliaApiResponse {
  success: boolean;
  data: LogamMuliaPriceItem[];
  count: number;
  timestamp: string;
}

export const getTodayWibDateString = (): string => {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
};

async function safeFetchJson<T = unknown>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export const fetchGoldPricesFromApi = async (
  source: string = 'logammulia',
): Promise<LogamMuliaPriceItem[]> => {
  try {
    const directRes = await fetch(
      `https://logam-mulia-api.iamutaki.workers.dev/api/prices/${source}`,
    );
    if (directRes.ok) {
      const directJson = await safeFetchJson<LogamMuliaApiResponse>(directRes);
      if (directJson && directJson.success && Array.isArray(directJson.data)) {
        return directJson.data;
      }
    }
  } catch (err) {
    console.error(`Error fetching gold prices directly from ${source}:`, err);
  }
  return [];
};

export interface GoldSourceInfo {
  id: string;
  name: string;
  defaultDesc: string;
  sourceName: string;
}

/** Daftar sumber harga emas — porting dari backup src/services/logamMuliaApi.ts. */
export const ALL_GOLD_SOURCES: GoldSourceInfo[] = [
  { id: 'logammulia', name: 'Antam (Logam Mulia)', defaultDesc: 'Emas Batangan Sertifikat Antam Logam Mulia', sourceName: 'Logam Mulia' },
  { id: 'indogold', name: 'Indogold', defaultDesc: 'Pasar Jual Beli Emas Batangan Indogold', sourceName: 'Indogold' },
  { id: 'pegadaian', name: 'Pegadaian', defaultDesc: 'Tabungan & Cicilan Emas Batangan Pegadaian', sourceName: 'Pegadaian' },
  { id: 'galeri24', name: 'Galeri 24', defaultDesc: 'Emas Batangan & Perhiasan PT Galeri 24 (Anak Pegadaian)', sourceName: 'Galeri 24' },
  { id: 'treasury', name: 'Treasury', defaultDesc: 'Aplikasi Investasi Emas Digital Treasury', sourceName: 'Treasury' },
  { id: 'lakuemas', name: 'Laku Emas', defaultDesc: 'Platform Jual Beli Emas Digital Laku Emas', sourceName: 'Laku Emas' },
  { id: 'anekalogam', name: 'Aneka Logam', defaultDesc: 'Perdagangan Logam Mulia & Emas Batangan', sourceName: 'Aneka Logam' },
  { id: 'hartadinataabadi', name: 'Hartadinata Abadi', defaultDesc: 'Produsen Emas EMASKU Hartadinata Abadi', sourceName: 'Hartadinata Abadi' },
  { id: 'sampoernagold', name: 'Sampoerna Gold', defaultDesc: 'Emas Batangan Produk Sampoerna Gold', sourceName: 'Sampoerna Gold' },
  { id: 'bankbsi', name: 'Bank BSI', defaultDesc: 'Layanan Cicil & Tabungan Emas Bank Syariah Indonesia', sourceName: 'Bank BSI' },
  { id: 'brankaslm', name: 'Brankas LM', defaultDesc: 'Layanan Pembelian & Deposito Emas Brankas Logam Mulia', sourceName: 'Brankas LM' },
  { id: 'sakumas', name: 'Sakumas', defaultDesc: 'Layanan Tabungan & Investasi Emas Sakumas', sourceName: 'Sakumas' },
  { id: 'emasku', name: 'EmasKu', defaultDesc: 'Platform Produk Emas Batangan EmasKu', sourceName: 'EmasKu' },
  { id: 'cermati', name: 'Cermati', defaultDesc: 'Informasi & Perbandingan Harga Emas Cermati', sourceName: 'Cermati' },
  { id: 'hargaemas-org', name: 'Harga Emas.org', defaultDesc: 'Referensi Harga Emas Pasar Indonesia (HargaEmas.org)', sourceName: 'HargaEmas.org' },
  { id: 'hargaemas-net', name: 'Harga Emas.net', defaultDesc: 'Portal Informasi Harga Emas Nasional (HargaEmas.net)', sourceName: 'HargaEmas.net' },
  { id: 'hargaemas-com', name: 'Harga Emas.com', defaultDesc: 'Informasi Update Harga Emas Harian (HargaEmas.com)', sourceName: 'HargaEmas.com' },
  { id: 'kursdolar', name: 'Kurs Dolar Emas', defaultDesc: 'Informasi Harga Emas & Nilai Tukar Kurs Dolar', sourceName: 'Kurs Dolar' },
];

/** Ambil harga live semua sumber sekaligus (dipakai Tabel Harga Emas + sync manual). */
export const fetchAllLiveMarketPrices = async (): Promise<Record<string, LogamMuliaPriceItem[]>> => {
  const sources = ALL_GOLD_SOURCES.map((s) => s.id);
  const results = await Promise.allSettled(sources.map((s) => fetchGoldPricesFromApi(s)));
  const combined: Record<string, LogamMuliaPriceItem[]> = {};
  sources.forEach((source, index) => {
    const res = results[index];
    combined[source] = res.status === 'fulfilled' ? res.value : [];
  });
  return combined;
};

// Helper to extract 1 gram Sell & Buyback prices normalized for any source
export const parsePrimaryPriceFromItems = (
  items: LogamMuliaPriceItem[],
  sourceId: string,
) => {
  if (!items || items.length === 0)
    return { sellPrice: null, buybackPrice: null, materialType: '' };

  // 1. Try finding exact 1 gram item
  let item1g = items.find((i) => i.weight === 1);

  // Special cases for pegadaian (often listed at 0.01g)
  if (!item1g && sourceId === 'pegadaian') {
    const peg001 = items.find((i) => i.weight === 0.01) || items[0];
    if (peg001) {
      return {
        sellPrice: peg001.sellPrice ? Math.round(peg001.sellPrice * 100) : null,
        buybackPrice: peg001.buybackPrice ? Math.round(peg001.buybackPrice * 100) : null,
        materialType: peg001.materialType || 'Tabungan Emas Pegadaian',
      };
    }
  }

  // If 1g not found, look for 0.5g item and multiply by 2 or pick first valid item
  if (!item1g) {
    const item05 = items.find((i) => i.weight === 0.5);
    if (item05) {
      return {
        sellPrice: item05.sellPrice ? Math.round(item05.sellPrice * 2) : null,
        buybackPrice: item05.buybackPrice ? Math.round(item05.buybackPrice * 2) : null,
        materialType: item05.materialType || '',
      };
    }
    item1g = items[0];
  }

  // Calculate prices based on weight if not 1g
  const weight = item1g?.weight || 1;
  const multiplier = weight > 0 ? 1 / weight : 1;

  const rawSell = item1g?.sellPrice;
  const rawBuyback = item1g?.buybackPrice;

  // Search for buyback if null on item1g
  let buybackPrice = rawBuyback ? Math.round(rawBuyback * multiplier) : null;
  if (!buybackPrice) {
    const withBuyback = items.find((i) => i.buybackPrice && i.buybackPrice > 0);
    if (withBuyback && withBuyback.buybackPrice) {
      const w = withBuyback.weight || 1;
      buybackPrice = Math.round(withBuyback.buybackPrice * (1 / w));
    }
  }

  return {
    sellPrice: rawSell ? Math.round(rawSell * multiplier) : null,
    buybackPrice: buybackPrice,
    materialType: item1g?.materialType || items[0]?.materialType || '',
  };
};
