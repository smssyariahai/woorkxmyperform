import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { esignAudit } from '@/lib/esign/audit';
import { publishEsignEvent } from '@/lib/esign/realtime';
import { notifyEsignEvent } from '@/lib/esign/notify';

export const dynamic = 'force-dynamic';

const approveSchema = z.object({
  approved: z.boolean(),
  reason: z.string().max(500).optional().nullable(),
});

/**
 * POST /api/esign/documents/[id]/approve — persetujuan sebelum tanda tangan.
 * Hanya pemberi persetujuan yang ditunjuk (approverId) dengan ESIGN_APPROVE.
 * APPROVED → PENDING_SIGNATURE; REJECTED → REJECTED.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ESIGN_APPROVE');
    const doc = await prisma.esignDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, title: true, documentNumber: true, status: true, approverId: true },
    });
    if (!doc) return apiErr('Dokumen tidak ditemukan.', 404);
    if (doc.status !== 'PENDING_APPROVAL') {
      return apiErr('Dokumen tidak sedang menunggu persetujuan.', 409);
    }
    if (!doc.approverId || doc.approverId !== ctx.userId) {
      return apiErr('Anda bukan pemberi persetujuan yang ditunjuk untuk dokumen ini.', 403);
    }

    const parsed = approveSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const { approved, reason } = parsed.data;

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.esignDocument.update({
        where: { id: doc.id },
        data: {
          approvalStatus: approved ? 'APPROVED' : 'REJECTED',
          status: approved ? 'PENDING_SIGNATURE' : 'REJECTED',
        },
      });
      return updated;
    });

    await esignAudit({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      userId: ctx.userId,
      action: approved ? 'APPROVE_ESIGN_DOCUMENT' : 'REJECT_ESIGN_APPROVAL',
      description: approved
        ? `${ctx.name} menyetujui dokumen "${doc.title}" (${doc.documentNumber}) — lanjut ke tahap tanda tangan`
        : `${ctx.name} menolak persetujuan dokumen "${doc.title}" (${doc.documentNumber})${reason ? ` — alasan: ${reason}` : ''}`,
      metadata: { approved, reason: reason ?? null },
      req,
    });

    // Realtime (best-effort, Fase 8). Penolakan approval tidak punya event
    // tersendiri di daftar esign:* — tidak dipublish.
    if (approved) {
      publishEsignEvent(ctx.organizationId, 'esign:approval:completed', {
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        status: 'PENDING_SIGNATURE',
      });
    }

    // Notifikasi WA (best-effort, Fase 7). Disetujui: beri tahu pembuat
    // lalu kirim 'sent' ke penandatangan yang gilirannya tiba. Ditolak:
    // beri tahu pembuat sebagai penolakan (dengan alasan).
    if (approved) {
      void notifyEsignEvent({
        documentId: doc.id,
        eventType: 'approval_completed',
        actorName: ctx.name,
      }).catch((e) => console.error('[esign-notify] approval_completed gagal:', (e as Error).message));
      void notifyEsignEvent({ documentId: doc.id, eventType: 'sent' }).catch((e) =>
        console.error('[esign-notify] sent gagal:', (e as Error).message)
      );
    } else {
      void notifyEsignEvent({
        documentId: doc.id,
        eventType: 'rejected',
        actorName: ctx.name,
        reason: reason ?? null,
      }).catch((e) => console.error('[esign-notify] rejected gagal:', (e as Error).message));
    }

    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memproses persetujuan.', 500);
  }
}
