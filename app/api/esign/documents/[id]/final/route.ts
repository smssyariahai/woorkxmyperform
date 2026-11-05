import { prisma } from '@/lib/db';
import { requirePermission, getAuthContext } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';
import { isTokenValid } from '@/lib/esign/tokens';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/esign/documents/[id]/final — unduh PDF final secara privat.
 * Izin: (1) user login dengan ESIGN_VIEW di org pemilik dokumen, ATAU
 * (2) query ?token=<accessToken signer> yang masih berlaku.
 * File tidak pernah diserve via URL publik langsung.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token') ?? '';

    let doc: Awaited<ReturnType<typeof prisma.esignDocument.findFirst>> = null;

    // Jalur 1: user login dengan ESIGN_VIEW.
    const ctx = await getAuthContext();
    if (ctx) {
      try {
        await requirePermission('ESIGN_VIEW');
        doc = await prisma.esignDocument.findFirst({
          where: { id: params.id, organizationId: ctx.organizationId },
        });
      } catch {
        doc = null; // tanpa permission → coba jalur token
      }
    }

    // Jalur 2: token signer yang valid.
    if (!doc && token) {
      const signer = await prisma.esignSigner.findFirst({
        where: { documentId: params.id, accessToken: token },
        select: { documentId: true, tokenExpiresAt: true },
      });
      if (signer && isTokenValid(signer.tokenExpiresAt)) {
        doc = await prisma.esignDocument.findFirst({ where: { id: params.id } });
      }
    }

    if (!doc) return apiErr('Tidak ada akses ke dokumen ini.', 401);
    if (!doc.finalFilePath) return apiErr('Dokumen final belum tersedia. Dokumen belum selesai ditandatangani.', 404);
    const safe = doc.finalFilePath.split('/').pop()!.split('\\').pop()!;
    const full = join(process.cwd(), 'uploads', 'esign', 'final', safe);
    if (!existsSync(full)) return apiErr('File PDF final tidak ditemukan.', 404);
    const buf = await readFile(full);
    const fileName = `${doc.documentNumber.replace(/[^a-zA-Z0-9._-]/g, '_')}-final.pdf`;
    return new Response(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat PDF final.', 500);
  }
}
