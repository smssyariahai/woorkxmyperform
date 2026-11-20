/**
 * File laporan hasil tugas agent — lib/agents/reports.ts
 *
 * Dipanggil scheduler SETELAH tool selesai (jalur normal maupun jalur
 * approve — hasil parsial tersimpan + toolExecuted), SEBELUM tugas
 * COMPLETED. Best-effort: bila pembuatan file gagal, tugas tetap selesai
 * tanpa file (reportFile: null), jangan pernah menggagalkan tugas.
 *
 * FORMAT (sejak Wave 6, permintaan user 2026-11-20): PDF adalah default
 * untuk SEMUA tugas laporan. Format lain hanya bila perintah menyebutnya
 * eksplisit (lihat lib/agents/format.ts: parseReportFormat):
 *   pdf  -> PDF rapi (pdfkit) — judul, meta, isi laporan AI (Markdown
 *           dirender: heading, paragraf, daftar, tabel), footer halaman.
 *   docx -> Word (lib `docx`) — isi sama dengan PDF.
 *   xlsx -> Excel (lib `xlsx` yang sudah ada) — rekap keuangan (sheet
 *           "Rekap") atau laporan generik (sheet "Laporan").
 *   md   -> Markdown mentah — HANYA bila diminta eksplisit.
 * delegasi_tugas / tanpa tool -> tidak ada file (null).
 *
 * Penyimpanan: uploads/kantor/laporan/<organizationId>/<taskId>-<slug>.<ext>
 * (pola sama seperti uploads E-Arsip). TANPA migrasi: info file dicatat di
 * resultPayload JSON tugas: { summary, data, reportFile: { path, name, mime, size } }.
 * Route unduh: GET /api/agent-tasks/[id]/file (auth + cek organisasi +
 * guard traversal).
 */
import { mkdir, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ShadingType,
  LevelFormat,
} from 'docx';
import { formatBulanTahun } from './month';
import { normalizeReportFormat, REPORT_FORMAT_MIME, type ReportFormat } from './format';

export interface ReportFileInfo {
  path: string; // relatif dari root repo, mis. uploads/kantor/laporan/<org>/<file>
  name: string; // nama file untuk Content-Disposition
  mime: string;
  size: number;
}

export const KANTOR_REPORT_DIR = join(process.cwd(), 'uploads', 'kantor', 'laporan');

const REPORTABLE_TOOLS = new Set([
  'laporan_kinerja',
  'rekap_pelanggan',
  'status_kampanye',
  'status_sistem',
  'daftar_tugas',
]);

const TOOL_TITLES: Record<string, string> = {
  laporan_kinerja: 'Laporan Kinerja',
  rekap_pelanggan: 'Rekap Pelanggan',
  status_kampanye: 'Status Kampanye',
  status_sistem: 'Status Sistem',
  daftar_tugas: 'Daftar Tugas Agent',
  rekap_keuangan: 'Rekap Tagihan WOORK',
};

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Markdown — parser blok bersama (dipakai PDF + DOCX)
// ---------------------------------------------------------------------------

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type MdBlock =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; runs: InlineRun[] }
  | { type: 'ul'; items: InlineRun[][] }
  | { type: 'ol'; items: InlineRun[][] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'hr' };

/** `**tebal**`, `*miring*`, `` `kode` ``, `[teks](url)` -> teks saja. */
export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  // Tokenisasi berurutan: cari penanda **, *, `, [..](..) terdekat.
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (t: string, style: Partial<InlineRun>) => {
    if (t) runs.push({ text: t, ...style });
  };
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) push(text.slice(last, m.index), {});
    const tok = m[0];
    if (tok.startsWith('**')) push(tok.slice(2, -2), { bold: true });
    else if (tok.startsWith('`')) push(tok.slice(1, -1), { code: true });
    else if (tok.startsWith('[')) push(tok.slice(1, tok.indexOf(']')), {});
    else if (tok.startsWith('*')) push(tok.slice(1, -1), { italic: true });
    else push(tok.slice(1, -1), { italic: true });
    last = m.index + tok.length;
  }
  if (last < text.length) push(text.slice(last), {});
  return runs.length > 0 ? runs : [{ text }];
}

