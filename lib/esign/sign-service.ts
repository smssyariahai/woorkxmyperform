import { prisma, legacyPrisma } from '@/lib/db';
import { esignAudit } from '@/lib/esign/audit';
import { verifyPin } from '@/lib/esign/pin';
import { isSignerTurn, statusAfterSign } from '@/lib/esign/workflow';
import { sha256 } from '@/lib/esign/hash';
import { finalizeDocument } from '@/lib/esign/pdf';
import { publishEsignEvent } from '@/lib/esign/realtime';
import { notifyEsignEvent } from '@/lib/esign/notify';
import { checkRateLimit } from '@/lib/esign/rate-limit';
import { ESIGN_APP_URL } from '@/lib/esign/links';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Inti penandatanganan E-Sign yang dipakai BERSAMA oleh:
 * - POST /api/esign/documents/[id]/sign (web, via tautan token)
 * - Tanda tangan via WhatsApp AI-Agent (lib/esign/wa-sign.ts)
 *
 * Diekstrak dari route web tanpa mengubah urutan cek maupun pesan error:
 * rate limit → tahap dokumen → kedaluwarsa → status signer → giliran →
 * PIN (lockout bersama) → gambar tanda tangan → transaksi → audit →
 * auto-finalize → realtime → notifikasi.
 *
 * Otorisasi (permission di organisasi pemilik dokumen) BUKAN bagian
 * service ini — pemanggil melakukannya dulu (route web: requirePermission
 * sesi; bot WA: requirePermissionForUser). Service hanya memastikan
 * signer yang diminta memang milik userId yang diberikan.
 */

export class SignError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SignError';
    this.status = status;
  }
}

const MAX_BYTES = 1 * 1024 * 1024; // 1 MB
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Path absolut file tanda tangan tersimpan dari nilai signaturePath di DB.
 * Dipakai juga oleh gate WhatsApp (wa-sign.ts) supaya file yang tercatat
 * di DB tapi sudah tidak ada di disk terdeteksi SEBELUM user diminta PIN.
 */
export function savedSignaturePath(signaturePath: string): string {
  const safe = signaturePath.split('/').pop()!.split('\\').pop()!;
  return join(process.cwd(), 'uploads', 'esign', 'signatures', safe);
}

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

const SIGNABLE = ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'];

export interface ExecuteSignInput {
  documentId: string;
  signerId: string;
  userId: string;
  organizationId: string;
  pin: string;
  /** Data URL PNG dari canvas web; kosong = pakai tanda tangan tersimpan. */
  signatureImage?: string | null;
  ipAddress?: string;
  deviceInfo?: string;
}

export interface ExecuteSignResult {
  documentStatus: string;
  remainingPending: number;
  signerId: string;
  finalized: boolean;
  finalizeError?: string;
}

