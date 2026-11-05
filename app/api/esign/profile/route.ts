import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/esign/profile — profil E-Sign milik user yang login.
 * Mengembalikan status tanda tangan + PIN saja; pinHash TIDAK PERNAH dikembalikan.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const profile = await prisma.esignProfile.findUnique({
      where: { userId: ctx.userId },
      select: { signaturePath: true, signatureHash: true, pinHash: true, pinUpdatedAt: true },
    });
    return apiOk({
      userId: ctx.userId,
      hasSignature: Boolean(profile?.signaturePath),
      signatureHash: profile?.signatureHash ?? null,
      pinSet: Boolean(profile?.pinHash),
      pinUpdatedAt: profile?.pinUpdatedAt ?? null,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat profil E-Sign.', 500);
  }
}