function splitTableRow(line: string): string[] {
  const t = line.trim();
  const inner = t.startsWith('|') ? t.slice(1) : t;
  const inner2 = inner.endsWith('|') ? inner.slice(0, -1) : inner;
  return inner2.split('|').map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

/** Teks Markdown -> blok-blok (heading, paragraf, daftar, tabel, garis). */
export function parseMarkdownBlocks(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let para: string[] = [];
  let inCode = false;
  const flushPara = () => {
    const t = para.join(' ').replace(/\s+/g, ' ').trim();
    para = [];
    if (t) blocks.push({ type: 'p', runs: parseInline(t) });
  };
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (line.startsWith('```')) {
      inCode = !inCode;
      i++;
      continue;
    }
    if (inCode) {
      flushPara();
      blocks.push({ type: 'p', runs: [{ text: raw, code: true }] });
      i++;
      continue;
    }
    if (!line) {
      flushPara();
      i++;
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushPara();
      blocks.push({ type: (h[1].length === 1 ? 'h1' : h[1].length === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3', text: h[2].trim() });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushPara();
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    if (line.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushPara();
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      flushPara();
      const items: InlineRun[][] = [];
      while (i < lines.length) {
        const b = lines[i].trim().match(/^[-*•]\s+(.*)$/);
        if (!b) break;
        items.push(parseInline(b[1].trim()));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    const ordered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      flushPara();
      const items: InlineRun[][] = [];
      while (i < lines.length) {
        const o = lines[i].trim().match(/^\d+[.)]\s+(.*)$/);
        if (!o) break;
        items.push(parseInline(o[1].trim()));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

// ---------------------------------------------------------------------------
// Data tool -> blok Markdown (dipakai PDF/DOCX saat BUKAN laporan AI,
// dan sebagai lampiran data bila diperlukan)
// ---------------------------------------------------------------------------

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (v instanceof Date) return fmtDateShort(v);
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('id-ID') : String(v);
  if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak';
  const s = String(v).replace(/\|/g, '/').replace(/\n/g, ' ');
  return s === '' ? '-' : s;
}

function labelKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Satu nilai data -> blok-blok (tabel untuk array objek). */
function dataValueToBlocks(key: string, value: unknown, blocks: MdBlock[], depth = 0): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      blocks.push({ type: 'p', runs: [{ text: `${labelKey(key)}: (kosong)`, bold: true }] });
      return;
    }
    if (value.every((v) => typeof v === 'object' && v !== null && !(v instanceof Date))) {
      const cols = [...new Set((value as Record<string, unknown>[]).flatMap((r) => Object.keys(r)))];
      blocks.push({ type: 'h3', text: labelKey(key) });
      blocks.push({
        type: 'table',
        headers: cols.map(labelKey),
        rows: (value as Record<string, unknown>[]).map((row) => cols.map((c) => fmtCell(row[c]))),
      });
      return;
    }
    blocks.push({ type: 'p', runs: parseInline(`**${labelKey(key)}**: ${value.map((v) => fmtCell(v)).join(', ')}`) });
    return;
  }
  if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
    if (depth >= 1) {
      blocks.push({ type: 'p', runs: parseInline(`**${labelKey(key)}**: ${fmtCell(JSON.stringify(value))}`) });
      return;
    }
    blocks.push({ type: 'h3', text: labelKey(key) });
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      dataValueToBlocks(k, v, blocks, depth + 1);
    }
    return;
  }
  blocks.push({ type: 'p', runs: parseInline(`**${labelKey(key)}**: ${fmtCell(value)}`) });
}

function dataToBlocks(data: any): MdBlock[] {
  const blocks: MdBlock[] = [];
  const d = data && typeof data === 'object' ? data : {};
  for (const k of Object.keys(d)) dataValueToBlocks(k, d[k], blocks);
  return blocks;
}

// ---------------------------------------------------------------------------
// .md — renderer generik dari data agregasi tool (hanya bila diminta)
// ---------------------------------------------------------------------------

function renderValue(key: string, value: unknown, lines: string[], depth = 0): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`- **${labelKey(key)}**: (kosong)`);
      return;
    }
    if (value.every((v) => typeof v === 'object' && v !== null && !(v instanceof Date))) {
      const cols = [...new Set((value as Record<string, unknown>[]).flatMap((r) => Object.keys(r)))];
      lines.push('', `### ${labelKey(key)}`, '');
      lines.push(`| ${cols.map(labelKey).join(' | ')} |`);
      lines.push(`| ${cols.map(() => '---').join(' | ')} |`);
      for (const row of value as Record<string, unknown>[]) {
        lines.push(`| ${cols.map((c) => fmtCell(row[c])).join(' | ')} |`);
      }
      lines.push('');
      return;
    }
    lines.push(`- **${labelKey(key)}**: ${value.map((v) => fmtCell(v)).join(', ')}`);
    return;
  }
  if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
    if (depth >= 1) {
      lines.push(`- **${labelKey(key)}**: ${fmtCell(JSON.stringify(value))}`);
      return;
    }
    lines.push('', `### ${labelKey(key)}`, '');
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      renderValue(k, v, lines, depth + 1);
    }
    return;
  }
  lines.push(`- **${labelKey(key)}**: ${fmtCell(value)}`);
}

