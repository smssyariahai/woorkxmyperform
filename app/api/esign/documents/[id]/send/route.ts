import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { esignAudit } from '@/lib/esign/audit';
import { publishEsignEvent } from '@/lib/esign/realtime';
import { notifyEsignEvent } from '@/lib/esign/notify';

export const dynamic = 'force-dynamic';

/**
 * POST /api/esign/documents/[id]/send — kirim dokumen untuk ditandatangani.
 * Syarat: DRAFT, file PDF sudah diunggah, minimal 1 penandatangan.
 * Bila approvalStatus = PENDING → PENDING_APPROVAL (harus ada approverId);
 * bila tidak butuh approval / sudah APPROVED → PENDING_SIGNATURE.
 * Bila langsung PENDING_SIGNATURE, penandatangan yang gilirannya tiba
 * diberitahu via WhatsApp (best-effort, Fase 7).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ESIGN_MANAGE');
    const doc = await prisma.esignDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { signers: { orderBy: { signingOrder: 'asc' } } },
    });
    if (!doc) return apiErr('Dokumen tidak ditemukan.', 404);
    if (doc.status !== 'DRAFT') {
      return apiErr('Dokumen hanya dapat dikirim saat masih DRAFT.', 409);
    }
    if (!doc.originalFilePath) {
      return apiErr('Unggah file PDF terlebih dahulu sebelum mengirim dokumen.', 422);
    }
    if (!doc.signers.length) {
      return apiErr('Tambahkan minimal satu penandatangan sebelum mengirim dokumen.', 422);
    }

    let nextStatus: string;
    if (doc.approvalStatus === 'PENDING') {
      if (!doc.approverId) {
        return apiErr('Tentukan pemberi persetujuan terlebih dahulu (field approver).', 422);
      }
      nextStatus = 'PENDING_APPROVAL';
    } else {
      nextStatus = 'PENDING_SIGNATURE';
    }

    const warnings = doc.signers
      .filter((s) => s.placementPage == null)
      .map((s) => ({
        signerId: s.id,
        signerName: s.signerName,
        message: 'Belum ada posisi tanda tangan di PDF (akan ditempatkan otomatis saat finalisasi).',
      }));

    const item = await prisma.esignDocument.update({
      where: { id: doc.id },
      data: { status: nextStatus },
    });

    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      userId: ctx.userId,
      action: 'SEND_ESIGN_DOCUMENT',
      description: `${ctx.name} mengirim dokumen "${doc.title}" (${doc.documentNumber}) untuk ditandatangani — status ${nextStatus}, ${doc.signers.length} penandatangan`,
      metadata: { status: nextStatus, signerCount: doc.signers.length, warnings: warnings.length },
    });

    // Realtime (best-effort, Fase 8).
    publishEsignEvent(ctx.organizationId, 'esign:document:sent', {
      documentId: doc.id,
      documentNumber: doc.documentNumber,
      status: nextStatus,
    });

    // Notifikasi WA (best-effort, Fase 7) — hanya bila dokumen langsung
    // masuk tahap tanda tangan. Bila masih PENDING_APPROVAL, penandatangan
    // baru diberitahu setelah persetujuan (di endpoint approve).
    if (nextStatus === 'PENDING_SIGNATURE') {
      void notifyEsignEvent({ documentId: doc.id, eventType: 'sent' }).catch((e) =>
        console.error('[esign-notify] sent gagal:', (e as Error).message)
      );
    }

    return apiOk({ item, warnings });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim dokumen.', 500);
  }
}
