import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { esignAudit } from '@/lib/esign/audit';
import { isTokenValid } from '@/lib/esign/tokens';
import { isSignerTurn } from '@/lib/esign/workflow';
import { publishEsignEvent } from '@/lib/esign/realtime';
import { notifyEsignEvent } from '@/lib/esign/notify';

export const dynamic = 'force-dynamic';

const rejectSchema = z.object({
  token: z.string().min(1, 'Token akses wajib diisi'),
  reason: z.string().min(1, 'Alasan penolakan wajib diisi').max(500),
});

const SIGNABLE = ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'];

/**
 * POST /api/esign/documents/[id]/reject — penandatangan menolak dokumen.
 * Alasan wajib. Dokumen langsung REJECTED dan semua token akses dicabut.
 * Otorisasi memakai organisasi PEMILIK DOKUMEN (lihat route sign): token
 * dimuat dulu, baru permission dicek di org dokumen — bukan org aktif sesi.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    // 1. Validasi body dulu — token dibutuhkan untuk memuat signer.
    const parsed = rejectSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const { token, reason } = parsed.data;

    // 2. Muat signer berdasarkan token. 404 generik HANYA bila token
    //    memang tidak dikenal.
    const signer = await prisma.esignSigner.findFirst({
      where: { documentId: params.id, accessToken: token },
      include: {
        document: {
          select: {
            id: true, organizationId: true, title: true, documentNumber: true,
            status: true, workflowType: true, originalHash: true,
          },
        },
      },
    });
    if (!signer || !signer.document) return apiErr('Tautan tidak valid.', 404);
    const doc = signer.document;

    // 3. Otorisasi terhadap organisasi pemilik dokumen (bukan org aktif
    //    sesi). Bukan anggota aktif / tanpa ESIGN_SIGN di sana → 403 jelas.
    const ctx = await requirePermission('ESIGN_SIGN', req, { organizationId: doc.organizationId });

    if (signer.userId !== ctx.userId) {
      return apiErr('Tautan ini ditujukan untuk penandatangan lain, bukan akun Anda.', 403);
    }
    if (!isTokenValid(signer.tokenExpiresAt)) {
      return apiErr('Tautan sudah kedaluwarsa.', 410);
    }
    if (!SIGNABLE.includes(doc.status)) {
      return apiErr(`Dokumen tidak dalam tahap penandatanganan (status: ${doc.status}).`, 409);
    }
    if (signer.signingStatus !== 'PENDING') {
      return apiErr('Anda sudah menyelesaikan/menolak dokumen ini.', 409);
    }
    const allSigners = await prisma.esignSigner.findMany({
      where: { documentId: doc.id },
      select: { signingOrder: true, signingStatus: true },
    });
    if (!isSignerTurn(doc.workflowType, signer, allSigners)) {
      return apiErr('Belum giliran Anda memproses dokumen ini.', 409);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.esignSigner.update({
        where: { id: signer.id },
        data: { signingStatus: 'REJECTED', rejectedReason: reason.trim() },
      });
      const docUpdated = await tx.esignDocument.update({
        where: { id: doc.id },
        data: { status: 'REJECTED' },
      });
      await tx.esignSigner.updateMany({
        where: { documentId: doc.id },
        data: { accessToken: null, tokenExpiresAt: null },
      });
      return docUpdated;
    });

    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      userId: ctx.userId,
      action: 'REJECT_ESIGN_DOCUMENT',
      description: `${signer.signerName} menolak dokumen "${doc.title}" (${doc.documentNumber}) — alasan: ${reason.trim()}`,
      metadata: { signerId: signer.id, signerName: signer.signerName, reason: reason.trim() },
      documentHash: doc.originalHash,
      req,
    });

    // Realtime (best-effort, Fase 8).
    publishEsignEvent(ctx.organizationId, 'esign:signature:rejected', {
      documentId: doc.id,
      documentNumber: doc.documentNumber,
      status: 'REJECTED',
      signerId: signer.id,
      signerName: signer.signerName,
    });

    // Notifikasi WA ke pembuat (best-effort, Fase 7).
    void notifyEsignEvent({
      documentId: doc.id,
      eventType: 'rejected',
      actorSignerId: signer.id,
      reason: reason.trim(),
    }).catch((e) => console.error('[esign-notify] rejected gagal:', (e as Error).message));

    return apiOk({ documentStatus: updated.status });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memproses penolakan.', 500);
  }
}
