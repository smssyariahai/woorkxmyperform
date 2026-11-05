import { prisma } from '@/lib/db';
import { requirePermission, getAuthContext } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { isTokenValid } from '@/lib/esign/tokens';
import { sha256File } from '@/lib/esign/hash';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

/** Basename aman dari path yang tersimpan di DB (anti traversal). */
function safeName(p: string): string {
  return p.split('/').pop()!.split('\\').pop()!;
}

async function checkFile(subdir: string, fileName: string | null | undefined, storedHash: string | null | undefined) {
  if (!fileName || !storedHash) return { present: false, valid: false, storedHash: storedHash ?? null, actualHash: null as string | null };
  const full = join(process.cwd(), 'uploads', 'esign', subdir, safeName(fileName));
  if (!existsSync(full)) return { present: false, valid: false, storedHash, actualHash: null as string | null };
  const actualHash = await sha256File(full);
  return { present: true, valid: actualHash === storedHash, storedHash, actualHash };
}

/**
 * GET /api/esign/documents/[id]/verify — verifikasi integritas dokumen.
 * Hitung ulang SHA-256 file asli vs originalHash dan file final vs finalHash.
 * Izin: (1) login + ESIGN_VIEW di org pemilik dokumen, ATAU (2) ?token= signer valid.
 * File belum ada → present: false (bukan crash).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token') ?? '';

    let doc: Awaited<ReturnType<typeof prisma.esignDocument.findFirst>> = null;

    const ctx = await getAuthContext();
    if (ctx) {
      try {
        await requirePermission('ESIGN_VIEW');
        doc = await prisma.esignDocument.findFirst({
          where: { id: params.id, organizationId: ctx.organizationId },
        });
      } catch {
        doc = null;
      }
    }

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

    const original = await checkFile('originals', doc.originalFilePath, doc.originalHash);
    const final = await checkFile('final', doc.finalFilePath, doc.finalHash);

    return apiOk({
      documentId: doc.id,
      documentNumber: doc.documentNumber,
      status: doc.status,
      original,
      final,
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memverifikasi dokumen.', 500);
  }
}