function buildMarkdown(input: {
  title: string;
  agentName: string;
  summary: string;
  data: any;
  periode?: string;
}): string {
  const lines: string[] = [];
  lines.push(`# ${input.title}`, '');
  lines.push(`- **Periode**: ${input.periode ?? fmtDateShort(new Date())}`);
  lines.push(`- **Dibuat oleh**: ${input.agentName} (Kantor Virtual WOORK)`);
  lines.push(`- **Dibuat pada**: ${new Date().toLocaleString('id-ID')}`, '');
  lines.push('## Ringkasan', '', input.summary, '');
  const data = input.data && typeof input.data === 'object' ? input.data : {};
  const keys = Object.keys(data);
  if (keys.length > 0) {
    lines.push('## Data', '');
    for (const k of keys) renderValue(k, data[k], lines);
    lines.push('');
  }
  lines.push('---', '', '_Angka di atas berasal dari database WOORK kantor ini — bukan karangan._');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Data rekap keuangan — dipakai XLSX / PDF / DOCX
// ---------------------------------------------------------------------------

interface KeuanganData {
  periode: string;
  totalTagihan: number;
  totalLunas: number;
  totalBelumLunas: number;
  jumlahInvoice: number;
  invoices: Array<{ nomor: string; periode: string; status: string; total: number; dibayarPada: string }>;
  perModul: Array<{ modul: string; jumlahItem: number; total: number }>;
}

function extractKeuanganData(data: any): KeuanganData {
  const d = data ?? {};
  const periode: string =
    typeof d.periode === 'string'
      ? d.periode
      : formatBulanTahun(Number(d.year) || new Date().getFullYear(), Number(d.month) || new Date().getMonth() + 1);
  const invoices: Array<Record<string, any>> = Array.isArray(d.invoices) ? d.invoices : [];
  const perModul: Array<Record<string, any>> = Array.isArray(d.per_modul) ? d.per_modul : [];
  return {
    periode,
    totalTagihan: Number(d.total_tagihan ?? 0),
    totalLunas: Number(d.total_lunas ?? 0),
    totalBelumLunas: Number(d.total_belum_lunas ?? 0),
    jumlahInvoice: Number(d.jumlah_invoice ?? invoices.length),
    invoices: invoices.map((inv) => ({
      nomor: String(inv.nomor ?? '-'),
      periode: String(inv.periode ?? '-'),
      status: String(inv.status ?? '-'),
      total: Number(inv.total ?? 0),
      dibayarPada: String(inv.dibayar_pada ?? '-'),
    })),
    perModul: perModul.map((m) => ({
      modul: String(m.modul ?? '-'),
      jumlahItem: Number(m.jumlah_item ?? 0),
      total: Number(m.total ?? 0),
    })),
  };
}

function fmtRp(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

// ---------------------------------------------------------------------------
// .xlsx — Rekap Tagihan WOORK (sumber: Invoice + InvoiceItem nyata)
// ---------------------------------------------------------------------------

function buildKeuanganXlsx(input: {
  agentName: string;
  summary: string;
  data: any;
}): Buffer {
  const k = extractKeuanganData(input.data);

  const rows: unknown[][] = [];
  rows.push([`Rekap Tagihan WOORK — ${k.periode}`]);
  rows.push(['Sumber: tagihan langganan modul WOORK (Invoice) kantor ini. Bukan laporan keuangan lengkap / bukan rekap kas operasional.']);
  rows.push([`Dibuat oleh ${input.agentName} — ${new Date().toLocaleString('id-ID')}`]);
  rows.push([]);
  rows.push(['Ringkasan']);
  rows.push(['Total tagihan', k.totalTagihan]);
  rows.push(['Total lunas (PAID)', k.totalLunas]);
  rows.push(['Total belum lunas (PENDING/OVERDUE)', k.totalBelumLunas]);
  rows.push(['Jumlah invoice', k.jumlahInvoice]);
  rows.push([]);
  if (k.invoices.length === 0) {
    rows.push([`Tidak ada tagihan tercatat untuk ${k.periode}.`]);
  } else {
    rows.push(['Rincian per invoice']);
    rows.push(['Nomor', 'Periode', 'Status', 'Total (Rp)', 'Dibayar pada']);
    for (const inv of k.invoices) {
      rows.push([inv.nomor, inv.periode, inv.status, inv.total, inv.dibayarPada]);
    }
    rows.push([]);
    if (k.perModul.length > 0) {
      rows.push(['Rincian per modul']);
      rows.push(['Modul', 'Jumlah item', 'Total (Rp)']);
      for (const m of k.perModul) {
        rows.push([m.modul, m.jumlahItem, m.total]);
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 42 }, { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ---------------------------------------------------------------------------
// .xlsx — laporan generik (tool non-keuangan yang diminta dalam Excel)
// ---------------------------------------------------------------------------

function buildGenericXlsx(input: {
  title: string;
  agentName: string;
  summary: string;
  data: any;
}): Buffer {
  const rows: unknown[][] = [];
  rows.push([input.title]);
  rows.push([`Dibuat oleh ${input.agentName} (Kantor Virtual WOORK) — ${new Date().toLocaleString('id-ID')}`]);
  rows.push([]);
  rows.push(['Ringkasan']);
  for (const line of String(input.summary || '').split('\n')) {
    if (line.trim()) rows.push([line.trim()]);
  }
  rows.push([]);
  rows.push(['Data']);
  const d = input.data && typeof input.data === 'object' ? input.data : {};
  for (const key of Object.keys(d)) {
    const v = d[key];
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'object' && x !== null)) {
      rows.push([]);
      rows.push([labelKey(key)]);
      const cols = [...new Set((v as Record<string, unknown>[]).flatMap((r) => Object.keys(r)))];
      rows.push(cols.map(labelKey));
      for (const row of v as Record<string, unknown>[]) {
        rows.push(cols.map((c) => (typeof row[c] === 'number' ? row[c] : fmtCell(row[c]))));
      }
    } else if (Array.isArray(v)) {
      rows.push([labelKey(key), v.map((x) => fmtCell(x)).join(', ')]);
    } else if (typeof v === 'object' && v !== null) {
      rows.push([labelKey(key)]);
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        rows.push([`  ${labelKey(k2)}`, typeof v2 === 'number' ? v2 : fmtCell(v2)]);
      }
    } else {
      rows.push([labelKey(key), typeof v === 'number' ? v : fmtCell(v)]);
    }
  }
  rows.push([]);
  rows.push(['Angka di atas berasal dari database WOORK kantor ini — bukan karangan.']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 42 }, { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ---------------------------------------------------------------------------
// PDF — laporan rapi (pdfkit, A4). Isi: judul + meta + blok Markdown
// (heading, paragraf bold/italic, daftar, tabel) + footer halaman.
// ---------------------------------------------------------------------------

const PDF_MARGIN = 56;
const PDF_PAGE_W = 595.28; // A4
const PDF_PAGE_H = 841.89;
// Batas bawah konten: disisakan ruang untuk footer (footer digambar di
// y = PAGE_H - 76, di DALAM area tulis — pdfkit text() di bawah margin
// bawah malah membuat halaman baru, jadi footer HARUS di atas batas itu).
const PDF_BOTTOM = PDF_PAGE_H - 90;
const PDF_CONTENT_W = PDF_PAGE_W - PDF_MARGIN * 2;

type PdfDoc = InstanceType<typeof PDFDocument>;

function pdfFontFor(run: InlineRun): string {
  if (run.code) return 'Courier';
  if (run.bold && run.italic) return 'Helvetica-BoldOblique';
  if (run.bold) return 'Helvetica-Bold';
  if (run.italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function pdfWidth(doc: PdfDoc, text: string, font: string, size: number): number {
  return doc.font(font).fontSize(size).widthOfString(text);
}

/** Pecah kata yang terlalu panjang menjadi potongan muat lebar. */
function splitLongWord(word: string, font: string, size: number, doc: PdfDoc, maxW: number): string[] {
  if (pdfWidth(doc, word, font, size) <= maxW) return [word];
  const parts: string[] = [];
  let cur = '';
  for (const ch of word) {
    if (pdfWidth(doc, cur + ch, font, size) > maxW && cur) {
      parts.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

interface PdfLine {
  words: Array<{ text: string; run: InlineRun }>;
  width: number;
}

/** Bagi runs menjadi baris-baris sesuai lebar (wrap manual, deterministik). */
function wrapRuns(doc: PdfDoc, runs: InlineRun[], size: number, maxW: number): PdfLine[] {
  const words: Array<{ text: string; run: InlineRun }> = [];
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/).filter((p) => p.length > 0);
    for (const p of parts) {
      if (/^\s+$/.test(p)) continue;
      const font = pdfFontFor(run);
      for (const piece of splitLongWord(p, font, size, doc, maxW)) {
        words.push({ text: piece, run });
      }
    }
  }
  const lines: PdfLine[] = [];
  let cur: Array<{ text: string; run: InlineRun }> = [];
  let curW = 0;
  const spaceW = (font: string) => pdfWidth(doc, ' ', font, size);
  for (const w of words) {
    const font = pdfFontFor(w.run);
    const ww = pdfWidth(doc, w.text, font, size);
    const sep = cur.length > 0 ? spaceW(pdfFontFor(cur[cur.length - 1].run)) : 0;
    if (cur.length > 0 && curW + sep + ww > maxW) {
      lines.push({ words: cur, width: curW });
      cur = [w];
      curW = ww;
    } else {
      curW += sep + ww;
      cur.push(w);
    }
  }
  if (cur.length > 0) lines.push({ words: cur, width: curW });
  return lines;
}

function pdfEnsureSpace(doc: PdfDoc, needed: number): void {
  if (doc.y + needed > PDF_BOTTOM) doc.addPage();
}

function pdfDrawLine(doc: PdfDoc, line: PdfLine, x: number, y: number, size: number): void {
  let cx = x;
  for (let idx = 0; idx < line.words.length; idx++) {
    const w = line.words[idx];
    const font = pdfFontFor(w.run);
    doc.font(font).fontSize(size).fillColor('#1e293b');
    doc.text(w.text, cx, y, { lineBreak: false });
    cx += pdfWidth(doc, w.text, font, size);
    if (idx < line.words.length - 1) cx += pdfWidth(doc, ' ', font, size);
  }
}

function pdfDrawRichParagraph(doc: PdfDoc, runs: InlineRun[], opts: { size?: number; indent?: number; lineGap?: number } = {}): void {
  const size = opts.size ?? 10.5;
  const indent = opts.indent ?? 0;
  const lineH = size * 1.45;
  const lines = wrapRuns(doc, runs, size, PDF_CONTENT_W - indent);
  if (lines.length === 0) {
    doc.moveDown(0.4);
    return;
  }
  for (const line of lines) {
    pdfEnsureSpace(doc, lineH);
    pdfDrawLine(doc, line, PDF_MARGIN + indent, doc.y, size);
    doc.y += lineH;
  }
  doc.y += opts.lineGap ?? 2;
}

function pdfDrawTable(doc: PdfDoc, headers: string[], rows: string[][]): void {
  const fontSize = 9;
  const lineH = fontSize * 1.4;
  const padX = 5;
  const padY = 3;
  const colCount = headers.length;
  // Lebar alami per kolom (header + isi), lalu skala ke lebar konten.
  const natural: number[] = headers.map((h, ci) => {
    let w = pdfWidth(doc, h, 'Helvetica-Bold', fontSize);
    for (const r of rows) {
      const cell = r[ci] ?? '';
      for (const word of String(cell).split(/\s+/)) {
        w = Math.max(w, pdfWidth(doc, word, 'Helvetica', fontSize));
      }
      w = Math.max(w, pdfWidth(doc, String(cell).slice(0, 40), 'Helvetica', fontSize) * 0.6);
    }
    return w + padX * 2;
  });
  let total = natural.reduce((a, b) => a + b, 0);
  const widths = [...natural];
  if (total > PDF_CONTENT_W) {
    const scale = PDF_CONTENT_W / total;
    for (let i = 0; i < widths.length; i++) widths[i] = Math.max(28, widths[i] * scale);
    total = widths.reduce((a, b) => a + b, 0);
    if (total > PDF_CONTENT_W) {
      const s2 = PDF_CONTENT_W / total;
      for (let i = 0; i < widths.length; i++) widths[i] *= s2;
    }
  }
  const drawRow = (cells: string[], isHeader: boolean, y: number): number => {
    const font = isHeader ? 'Helvetica-Bold' : 'Helvetica';
    let maxLines = 1;
    const cellLines: PdfLine[][] = cells.map((c, ci) => {
      const ls = wrapRuns(doc, [{ text: c || '-' }], fontSize, widths[ci] - padX * 2);
      maxLines = Math.max(maxLines, Math.max(1, ls.length));
      return ls;
    });
    const h = maxLines * lineH + padY * 2;
    if (isHeader) {
      doc.rect(PDF_MARGIN, y, widths.reduce((a, b) => a + b, 0), h).fill('#e8eef5');
    }
    let cx = PDF_MARGIN;
    for (let ci = 0; ci < colCount; ci++) {
      doc.rect(cx, y, widths[ci], h).strokeColor('#cbd5e1').stroke();
      let cy = y + padY;
      for (const line of cellLines[ci]) {
        doc.font(font).fontSize(fontSize).fillColor('#1e293b');
        pdfDrawLine(doc, line, cx + padX, cy, fontSize);
        cy += lineH;
      }
      cx += widths[ci];
    }
    return h;
  };
  // Header + baris, dengan pengulangan header bila ganti halaman.
  pdfEnsureSpace(doc, lineH * 3);
  let y = doc.y;
  y += drawRow(headers, true, y);
  for (const row of rows) {
    const cells = headers.map((_, ci) => row[ci] ?? '');
    const font = 'Helvetica';
    let maxLines = 1;
    for (let ci = 0; ci < colCount; ci++) {
      const ls = wrapRuns(doc, [{ text: cells[ci] || '-' }], fontSize, widths[ci] - padX * 2);
      maxLines = Math.max(maxLines, Math.max(1, ls.length));
    }
    const h = maxLines * lineH + padY * 2;
    if (y + h > PDF_BOTTOM) {
      doc.addPage();
      y = doc.y;
      y += drawRow(headers, true, y);
    }
    y += drawRow(cells, false, y);
  }
  doc.y = y + 6;
}

function pdfDrawBlocks(doc: PdfDoc, blocks: MdBlock[]): void {
  for (const b of blocks) {
    if (b.type === 'h1') {
      pdfEnsureSpace(doc, 44);
      doc.y += 6;
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a');
      doc.text(b.text, PDF_MARGIN, doc.y, { width: PDF_CONTENT_W });
      doc.y += 8;
    } else if (b.type === 'h2') {
      pdfEnsureSpace(doc, 36);
      doc.y += 8;
      doc.font('Helvetica-Bold').fontSize(13.5).fillColor('#0f172a');
      doc.text(b.text, PDF_MARGIN, doc.y, { width: PDF_CONTENT_W });
      doc.y += 6;
    } else if (b.type === 'h3') {
      pdfEnsureSpace(doc, 30);
      doc.y += 6;
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#0f172a');
      doc.text(b.text, PDF_MARGIN, doc.y, { width: PDF_CONTENT_W });
      doc.y += 5;
    } else if (b.type === 'p') {
      pdfDrawRichParagraph(doc, b.runs);
    } else if (b.type === 'ul') {
      for (const item of b.items) {
        const lines = wrapRuns(doc, item, 10.5, PDF_CONTENT_W - 18);
        for (let li = 0; li < lines.length; li++) {
          pdfEnsureSpace(doc, 10.5 * 1.45);
          if (li === 0) {
            doc.font('Helvetica').fontSize(10.5).fillColor('#1e293b');
            doc.text('•', PDF_MARGIN + 4, doc.y, { lineBreak: false });
          }
          pdfDrawLine(doc, lines[li], PDF_MARGIN + 18, doc.y, 10.5);
          doc.y += 10.5 * 1.45;
        }
      }
      doc.y += 3;
    } else if (b.type === 'ol') {
      b.items.forEach((item, idx) => {
        const marker = `${idx + 1}.`;
        const lines = wrapRuns(doc, item, 10.5, PDF_CONTENT_W - 22);
        for (let li = 0; li < lines.length; li++) {
          pdfEnsureSpace(doc, 10.5 * 1.45);
          if (li === 0) {
            doc.font('Helvetica').fontSize(10.5).fillColor('#1e293b');
            doc.text(marker, PDF_MARGIN + 2, doc.y, { lineBreak: false });
          }
          pdfDrawLine(doc, lines[li], PDF_MARGIN + 22, doc.y, 10.5);
          doc.y += 10.5 * 1.45;
        }
      });
      doc.y += 3;
    } else if (b.type === 'table') {
      pdfDrawTable(doc, b.headers, b.rows);
    } else if (b.type === 'hr') {
      pdfEnsureSpace(doc, 16);
      doc.y += 4;
      doc.strokeColor('#cbd5e1').lineWidth(1)
        .moveTo(PDF_MARGIN, doc.y)
        .lineTo(PDF_MARGIN + PDF_CONTENT_W, doc.y)
        .stroke();
      doc.y += 8;
    }
  }
}

async function buildPdfReport(input: {
  title: string;
  agentName: string;
  summary: string;
  data: any;
  periode?: string;
  toolKey: string;
  aiReport: boolean;
}): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: PDF_MARGIN, bottom: PDF_MARGIN, left: PDF_MARGIN, right: PDF_MARGIN },
    bufferPages: true,
    info: { Title: input.title, Author: `WOORK — Kantor Virtual (${input.agentName})` },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Kop halaman pertama.
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748b');
  doc.text('WOORK — KANTOR VIRTUAL', PDF_MARGIN, doc.y, { width: PDF_CONTENT_W });
  doc.y += 4;
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a');
  doc.text(input.title, PDF_MARGIN, doc.y, { width: PDF_CONTENT_W });
  doc.y += 6;
  doc.font('Helvetica').fontSize(9.5).fillColor('#475569');
  doc.text(`Dibuat oleh ${input.agentName}  •  ${new Date().toLocaleString('id-ID')}`, PDF_MARGIN, doc.y, { width: PDF_CONTENT_W });
  if (input.periode) {
    doc.text(`Periode: ${input.periode}`, PDF_MARGIN, doc.y, { width: PDF_CONTENT_W });
  }
  doc.y += 6;
  doc.strokeColor('#94a3b8').lineWidth(1)
    .moveTo(PDF_MARGIN, doc.y)
    .lineTo(PDF_MARGIN + PDF_CONTENT_W, doc.y)
    .stroke();
  doc.y += 10;

  // Isi laporan (teks AI sebagai Markdown; bila fallback, ringkasan + data).
  const blocks = parseMarkdownBlocks(input.summary);
  pdfDrawBlocks(doc, blocks);

  // Rekap keuangan: rincian tagihan terstruktur dari data (angka presisi).
  if (input.toolKey === 'rekap_keuangan') {
    const k = extractKeuanganData(input.data);
    const finBlocks: MdBlock[] = [
      { type: 'h2', text: 'Ringkasan' },
      { type: 'p', runs: parseInline(`**Total tagihan**: ${fmtRp(k.totalTagihan)}`) },
      { type: 'p', runs: parseInline(`**Total lunas (PAID)**: ${fmtRp(k.totalLunas)}`) },
      { type: 'p', runs: parseInline(`**Total belum lunas (PENDING/OVERDUE)**: ${fmtRp(k.totalBelumLunas)}`) },
      { type: 'p', runs: parseInline(`**Jumlah invoice**: ${k.jumlahInvoice}`) },
    ];
    if (k.invoices.length === 0) {
      finBlocks.push({ type: 'p', runs: [{ text: `Tidak ada tagihan tercatat untuk ${k.periode}.` }] });
    } else {
      finBlocks.push(
        { type: 'h2', text: 'Rincian per Invoice' },
        {
          type: 'table',
          headers: ['Nomor', 'Periode', 'Status', 'Total (Rp)', 'Dibayar pada'],
          rows: k.invoices.map((inv) => [inv.nomor, inv.periode, inv.status, inv.total.toLocaleString('id-ID'), inv.dibayarPada]),
        },
      );
      if (k.perModul.length > 0) {
        finBlocks.push(
          { type: 'h2', text: 'Rincian per Modul' },
          {
            type: 'table',
            headers: ['Modul', 'Jumlah item', 'Total (Rp)'],
            rows: k.perModul.map((m) => [m.modul, String(m.jumlahItem), m.total.toLocaleString('id-ID')]),
          },
        );
      }
    }
    pdfDrawBlocks(doc, finBlocks);
  } else if (!input.aiReport) {
    // Fallback (bukan AI): lampirkan tabel data agar laporan tetap lengkap.
    const dataBlocks = dataToBlocks(input.data);
    if (dataBlocks.length > 0) {
      pdfDrawBlocks(doc, [{ type: 'h2', text: 'Data' }, ...dataBlocks]);
    }
  }

  // Catatan kaki kejujuran.
  doc.y += 6;
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b');
  doc.text('Angka di atas berasal dari database WOORK kantor ini — bukan karangan.', PDF_MARGIN, doc.y, { width: PDF_CONTENT_W });

  // Footer tiap halaman (nomor halaman + brand). Footer digambar di
  // y = PAGE_H - 76, di DALAM area tulis (di atas batas margin bawah
  // 785,89): pdfkit text() di bawah margin malah membuat halaman baru.
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8');
    doc.text(`WOORK — Kantor Virtual  •  Halaman ${p - range.start + 1} dari ${range.count}`, PDF_MARGIN, PDF_PAGE_H - 76, {
      width: PDF_CONTENT_W,
      align: 'center',
      lineBreak: false,
    });
  }
  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// DOCX — laporan Word (lib `docx`). Isi sama dengan PDF.
// ---------------------------------------------------------------------------

function runsToDocx(runs: InlineRun[], size = 22): TextRun[] {
  return runs.map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic,
        font: r.code ? 'Consolas' : undefined,
        size,
        color: r.code ? '334155' : undefined,
      }),
  );
}

function blocksToDocx(blocks: MdBlock[]): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  for (const b of blocks) {
    if (b.type === 'h1') {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: b.text, bold: true, size: 32 })] }));
    } else if (b.type === 'h2') {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: b.text, bold: true, size: 28 })] }));
    } else if (b.type === 'h3') {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: b.text, bold: true, size: 24 })] }));
    } else if (b.type === 'p') {
      out.push(new Paragraph({ children: runsToDocx(b.runs), spacing: { after: 120 } }));
    } else if (b.type === 'ul') {
      for (const item of b.items) {
        out.push(new Paragraph({ bullet: { level: 0 }, children: runsToDocx(item), spacing: { after: 60 } }));
      }
    } else if (b.type === 'ol') {
      for (const item of b.items) {
        out.push(new Paragraph({ numbering: { reference: 'kantor-numbering', level: 0 }, children: runsToDocx(item), spacing: { after: 60 } }));
      }
    } else if (b.type === 'table') {
      out.push(docxTable(b.headers, b.rows));
    } else if (b.type === 'hr') {
      out.push(new Paragraph({ children: [new TextRun({ text: '─'.repeat(60), color: 'CBD5E1', size: 18 })], spacing: { before: 120, after: 120 } }));
    }
  }
  return out;
}

