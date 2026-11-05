import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { esignAudit } from '@/lib/esign/audit';
import { publishEsignEvent } from '@/lib/esign/realtime';
import { notifyEsignEvent } from '@/lib/esign/notify';

export const dynamic = 'force-dynamic';

/**
 * POST /api/esign/documents/[id]/cancel — batalkan dokumen.
 * Hanya bila status belum COMPLETED/CANCELLED. Token akses semua
 * penandatangan dicabut agar tautan sign tidak bisa dipakai lagi.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ESIGN_MANAGE');
    const doc = await prisma.esignDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, title: true, documentNumber: true, status: true },
    });
    if (!doc) return apiErr('Dokumen tidak ditemukan.', 404);
    if (doc.status === 'COMPLETED' || doc.status === 'CANCELLED') {
      return apiErr(`Dokumen dengan status ${doc.status} tidak dapat dibatalkan.`, 409);
    }

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.esignDocument.update({
        where: { id: doc.id },
        data: { status: 'CANCELLED' },
      });
      await tx.esignSigner.updateMany({
        where: { documentId: doc.id },
        data: { accessToken: null, tokenExpiresAt: null },
      });
      return updated;
    });

    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      userId: ctx.userId,
      action: 'CANCEL_ESIGN_DOCUMENT',
      description: `${ctx.name} membatalkan dokumen "${doc.title}" (${doc.documentNumber})`,
      metadata: { fromStatus: doc.status },
    });

    // Realtime (best-effort, Fase 8).
    publishEsignEvent(ctx.organizationId, 'esign:document:cancelled', {
      documentId: doc.id,
      documentNumber: doc.documentNumber,
      status: 'CANCELLED',
    });

    // Notifikasi WA ke penandatangan yang masih PENDING (best-effort, Fase 7).
    void notifyEsignEvent({ documentId: doc.id, eventType: 'cancelled' }).catch((e) =>
      console.error('[esign-notify] cancelled gagal:', (e as Error).message)
    );

    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membatalkan dokumen.', 500);
  }
}
