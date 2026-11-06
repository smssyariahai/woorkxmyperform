import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { esignSignSchema } from '@/lib/validation';
import { isTokenValid } from '@/lib/esign/tokens';
import { executeSign, SignError } from '@/lib/esign/sign-service';
import { getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const signBodySchema = esignSignSchema.extend({
  token: z.string().min(1, 'Token akses wajib diisi'),
  signatureImage: z.string().max(2_000_000).optional().nullable(),
});

/**
 * POST /api/esign/documents/[id]/sign — wrapper tipis di atas
 * lib/esign/sign-service.ts (dipakai bersama jalur WhatsApp AI-Agent).
 * Cek berurutan: body → token dikenal → otorisasi terhadap organisasi
 * PEMILIK DOKUMEN (bukan organisasi aktif sesi) → akun login ==
 * penandatangan → token belum kedaluwarsa → inti sign di service
 * (tahap dokumen, giliran, PIN, gambar, transaksi, audit, finalisasi,
 * realtime, notifikasi). Pesan + status error dipertahankan identik.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
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

    if (signer.userId !== ctx.userId) {
      return apiErr('Tautan ini ditujukan untuk penandatangan lain, bukan akun Anda.', 403);
    }
    if (!isTokenValid(signer.tokenExpiresAt)) {
      return apiErr('Tautan tanda tangan sudah kedaluwarsa.', 410);
    }

    const result = await executeSign({
      documentId: doc.id,
      signerId: signer.id,
      userId: ctx.userId,
      organizationId: doc.organizationId,
      pin,
      signatureImage: signatureImage ?? null,
      ipAddress: getClientIp(req),
      deviceInfo: req.headers.get('user-agent') ?? undefined,
    });
    return apiOk(result);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof SignError) return apiErr(e.message, e.status);
    return apiErr('Gagal memproses tanda tangan.', 500);
  }
}