export async function executeSign(input: ExecuteSignInput): Promise<ExecuteSignResult> {
  const { documentId, signerId, userId, organizationId, pin, signatureImage } = input;
  let storedPath: string | null = null;
  try {
    const signer = await prisma.esignSigner.findFirst({
      where: { id: signerId, documentId },
      include: {
        document: {
          select: {
            id: true, organizationId: true, title: true, documentNumber: true,
            status: true, workflowType: true, expiresAt: true, originalHash: true,
          },
        },
      },
    });
    if (!signer || !signer.document) throw new SignError('Tautan tanda tangan tidak valid.', 404);
    const doc = signer.document;
    if (signer.userId !== userId) {
      throw new SignError('Tautan ini ditujukan untuk penandatangan lain, bukan akun Anda.', 403);
    }
    if (doc.organizationId !== organizationId) {
      throw new SignError('Dokumen ini bukan milik kantor yang dimaksud.', 403);
    }

    // Batas percobaan sign per user — pertahanan lapis kedua di atas lockout
    // PIN (5 gagal/15 mnt). Pemakaian normal: 1x kirim per dokumen.
    const signRl = checkRateLimit(`esign:sign-user:${userId}`, 20, 60_000);
    if (!signRl.allowed) {
      throw new SignError('Terlalu banyak percobaan tanda tangan. Coba lagi dalam satu menit.', 429);
    }

    if (!SIGNABLE.includes(doc.status)) {
      throw new SignError(`Dokumen tidak dalam tahap penandatanganan (status: ${doc.status}).`, 409);
    }
    if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) {
      throw new SignError('Dokumen sudah melewati tanggal kedaluwarsa.', 409);
    }
    if (signer.signingStatus !== 'PENDING') {
      throw new SignError(
        signer.signingStatus === 'SIGNED'
          ? 'Anda sudah menandatangani dokumen ini.'
          : 'Anda sudah menolak dokumen ini.',
        409
      );
    }
    const allSigners = await prisma.esignSigner.findMany({
      where: { documentId: doc.id },
      select: { signingOrder: true, signingGroup: true, signingStatus: true },
    });
    if (!isSignerTurn(doc.workflowType, signer, allSigners)) {
      throw new SignError(
        'Belum giliran Anda menandatangani dokumen ini. Penandatangan sebelumnya belum selesai.',
        409
      );
    }

    const pinRes = await verifyPin(userId, pin);
    if (pinRes.locked) {
      throw new SignError(
        `PIN terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${pinRes.retryAfterSec ?? 60} detik.`,
        429
      );
    }
    if (!pinRes.ok) {
      throw new SignError('PIN salah. Periksa kembali PIN tanda tangan Anda.', 401);
    }

    // Ambil gambar tanda tangan: dari canvas yang dikirim, atau profil tersimpan.
    let buf: Buffer;
    let method: string;
    if (signatureImage) {
      const m = signatureImage.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
      if (!m) throw new SignError('Format gambar tanda tangan harus PNG (data URL base64).', 422);
      buf = Buffer.from(m[1], 'base64');
      if (buf.length === 0 || buf.length > MAX_BYTES) {
        throw new SignError('Ukuran gambar tanda tangan maksimal 1 MB.', 422);
      }
      if (!isPng(buf)) throw new SignError('File bukan gambar PNG yang valid.', 422);
      method = 'CANVAS';
    } else {
      // EsignProfile adalah model platform global (hanya ada di
      // woork_saas) — baca lewat legacyPrisma, bukan proxy tenant.
      const profile = await legacyPrisma.esignProfile.findUnique({
        where: { userId },
        select: { signaturePath: true },
      });
      if (!profile?.signaturePath) {
        throw new SignError(
          'Anda belum memiliki tanda tangan tersimpan. Gambar tanda tangan Anda di bawah ini atau simpan di Pengaturan E-Sign.',
          422
        );
      }
      const full = savedSignaturePath(profile.signaturePath);
      if (!existsSync(full))
        throw new SignError(
          `File tanda tangan Anda yang tersimpan tidak ditemukan di server. Silakan simpan ulang tanda tangan Anda di Pengaturan E-Sign (${ESIGN_APP_URL}/esign/settings).`,
          404
        );
      buf = await readFile(full);
      method = 'UPLOADED';
    }

    // Salin gambar per-dokumen (profil boleh berubah belakangan).
    const dir = join(process.cwd(), 'uploads', 'esign', 'signatures');
    await mkdir(dir, { recursive: true });
    storedPath = `${doc.id}-${signer.id}.png`;
    await writeFile(join(dir, storedPath), buf);
    const signatureHash = sha256(buf);

    const result = await prisma.$transaction(async (tx) => {
      await tx.esignSignature.create({
        data: {
          documentId: doc.id,
          signerId: signer.id,
          signatureAsset: storedPath!,
          signatureMethod: method,
          signatureHash,
          confirmationTimestamp: new Date(),
          ipAddress: input.ipAddress,
          deviceInfo: input.deviceInfo,
        },
      });
      await tx.esignSigner.update({
        where: { id: signer.id },
        data: { signingStatus: 'SIGNED', signedAt: new Date() },
      });
      const fresh = await tx.esignSigner.findMany({
        where: { documentId: doc.id },
        select: { signingStatus: true },
      });
      const remaining = fresh.filter((s) => s.signingStatus === 'PENDING').length;
      const nextStatus = statusAfterSign(remaining);
      const updated = await tx.esignDocument.update({
        where: { id: doc.id },
        data: { status: nextStatus, currentStep: signer.signingGroup },
      });
      return { updated, remaining };
    });

    await esignAudit({
      organizationId,
      documentId: doc.id,
      userId,
      action: 'SIGN_ESIGN_DOCUMENT',
      description: `${signer.signerName} menandatangani dokumen "${doc.title}" (${doc.documentNumber}) — status dokumen: ${result.updated.status}`,
      metadata: {
        signerId: signer.id,
        signerName: signer.signerName,
        signatureMethod: method,
        signatureHash,
        documentStatus: result.updated.status,
      },
      documentHash: doc.originalHash,
    });

    // Bila semua signer selesai, buat PDF final otomatis. Kegagalan
    // finalisasi TIDAK menggagalkan tanda tangan yang sudah tersimpan —
    // dokumen tetap SIGNED dan finalisasi bisa diulang via POST /finalize.
    let finalized = false;
    let finalizeError: string | undefined;
    let finalStatus = result.updated.status;
    if (result.updated.status === 'SIGNED') {
      try {
        await finalizeDocument(doc.id, { userId });
        finalized = true;
        finalStatus = 'COMPLETED';
      } catch (e: any) {
        finalizeError = e?.message ?? 'Gagal membuat PDF final.';
        console.error('[esign-sign] finalisasi otomatis gagal:', finalizeError);
      }
    }

    // Realtime (best-effort, Fase 8) — setelah finalisasi (bila terjadi)
    // agar status di payload sudah final.
    publishEsignEvent(organizationId, 'esign:signature:completed', {
      documentId: doc.id,
      documentNumber: doc.documentNumber,
      status: finalStatus,
      signerId: signer.id,
      signerName: signer.signerName,
    });
    if (finalStatus === 'PARTIALLY_SIGNED') {
      publishEsignEvent(organizationId, 'esign:document:partially_signed', {
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        status: 'PARTIALLY_SIGNED',
        signerId: signer.id,
        signerName: signer.signerName,
      });
    }
    if (finalStatus === 'COMPLETED') {
      publishEsignEvent(organizationId, 'esign:document:completed', {
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        status: 'COMPLETED',
        signerId: signer.id,
        signerName: signer.signerName,
      });
    }

    // Notifikasi WA (best-effort, Fase 7) — kegagalan kirim tidak
    // menggagalkan tanda tangan yang sudah tersimpan.
    void (async () => {
      try {
        if (finalStatus === 'COMPLETED') {
          await notifyEsignEvent({
            documentId: doc.id,
            eventType: 'completed',
            actorSignerId: signer.id,
          });
        } else {
          await notifyEsignEvent({
            documentId: doc.id,
            eventType: 'signed',
            actorSignerId: signer.id,
            partial: finalStatus === 'PARTIALLY_SIGNED',
          });
          // Sequential: giliran berpindah — beri tahu penandatangan
          // berikutnya yang kini tiba gilirannya.
          if (doc.workflowType === 'SEQUENTIAL') {
            await notifyEsignEvent({ documentId: doc.id, eventType: 'sent' });
          }
        }
      } catch (e) {
        console.error('[esign-notify] sign gagal:', (e as Error).message);
      }
    })();

    return {
      documentStatus: finalStatus,
      remainingPending: result.remaining,
      signerId: signer.id,
      finalized,
      ...(finalizeError ? { finalizeError } : {}),
    };
  } catch (e: any) {
    // Bila transaksi gagal setelah file disalin, hapus salinan yatim.
    if (storedPath) {
      await unlink(join(process.cwd(), 'uploads', 'esign', 'signatures', storedPath)).catch(() => {});
    }
    throw e;
  }
}
