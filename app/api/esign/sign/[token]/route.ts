import { prisma } from '@/lib/db';
import { apiOk, apiErr } from '@/lib/utils';
import { isTokenValid } from '@/lib/esign/tokens';
import { esignAudit } from '@/lib/esign/audit';
import { publishEsignEvent } from '@/lib/esign/realtime';
import { checkRateLimit } from '@/lib/esign/rate-limit';
import { getClientIp } from '@/lib/audit';

/** Batas lookup token publik per IP — token UUID tak bisa ditebak, ini menahan banjir/tebakan massal. */
const LOOKUP_MAX = 30;
const LOOKUP_WINDOW_MS = 60_000;

export const dynamic = 'force-dynamic';

/** Sekali per 24 jam per signer per dokumen — agar refresh halaman tidak membanjiri event. */
const VIEW_DEDUP_MS = 24 * 60 * 60 * 1000;
const VIEWABLE = ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'];

/**
 * GET /api/esign/sign/[token] — lookup publik berdasarkan token akses signer.
 * Tidak butuh login: token itu sendiri kredensial aksesnya. Mengembalikan
 * info dokumen + penandatangan secukupnya untuk halaman sign; TIDAK
 * mengembalikan token penandatangan lain atau data sensitif.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const rl = checkRateLimit(
      `esign:sign-lookup-ip:${getClientIp(req)}`,
      LOOKUP_MAX,
      LOOKUP_WINDOW_MS
    );
    if (!rl.allowed) {
      return apiErr('Terlalu banyak percobaan. Coba lagi dalam satu menit.', 429);
    }
    const signer = await prisma.esignSigner.findFirst({
      where: { accessToken: params.token },
      include: {
        document: {
          select: {
            id: true, organizationId: true, title: true, documentNumber: true, category: true,
            status: true, expiresAt: true, workflowType: true,
            createdBy: { select: { name: true } },
            organization: { select: { name: true } },
          },
        },
        user: { select: { name: true } },
      },
    });
    if (!signer || !signer.document) {
      return apiErr('Tautan tanda tangan tidak valid atau sudah tidak berlaku.', 404);
    }
    if (!isTokenValid(signer.tokenExpiresAt)) {
      return apiErr('Tautan tanda tangan sudah kedaluwarsa.', 410);
    }
    const doc = signer.document;

    // Event "viewed" (best-effort, Fase 8): signer membuka halaman sign
    // dengan token valid. Dedup 24 jam via EsignAuditLog agar refresh /
    // pemuatan ulang PDF tidak membanjiri. Kegagalan di sini tidak boleh
    // menggagalkan lookup token.
    if (VIEWABLE.includes(doc.status) && signer.signingStatus === 'PENDING') {
      try {
        const since = new Date(Date.now() - VIEW_DEDUP_MS);
        const seen = await prisma.esignAuditLog.findFirst({
          where: {
            documentId: doc.id,
            userId: signer.userId,
            action: 'VIEW_ESIGN_DOCUMENT',
            createdAt: { gte: since },
          },
          select: { id: true },
        });
        if (!seen) {
          await esignAudit({
            organizationId: doc.organizationId,
            documentId: doc.id,
            userId: signer.userId,
            action: 'VIEW_ESIGN_DOCUMENT',
            description: `${signer.signerName} membuka dokumen "${doc.title}" (${doc.documentNumber}) melalui tautan tanda tangan`,
            metadata: { signerId: signer.id, signerName: signer.signerName },
          });
          publishEsignEvent(doc.organizationId, 'esign:document:viewed', {
            documentId: doc.id,
            documentNumber: doc.documentNumber,
            status: doc.status,
            signerId: signer.id,
            signerName: signer.signerName,
          });
        }
      } catch (e) {
        console.error('[esign-viewed] gagal mencatat:', (e as Error).message);
      }
    }

    return apiOk({
      valid: true,
      document: {
        id: doc.id,
        title: doc.title,
        documentNumber: doc.documentNumber,
        category: doc.category,
        status: doc.status,
        expiresAt: doc.expiresAt,
        workflowType: doc.workflowType,
        createdByName: doc.createdBy?.name ?? '—',
        organizationName: doc.organization?.name ?? '—',
      },
      signer: {
        id: signer.id,
        userId: signer.userId,
        name: signer.signerName,
        position: signer.signerPosition,
        department: signer.signerDepartment,
        signingOrder: signer.signingOrder,
        signingStatus: signer.signingStatus,
        signedAt: signer.signedAt,
      },
      fileUrl: `/api/esign/documents/${doc.id}/file?token=${encodeURIComponent(params.token)}`,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memeriksa tautan.', 500);
  }
}