function docxTable(headers: string[], rows: string[][]): Table {
  const totalDxa = 9360; // A4 minus margin 1" kiri-kanan
  const weights = headers.map((h, ci) => {
    let w = Math.max(h.length, ...rows.map((r) => (r[ci] ?? '').length));
    return Math.max(6, Math.min(42, w));
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map((w) => Math.max(700, Math.round((w / sum) * totalDxa)));
  const cell = (text: string, isHeader: boolean) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text: text || '-', bold: isHeader, size: 20 })],
          spacing: { before: 40, after: 40 },
        }),
      ],
      ...(isHeader ? { shading: { type: ShadingType.CLEAR, fill: 'E8EEF5' } } : {}),
      margins: { top: 40, bottom: 40, left: 100, right: 100 },
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: colWidths,
    rows: [
      new TableRow({ children: headers.map((h) => cell(h, true)) }),
      ...rows.map((r) => new TableRow({ children: headers.map((_, ci) => cell(r[ci] ?? '-', false)) })),
    ],
  });
}

async function buildDocxReport(input: {
  title: string;
  agentName: string;
  summary: string;
  data: any;
  periode?: string;
  toolKey: string;
  aiReport: boolean;
}): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [];
  children.push(
    new Paragraph({ children: [new TextRun({ text: 'WOORK — KANTOR VIRTUAL', bold: true, size: 18, color: '64748B' })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: input.title, bold: true, size: 36 })] }),
    new Paragraph({
      children: [new TextRun({ text: `Dibuat oleh ${input.agentName}  •  ${new Date().toLocaleString('id-ID')}`, size: 20, color: '475569' })],
    }),
  );
  if (input.periode) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: `Periode: ${input.periode}`, size: 20, color: '475569' })] }),
    );
  }
  children.push(
    new Paragraph({ children: [new TextRun({ text: '─'.repeat(60), color: '94A3B8', size: 18 })], spacing: { before: 120, after: 120 } }),
  );

  children.push(...blocksToDocx(parseMarkdownBlocks(input.summary)));

  if (input.toolKey === 'rekap_keuangan') {
    const k = extractKeuanganData(input.data);
    const finBlocks: MdBlock[] = [
      { type: 'h2', text: 'Ringkasan' },
      { type: 'p', runs: parseInline(`**Total tagihan**: ${fmtRp(k.totalTagihan)}`) },
      { type: 'p', runs: parseInline(`**Total lunas (PAID)**: ${fmtRp(k.totalLunas)}`) },
      { type: 'p', runs: parseInline(`**Total belum lunas (PENDING/OVERDUE)**: ${fmtRp(k.totalBelumLunas)}`) },
      { type: 'p', runs: parseInline(`**Jumlah invoice**: ${k.jumlahInvoice}`) },
    ];
    if (k.invoices.length === 0) {
      finBlocks.push({ type: 'p', runs: [{ text: `Tidak ada tagihan tercatat untuk ${k.periode}.` }] });
    } else {
      finBlocks.push(
        { type: 'h2', text: 'Rincian per Invoice' },
        {
          type: 'table',
          headers: ['Nomor', 'Periode', 'Status', 'Total (Rp)', 'Dibayar pada'],
          rows: k.invoices.map((inv) => [inv.nomor, inv.periode, inv.status, inv.total.toLocaleString('id-ID'), inv.dibayarPada]),
        },
      );
      if (k.perModul.length > 0) {
        finBlocks.push(
          { type: 'h2', text: 'Rincian per Modul' },
          {
            type: 'table',
            headers: ['Modul', 'Jumlah item', 'Total (Rp)'],
            rows: k.perModul.map((m) => [m.modul, String(m.jumlahItem), m.total.toLocaleString('id-ID')]),
          },
        );
      }
    }
    children.push(...blocksToDocx(finBlocks));
  } else if (!input.aiReport) {
    const dataBlocks = dataToBlocks(input.data);
    if (dataBlocks.length > 0) {
      children.push(...blocksToDocx([{ type: 'h2', text: 'Data' }, ...dataBlocks]));
    }
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Angka di atas berasal dari database WOORK kantor ini — bukan karangan.',
          italics: true,
          size: 18,
          color: '64748B',
        }),
      ],
      spacing: { before: 240 },
    }),
  );

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'kantor-numbering',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------------
// Entry point (dipanggil scheduler)
// ---------------------------------------------------------------------------

