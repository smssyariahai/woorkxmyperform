import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { prisma } from '@/lib/db';
import { sha256 } from '@/lib/esign/hash';
import { esignAudit } from '@/lib/esign/audit';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const FINAL_DIR = 'final';
const SIGNATURES_DIR = 'signatures';

/** Ambil basename aman dari path yang tersimpan di DB (anti traversal). */
function safeName(p: string): string {
  return p.split('/').pop()!.split('\\').pop()!;
}

/** Format tanggal ke WIB, mis. "05 Nov 2026, 17.30". */
function formatWib(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Buang karakter yang tidak bisa di-encode font standar PDF (WinAnsi). */
function sanitizeText(s: string): string {
  return s.replace(/[^\x20-\xFF]/g, '?');
}

/** Potong teks dengan ellipsis agar muat dalam lebar tertentu. */
function fitText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const t = sanitizeText(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  let out = t;
  while (out.length > 1 && font.widthOfTextAtSize(out + '…', size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

interface TextLine {
  text: string;
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
}

/** Gambar blok teks bertumpuk ke bawah dari tepi atas yang diberikan. */
function drawTextBlock(page: PDFPage, lines: TextLine[], x: number, topEdge: number): void {
  let cy = topEdge;
  for (const line of lines) {
    cy -= line.size + 2;
    page.drawText(line.text, { x, y: cy, size: line.size, font: line.font, color: line.color });
  }
}

export interface PlacedSigner {
  signerId: string;
  signerName: string;
  page: number;
  usedFallback: boolean;
}

export interface FinalizeResult {
  documentId: string;
  documentNumber: string;
  status: string;
  finalFilePath: string;
  finalHash: string;
  completedAt: Date;
  placed: PlacedSigner[];
}

/**
 * Buat PDF final: muat PDF asli, tempel gambar tanda tangan tiap signer
 * yang SIGNED pada koordinat tersimpan + teks nama/jabatan/tanggal/nomor
 * referensi, lalu simpan sebagai file terpisah. File asli TIDAK PERNAH diubah.
 *
 * Konversi koordinat: viewer menyimpan fraksi top-left (x_frac, y_frac dari
 * ATAS, width_frac, height_frac) → PDF memakai points bottom-left:
 *   x = x_frac * pageWidth
 *   y = (1 - y_frac - height_frac) * pageHeight
 * Signer tanpa placement memakai fallback deterministik di halaman terakhir.
 *
 * Hanya boleh dipanggil saat status dokumen SIGNED — atau COMPLETED untuk
 * regenerasi (render ulang dengan rendering + setting terbaru; file asli
 * tetap tidak disentuh). Bila gagal di tengah jalan, dokumen tetap pada
 * status sebelumnya (finalisasi bisa diulang).
 */
export async function finalizeDocument(
  documentId: string,
  opts?: { userId?: string | null; req?: Request }
): Promise<FinalizeResult> {
  const doc = await prisma.esignDocument.findUnique({
    where: { id: documentId },
    include: {
      signers: {
        where: { signingStatus: 'SIGNED' },
        orderBy: { signingOrder: 'asc' },
        include: { signatures: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
    },
  });
  if (!doc) throw new Error('Dokumen tidak ditemukan.');
  // SIGNED = finalisasi pertama; COMPLETED = regenerasi (render ulang).
  const isRegen = doc.status === 'COMPLETED';
  if (doc.status !== 'SIGNED' && !isRegen) {
    throw new Error(`Dokumen tidak dalam status SIGNED/COMPLETED (status saat ini: ${doc.status}).`);
  }
  if (!doc.originalFilePath) throw new Error('Dokumen belum memiliki file PDF asli.');
  const origFull = join(process.cwd(), 'uploads', 'esign', 'originals', safeName(doc.originalFilePath));
  if (!existsSync(origFull)) throw new Error('File PDF asli tidak ditemukan di server.');
  if (!doc.signers.length) throw new Error('Dokumen tidak memiliki penandatangan yang sudah selesai.');

  const origBytes = await readFile(origFull);
  const pdfDoc = await PDFDocument.load(origBytes as unknown as Uint8Array);
  const pages = pdfDoc.getPages();
  const pageCount = pages.length;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.12, 0.12);
  const gray = rgb(0.4, 0.4, 0.4);

  const placed: PlacedSigner[] = [];
  let fallbackIndex = 0;

  for (const signer of doc.signers) {
    const sig = signer.signatures[0];
    if (!sig) throw new Error(`Tanda tangan ${signer.signerName} tidak ditemukan di database.`);
    const sigFull = join(process.cwd(), 'uploads', 'esign', SIGNATURES_DIR, safeName(sig.signatureAsset));
    if (!existsSync(sigFull)) {
      throw new Error(`File gambar tanda tangan ${signer.signerName} tidak ditemukan di server.`);
    }
    const pngBytes = await readFile(sigFull);
    let image;
    try {
      image = await pdfDoc.embedPng(pngBytes as unknown as Uint8Array);
    } catch {
      throw new Error(`Gambar tanda tangan ${signer.signerName} bukan PNG yang valid.`);
    }

    // Tentukan posisi (fraksi top-left) — placement tersimpan atau fallback.
    let pageIdx: number;
    let fx: number;
    let fyTop: number;
    let fw: number;
    let fh: number;
    let usedFallback = false;
    if (
      signer.placementPage != null &&
      signer.placementX != null &&
      signer.placementY != null &&
      signer.placementWidth != null &&
      signer.placementHeight != null
    ) {
      pageIdx = Math.min(Math.max(signer.placementPage - 1, 0), pageCount - 1);
      fx = Math.min(Math.max(signer.placementX, 0), 1);
      fyTop = Math.min(Math.max(signer.placementY, 0), 1);
      fw = Math.min(Math.max(signer.placementWidth, 0.05), 1 - fx);
      fh = Math.min(Math.max(signer.placementHeight, 0.02), 1 - fyTop);
    } else {
      usedFallback = true;
      pageIdx = pageCount - 1;
      fx = 0.1;
      fw = 0.25;
      fh = 0.08;
      // Dari bawah: 0.15 + index*0.10 → ubah ke fraksi dari atas.
      const bottomFrac = 0.15 + fallbackIndex * 0.1;
      fyTop = Math.max(1 - bottomFrac - fh, 0);
      fallbackIndex += 1;
    }

    const page = pages[pageIdx];
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const x = fx * pageWidth;
    const y = (1 - fyTop - fh) * pageHeight;
    const w = fw * pageWidth;
    const h = fh * pageHeight;

    // Gambar tanda tangan di-fit KE DALAM kotak placement dengan rasio aspek
    // asli dipertahankan (tanpa stretch), dipusatkan dalam kotak. Batas atas
    // ukuran render 160×60 pt — kotak yang lebih besar tidak membuat gambar
    // ikut membesar. Tidak ada border/garis di sekeliling gambar.
    const MAX_IMG_W = 160;
    const MAX_IMG_H = 60;
    const scale = Math.min(w / image.width, h / image.height, MAX_IMG_W / image.width, MAX_IMG_H / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    page.drawImage(image, { x: dx, y: dy, width: dw, height: dh });

    // Teks di bawah (atau di atas bila tidak cukup ruang di bawah) gambar.
    // Lebar teks = lebar gambar yang DIGAMBAR agar tidak meluber ke blok
    // sebelah. Hanya baris yang flag tampilnya aktif yang digambar; bila
    // semuanya mati, tidak ada blok teks sama sekali.
    const maxTextWidth = dw;
    const textX = Math.min(dx, Math.max(pageWidth - maxTextWidth - 6, 6));
    const lines: TextLine[] = [];
    if (doc.showSignerName) {
      lines.push({ text: fitText(fontBold, signer.signerName, 8, maxTextWidth), font: fontBold, size: 8, color: ink });
    }
    if (doc.showSignerPosition && signer.signerPosition) {
      lines.push({ text: fitText(font, signer.signerPosition, 7.5, maxTextWidth), font, size: 7.5, color: ink });
    }
    if (doc.showSignedDate) {
      lines.push({
        text: fitText(font, formatWib(signer.signedAt ?? new Date()), 7.5, maxTextWidth),
        font,
        size: 7.5,
        color: ink,
      });
    }
    if (doc.showDocRef) {
      lines.push({
        text: fitText(font, `Ref: ${doc.documentNumber}`, 7, maxTextWidth),
        font,
        size: 7,
        color: gray,
      });
    }
    const blockHeight = lines.reduce((s, l) => s + l.size + 2, 0);
    if (lines.length) {
      if (y - blockHeight >= 4) {
        drawTextBlock(page, lines, textX, y - 4);
      } else {
        drawTextBlock(page, lines, textX, y + h + blockHeight + 4);
      }
    }

    placed.push({ signerId: signer.id, signerName: signer.signerName, page: pageIdx + 1, usedFallback });
  }

  const finalBytes = await pdfDoc.save();
  const finalFileName = `${doc.id}-final.pdf`;
  const dir = join(process.cwd(), 'uploads', 'esign', FINAL_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, finalFileName), Buffer.from(finalBytes));
  const finalHash = sha256(Buffer.from(finalBytes));
  const completedAt = new Date();
  const fallbackNames = placed.filter((p) => p.usedFallback).map((p) => p.signerName);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.esignDocument.update({
      where: { id: doc.id },
      data: {
        status: 'COMPLETED',
        finalFilePath: finalFileName,
        finalHash,
        completedAt,
      },
    });
    return u;
  });

  await esignAudit({
    organizationId: doc.organizationId,
    documentId: doc.id,
    userId: opts?.userId ?? null,
    action: 'FINALIZE_ESIGN_DOCUMENT',
    description: isRegen
      ? `PDF final dokumen "${doc.title}" (${doc.documentNumber}) dibuat ulang (regenerasi) — ${placed.length} tanda tangan ditempel, hash SHA-256 diperbarui.`
      : `PDF final dokumen "${doc.title}" (${doc.documentNumber}) dibuat — ${placed.length} tanda tangan ditempel, hash SHA-256 tersimpan.`,
    metadata: { finalHash, finalFilePath: finalFileName, signerCount: placed.length, fallbackSigners: fallbackNames, regenerated: isRegen },
    documentHash: finalHash,
    req: opts?.req,
  });

  return {
    documentId: doc.id,
    documentNumber: doc.documentNumber,
    status: updated.status,
    finalFilePath: finalFileName,
    finalHash,
    completedAt,
    placed,
  };
}
