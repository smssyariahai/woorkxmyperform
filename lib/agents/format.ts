/**
 * Format file laporan agent — lib/agents/format.ts
 *
 * Aturan (sesuai permintaan user 2026-11-20): PDF adalah format default.
 * Format hanya berubah bila perintah menyebut format lain secara eksplisit:
 *   "excel" / "xlsx" / "spreadsheet" -> xlsx
 *   "word" / "docx" / "dokumen word" -> docx
 *   "pdf" -> pdf
 *   "markdown" / ".md" -> md (hanya bila diminta eksplisit)
 *   tanpa kata format -> pdf
 *
 * Murni (tanpa I/O): hanya membaca teks perintah. Dipakai saat tugas dibuat
 * (app/api/agent-tasks/route.ts -> inputPayload.reportFormat) dan dibaca
 * kembali oleh lib/agents/reports.ts saat file dibuat.
 */

export type ReportFormat = 'pdf' | 'xlsx' | 'docx' | 'md';

export const DEFAULT_REPORT_FORMAT: ReportFormat = 'pdf';

export const REPORT_FORMAT_MIME: Record<ReportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown',
};

export const REPORT_FORMAT_EXT: Record<ReportFormat, string> = {
  pdf: 'pdf',
  xlsx: 'xlsx',
  docx: 'docx',
  md: 'md',
};

/** Label Bahasa Indonesia untuk kartu file di chat. */
export const REPORT_FORMAT_LABEL: Record<ReportFormat, string> = {
  pdf: 'Laporan PDF',
  xlsx: 'Laporan Excel',
  docx: 'Laporan Word',
  md: 'Laporan Markdown',
};

/** Normalisasi nilai apa pun menjadi ReportFormat yang valid (default pdf). */
export function normalizeReportFormat(value: unknown): ReportFormat {
  if (value === 'pdf' || value === 'xlsx' || value === 'docx' || value === 'md') return value;
  return DEFAULT_REPORT_FORMAT;
}

/**
 * Deteksi format dari teks perintah. Urutan penting: bila beberapa kata
 * format disebut, yang pertama disebut yang menang (mis. "rekap dalam
 * Excel atau PDF" -> xlsx). Word boundary dipakai supaya "word" tidak
 * cocok di dalam kata lain.
 */
export function parseReportFormat(text: string): ReportFormat {
  const t = (text || '').toLowerCase();
  // Cari posisi kemunculan pertama tiap kata format.
  const hits: Array<{ at: number; format: ReportFormat }> = [];
  const push = (re: RegExp, format: ReportFormat) => {
    const m = re.exec(t);
    if (m) hits.push({ at: m.index, format });
  };
  push(/\b(excel|xlsx|spreadsheet)\b/, 'xlsx');
  push(/\b(word|docx|dokumen word)\b/, 'docx');
  push(/\bpdf\b/, 'pdf');
  push(/\b(markdown|\.md)\b/, 'md');
  if (hits.length === 0) return DEFAULT_REPORT_FORMAT;
  hits.sort((a, b) => a.at - b.at);
  return hits[0].format;
}

/** Label untuk kartu file berdasarkan nama file (ekstensi). */
export function reportFormatLabelForFile(name?: string | null): string {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || ext === 'xlsx' || ext === 'docx' || ext === 'md') {
    return REPORT_FORMAT_LABEL[ext];
  }
  return 'Laporan';
}
