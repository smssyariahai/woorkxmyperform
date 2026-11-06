import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { prisma } from '@/lib/db';

/**
 * Ekstraksi teks PDF E-Sign (dipakai AI-Agent untuk menjawab isi dokumen).
 *
 * - extractPdfText: pdfjs-dist (legacy build, mode Node tanpa worker) —
 *   teks per halaman digabung dengan pemisah halaman, whitespace
 *   dinormalisasi. Kembalikan '' bila PDF tidak punya lapisan teks
 *   (hasil scan/gambar) — bukan error.
 * - extractAndStoreDocumentText: baca file asli dokumen, ekstrak, simpan
 *   ke EsignDocument.extractedText (dipotong 100.000 karakter).
 *   NULL = belum diekstrak; '' = sudah diekstrak tapi tidak ada teks.
 */

export const EXTRACTED_TEXT_MAX_CHARS = 100_000;

function safeName(p: string): string {
  return p.split('/').pop()!.split('\\').pop()!;
}

function normalizeText(raw: string): string {
  return raw
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Ekstrak seluruh teks dari buffer PDF. '' bila tidak ada lapisan teks. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableWorker: true,
  });
  const doc = await loadingTask.promise;
  try {
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      try {
        const tc = await page.getTextContent();
        let pageText = '';
        for (const item of tc.items as any[]) {
          const s = typeof item?.str === 'string' ? item.str : '';
          if (!s) continue;
          pageText += s;
          pageText += item.hasEOL ? '\n' : ' ';
        }
        const cleanPageText = normalizeText(pageText);
        // Halaman tanpa teks dilewati — PDF tanpa lapisan teks harus
        // menghasilkan '' (bukan sekadar pemisah halaman).
        if (cleanPageText) parts.push(`--- Halaman ${i} ---\n\n${cleanPageText}`);
      } finally {
        try { page.cleanup(); } catch {}
      }
    }
    return normalizeText(parts.join('\n\n'));
  } finally {
    try { await doc.destroy(); } catch {}
  }
}

/**
 * Ekstrak teks file asli dokumen lalu simpan ke extractedText.
 * Kembalikan null bila dokumen tidak punya file / file tidak ditemukan
 * (extractedText tetap NULL agar bisa dicoba lagi nanti).
 * Bila ekstraksi gagal (file rusak/terenkripsi) → simpan '' (dianggap
 * tidak ada teks yang bisa dibaca) agar pertanyaan berikutnya tidak
 * mengulang ekstraksi yang sama.
 */
export async function extractAndStoreDocumentText(
  documentId: string
): Promise<{ text: string; truncated: boolean } | null> {
  const doc = await prisma.esignDocument.findUnique({
    where: { id: documentId },
    select: { id: true, originalFilePath: true },
  });
  if (!doc?.originalFilePath) return null;
  const full = join(process.cwd(), 'uploads', 'esign', 'originals', safeName(doc.originalFilePath));
  if (!existsSync(full)) {
    console.error('[esign-extract] file asli tidak ditemukan:', documentId);
    return null;
  }
  let text = '';
  let truncated = false;
  try {
    const buf = await readFile(full);
    text = await extractPdfText(buf);
  } catch (e: any) {
    console.error('[esign-extract] gagal mengekstrak:', documentId, e?.message ?? e);
    text = '';
  }
  if (text.length > EXTRACTED_TEXT_MAX_CHARS) {
    text = text.slice(0, EXTRACTED_TEXT_MAX_CHARS);
    truncated = true;
    console.log('[esign-extract] teks dipotong ke 100.000 karakter:', documentId);
  }
  await prisma.esignDocument.update({
    where: { id: documentId },
    data: { extractedText: text },
  });
  return { text, truncated };
}
