/**
 * Helper bulan Bahasa Indonesia — dipakai intent (parse perintah),
 * tool rekap_keuangan, dan generator file laporan.
 * Murni (tanpa I/O): bulan/tahun hanya dari teks perintah atau default
 * bulan berjalan. Tidak ada data karangan di sini.
 */

export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const;

const MONTH_LOOKUP: Record<string, number> = {
  januari: 1, jan: 1,
  februari: 2, feb: 2,
  maret: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  agustus: 8, agu: 8, ags: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11,
  desember: 12, des: 12,
};

/** "September 2026" dari (year, month 1-12). */
export function formatBulanTahun(year: number, month: number): string {
  const m = month >= 1 && month <= 12 ? month : new Date().getMonth() + 1;
  return `${MONTH_NAMES_ID[m - 1]} ${year}`;
}

/**
 * Parse bulan dari teks perintah Indonesia.
 * Menerima: "september", "bulan 9", "september 2026", "2026-09",
 * "09/2026", "bulan september 2026". Default: bulan berjalan.
 * Tahun di luar 2000–2100 diabaikan (pakai tahun berjalan).
 */
export function parseMonthFromText(text: string): { year: number; month: number } {
  const now = new Date();
  const fallback = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const t = text.toLowerCase();

  // Tahun eksplisit 4 digit (2000–2100) di mana pun dalam teks.
  const yearMatch = t.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : fallback.year;

  // "2026-09" atau "2026/09" (tahun-bulan).
  const iso = t.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };

  // "09/2026" atau "9-2026" (bulan-tahun).
  const dmy = t.match(/\b(0?[1-9]|1[0-2])[-/](20\d{2})\b/);
  if (dmy) return { year: Number(dmy[2]), month: Number(dmy[1]) };

  // Nama bulan ("september", "sept", "bulan september").
  const nameMatch = t.match(
    /\b(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|ags|sep|sept|okt|nov|des)\b/
  );
  if (nameMatch) return { year, month: MONTH_LOOKUP[nameMatch[1]] };

  // "bulan 9" / "bulan ke 9" / "bln 9".
  const num = t.match(/\b(?:bulan|bln)(?:\s+ke)?\s+(0?[1-9]|1[0-2])\b/);
  if (num) return { year, month: Number(num[1]) };

  return fallback;
}

/** Batas [start, end) satu bulan kalender (waktu lokal server). */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start, end };
}
