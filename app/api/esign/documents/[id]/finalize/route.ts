import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { finalizeDocument } from '@/lib/esign/pdf';
import { publishEsignEvent } from '@/lib/esign/realtime';

export const dynamic = 'force-dynamic';

/**
 * POST /api/esign/documents/[id]/finalize — finalisasi manual / ulang.
 * Untuk dokumen SIGNED (finalisasi pertama) maupun COMPLETED (regenerasi:
 * render ulang PDF final dengan rendering + setting tampilan terbaru).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('ESIGN_MANAGE');
    const doc = await prisma.esignDocument.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!doc) return apiErr('Dokumen tidak ditemukan.', 404);
    if (doc.status !== 'SIGNED' && doc.status !== 'COMPLETED') {
      return apiErr(
        `Dokumen belum selesai ditandatangani (status: ${doc.status}). Finalisasi hanya untuk dokumen berstatus SIGNED/COMPLETED.`,
        409
      );
    }
    const wasCompleted = doc.status === 'COMPLETED';
    const result = await finalizeDocument(doc.id, { userId: ctx.userId, req });
    // Realtime (best-effort, Fase 8). Regenerasi juga dipublish agar klien
    // me-refresh (file final berubah, status tetap COMPLETED).
    publishEsignEvent(ctx.organizationId, 'esign:document:completed', {
      documentId: doc.id,
      documentNumber: doc.documentNumber,
      status: 'COMPLETED',
    });
    return apiOk({ alreadyCompleted: false, regenerated: wasCompleted, ...result });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(`Gagal membuat PDF final: ${e?.message ?? 'Terjadi kesalahan.'}`, 500);
  }
}
