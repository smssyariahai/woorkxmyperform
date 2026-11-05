import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { esignAudit } from '@/lib/esign/audit';
import { esignSignSchema } from '@/lib/validation';
import { isTokenValid } from '@/lib/esign/tokens';
import { verifyPin } from '@/lib/esign/pin';
import { isSignerTurn, statusAfterSign } from '@/lib/esign/workflow';
import { sha256 } from '@/lib/esign/hash';
import { finalizeDocument } from '@/lib/esign/pdf';
import { publishEsignEvent } from '@/lib/esign/realtime';
import { notifyEsignEvent } from '@/lib/esign/notify';
import { checkRateLimit } from '@/lib/esign/rate-limit';
import { getClientIp } from '@/lib/audit';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 1 * 1024 * 1024; // 1 MB
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

const signBodySchema = esignSignSchema.extend({
  token: z.string().min(1, 'Token akses wajib diisi'),
  signatureImage: z.string().max(2_000_000).optional().nullable(),
});

const SIGNABLE = ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'];

/**
 * POST /api/esign/documents/[id]/sign — inti penandatanganan.
 * Cek berurutan: token dikenal → otorisasi terhadap organisasi PEMILIK
 * DOKUMEN (bukan organisasi aktif sesi — user multi-org bisa sign dokumen
 * kantor lain selama ia anggota aktif di kantor itu) → akun login ==
 * penandatangan → token belum kedaluwarsa → dokumen dalam tahap tanda
 * tangan → giliran workflow → PIN benar → konfirmasi eksplisit.
 * Gambar tanda tangan disalin per-dokumen agar perubahan profil belakangan
 * tidak mengubah dokumen yang sudah ditandatangani.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let storedPath: string | null = null;
  try {
    // 1. Validasi body dulu — token dibutuhkan untuk memuat signer.
    const parsed = signBodySchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const { token, pin, signatureImage } = parsed.data;

    // 2. Muat signer berdasarkan token. Token adalah kredensial aksesnya;
    //    tidak bergantung pada organisasi aktif sesi login. 404 generik
    //    HANYA bila token memang tidak dikenal.
    const signer = await prisma.esignSigner.findFirst({
      where: { documentId: params.id, accessToken: token },
      include: {
        document: {
          select: {
            id: true, organizationId: true, title: true, documentNumber: true,
            status: true, workflowType: true, expiresAt: true, originalHash: true,
          },
        },
      },
    });
    if (!signer || !signer.document) return apiErr('Tautan tanda tangan tidak valid.', 404);
    const doc = signer.document;

    // 3. Otorisasi terhadap organisasi pemilik dokumen. Bila user bukan
    //    anggota aktif di sana / rolenya tanpa ESIGN_SIGN → 403 yang jelas,
    //    bukan 404 "tautan tidak valid" yang menyesatkan.
    const ctx = await requirePermission('ESIGN_SIGN', req, { organizationId: doc.organizationId });

    // Batas percobaan sign per user — pertahanan lapis kedua di atas lockout
    // PIN (5 gagal/15 mnt). Pemakaian normal: 1x kirim per dokumen.
    const signRl = checkRateLimit(`esign:sign-user:${ctx.userId}`, 20, 60_000);
    if (!signRl.allowed) {
      return apiErr('Terlalu banyak percobaan tanda tangan. Coba lagi dalam satu menit.', 429);
    }

    if (signer.userId !== ctx.userId) {
      return apiErr('Tautan ini ditujukan untuk penandatangan lain, bukan akun Anda.', 403);
    }
    if (!isTokenValid(signer.tokenExpiresAt)) {
      return apiErr('Tautan tanda tangan sudah kedaluwarsa.', 410);
    }
    if (!SIGNABLE.includes(doc.status)) {
      return apiErr(`Dokumen tidak dalam tahap penandatanganan (status: ${doc.status}).`, 409);
    }
    if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) {
      return apiErr('Dokumen sudah melewati tanggal kedaluwarsa.', 409);
    }
    if (signer.signingStatus !== 'PENDING') {
      return apiErr(
        signer.signingStatus === 'SIGNED'
          ? 'Anda sudah menandatangani dokumen ini.'
          : 'Anda sudah menolak dokumen ini.',
        409
      );
    }
    const allSigners = await prisma.esignSigner.findMany({
      where: { documentId: doc.id },
      select: { signingOrder: true, signingStatus: true },
    });
    if (!isSignerTurn(doc.workflowType, signer, allSigners)) {
      return apiErr(
        'Belum giliran Anda menandatangani dokumen ini. Penandatangan sebelumnya belum selesai.',
        409
      );
    }

    const pinRes = await verifyPin(ctx.userId, pin);
    if (pinRes.locked) {
      return apiErr(
        `PIN terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${pinRes.retryAfterSec ?? 60} detik.`,
        429
      );
    }
    if (!pinRes.ok) {
      return apiErr('PIN salah. Periksa kembali PIN tanda tangan Anda.', 401);
    }

    // Ambil gambar tanda tangan: dari canvas yang dikirim, atau profil tersimpan.
    let buf: Buffer;
    let method: string;
    if (signatureImage) {
      const m = signatureImage.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return apiErr('Format gambar tanda tangan harus PNG (data URL base64).', 422);
      buf = Buffer.from(m[1], 'base64');
      if (buf.length === 0 || buf.length > MAX_BYTES) {
        return apiErr('Ukuran gambar tanda tangan maksimal 1 MB.', 422);
      }
      if (!isPng(buf)) return apiErr('File bukan gambar PNG yang valid.', 422);
      method = 'CANVAS';
    } else {
      const profile = await prisma.esignProfile.findUnique({
        where: { userId: ctx.userId },
        select: { signaturePath: true },
      });
      if (!profile?.signaturePath) {
        return apiErr(
          'Anda belum memiliki tanda tangan tersimpan. Gambar tanda tangan Anda di bawah ini atau simpan di Pengaturan E-Sign.',
          422
        );
      }
      const safe = profile.signaturePath.split('/').pop()!.split('\\').pop()!;
      const full = join(process.cwd(), 'uploads', 'esign', 'signatures', safe);
      if (!existsSync(full)) return apiErr('File tanda tangan tersimpan tidak ditemukan.', 404);
      buf = await readFile(full);
      method = 'UPLOADED';
    }

    // Salin gambar per-dokumen (profil boleh berubah belakangan).
    const dir = join(process.cwd(), 'uploads', 'esign', 'signatures');
    await mkdir(dir, { recursive: true });
    storedPath = `${doc.id}-${signer.id}.png`;
    await writeFile(join(dir, storedPath), buf);
    const signatureHash = sha256(buf);

    const ipAddress = getClientIp(req);
    const deviceInfo = req.headers.get('user-agent') ?? undefined;

    const result = await prisma.$transaction(async (tx) => {
      await tx.esignSignature.create({
        data: {
          documentId: doc.id,
          signerId: signer.id,
          signatureAsset: storedPath!,
          signatureMethod: method,
          signatureHash,
          confirmationTimestamp: new Date(),
          ipAddress,
          deviceInfo,
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
        data: { status: nextStatus, currentStep: signer.signingOrder },
      });
      return { updated, remaining };
    });

    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      userId: ctx.userId,
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
      req,
    });

    // Bila semua signer selesai, buat PDF final otomatis. Kegagalan
    // finalisasi TIDAK menggagalkan tanda tangan yang sudah tersimpan —
    // dokumen tetap SIGNED dan finalisasi bisa diulang via POST /finalize.
    let finalized = false;
    let finalizeError: string | undefined;
    let finalStatus = result.updated.status;
    if (result.updated.status === 'SIGNED') {
      try {
        await finalizeDocument(doc.id, { userId: ctx.userId, req });
        finalized = true;
        finalStatus = 'COMPLETED';
      } catch (e: any) {
        finalizeError = e?.message ?? 'Gagal membuat PDF final.';
        console.error('[esign-sign] finalisasi otomatis gagal:', finalizeError);
      }
    }

    // Realtime (best-effort, Fase 8) — setelah finalisasi (bila terjadi)
    // agar status di payload sudah final.
    publishEsignEvent(ctx.organizationId, 'esign:signature:completed', {
      documentId: doc.id,
      documentNumber: doc.documentNumber,
      status: finalStatus,
      signerId: signer.id,
      signerName: signer.signerName,
    });
    if (finalStatus === 'PARTIALLY_SIGNED') {
      publishEsignEvent(ctx.organizationId, 'esign:document:partially_signed', {
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        status: 'PARTIALLY_SIGNED',
        signerId: signer.id,
        signerName: signer.signerName,
      });
    }
    if (finalStatus === 'COMPLETED') {
      publishEsignEvent(ctx.organizationId, 'esign:document:completed', {
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

    return apiOk({
      documentStatus: finalStatus,
      remainingPending: result.remaining,
      signerId: signer.id,
      finalized,
      ...(finalizeError ? { finalizeError } : {}),
    });
  } catch (e: any) {
    // Bila transaksi gagal setelah file disalin, hapus salinan yatim.
    if (storedPath) {
      await unlink(join(process.cwd(), 'uploads', 'esign', 'signatures', storedPath)).catch(() => {});
    }
    if (e instanceof Response) return e;
    return apiErr('Gagal memproses tanda tangan.', 500);
  }
}