export async function generateTaskReport(input: {
  organizationId: string;
  taskId: string;
  toolKey: string | null;
  title: string;
  agentName: string;
  summary: string;
  data: any;
  /** Format yang diminta perintah (inputPayload.reportFormat); default pdf. */
  reportFormat?: ReportFormat | string | null;
  /** true bila summary adalah teks AI (sudah memuat tabelnya sendiri). */
  aiReport?: boolean;
}): Promise<ReportFileInfo | null> {
  const { organizationId, taskId, toolKey } = input;
  try {
    if (!toolKey) return null;
    const format = normalizeReportFormat(input.reportFormat);
    const aiReport = input.aiReport === true;
    const periode =
      input.data && typeof input.data.periode === 'string' ? input.data.periode : undefined;
    let buffer: Buffer;
    let ext: string;
    let mime: string;
    let slug: string;

    if (toolKey === 'rekap_keuangan') {
      slug = 'rekap-tagihan-woork';
      if (format === 'xlsx') {
        buffer = buildKeuanganXlsx({ agentName: input.agentName, summary: input.summary, data: input.data });
        ext = 'xlsx';
        mime = REPORT_FORMAT_MIME.xlsx;
      } else if (format === 'docx') {
        buffer = await buildDocxReport({
          title: TOOL_TITLES.rekap_keuangan,
          agentName: input.agentName,
          summary: input.summary,
          data: input.data,
          periode,
          toolKey,
          aiReport,
        });
        ext = 'docx';
        mime = REPORT_FORMAT_MIME.docx;
      } else if (format === 'md') {
        const md = buildMarkdown({
          title: TOOL_TITLES.rekap_keuangan,
          agentName: input.agentName,
          summary: input.summary,
          data: input.data,
          periode,
        });
        buffer = Buffer.from(md, 'utf-8');
        ext = 'md';
        mime = REPORT_FORMAT_MIME.md;
      } else {
        buffer = await buildPdfReport({
          title: TOOL_TITLES.rekap_keuangan,
          agentName: input.agentName,
          summary: input.summary,
          data: input.data,
          periode,
          toolKey,
          aiReport,
        });
        ext = 'pdf';
        mime = REPORT_FORMAT_MIME.pdf;
      }
    } else if (REPORTABLE_TOOLS.has(toolKey)) {
      slug = toolKey.replace(/_/g, '-');
      if (format === 'xlsx') {
        buffer = buildGenericXlsx({
          title: TOOL_TITLES[toolKey] ?? input.title,
          agentName: input.agentName,
          summary: input.summary,
          data: input.data,
        });
        ext = 'xlsx';
        mime = REPORT_FORMAT_MIME.xlsx;
      } else if (format === 'docx') {
        buffer = await buildDocxReport({
          title: TOOL_TITLES[toolKey] ?? input.title,
          agentName: input.agentName,
          summary: input.summary,
          data: input.data,
          periode,
          toolKey,
          aiReport,
        });
        ext = 'docx';
        mime = REPORT_FORMAT_MIME.docx;
      } else if (format === 'md') {
        const md = buildMarkdown({
          title: TOOL_TITLES[toolKey] ?? input.title,
          agentName: input.agentName,
          summary: input.summary,
          data: input.data,
          periode,
        });
        buffer = Buffer.from(md, 'utf-8');
        ext = 'md';
        mime = REPORT_FORMAT_MIME.md;
      } else {
        buffer = await buildPdfReport({
          title: TOOL_TITLES[toolKey] ?? input.title,
          agentName: input.agentName,
          summary: input.summary,
          data: input.data,
          periode,
          toolKey,
          aiReport,
        });
        ext = 'pdf';
        mime = REPORT_FORMAT_MIME.pdf;
      }
    } else {
      return null; // delegasi_tugas & tool lain: tidak ada file laporan
    }

    const dir = join(KANTOR_REPORT_DIR, organizationId);
    await mkdir(dir, { recursive: true });
    const name = `${taskId}-${slug}.${ext}`;
    await writeFile(join(dir, name), buffer);
    return {
      path: `uploads/kantor/laporan/${organizationId}/${name}`,
      name,
      mime,
      size: buffer.length,
    };
  } catch (e) {
    // Best-effort: kegagalan file tidak boleh menggagalkan tugas.
    console.error('[agents] gagal membuat file laporan:', e);
    return null;
  }
}

/**
 * Path absolut dari path relatif laporan tersimpan; null bila tidak aman.
 * Guard traversal: hanya basename yang dipakai, dan path harus persis
 * uploads/kantor/laporan/<organizationId>/<file>.
 */
export function kantorReportFilePath(storedPath: string | null | undefined, organizationId: string): string | null {
  if (!storedPath) return null;
  const segments = storedPath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (
    segments.length !== 5 ||
    segments[0] !== 'uploads' ||
    segments[1] !== 'kantor' ||
    segments[2] !== 'laporan' ||
    segments[3] !== organizationId
  ) {
    return null;
  }
  const file = basename(segments[4]);
  if (!file || file === '.' || file === '..') return null;
  return join(KANTOR_REPORT_DIR, organizationId, file);
}
