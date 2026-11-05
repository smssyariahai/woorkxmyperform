import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { esignPinSchema } from '@/lib/validation';
import { hashPin, verifyPin, isPinLocked } from '@/lib/esign/pin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/esign/profile/pin — set PIN baru (bila belum ada) atau ubah PIN
 * (wajib verifikasi PIN lama dulu). Format mengikuti esignPinSchema: 4–12 digit.
 * PIN hanya disimpan sebagai hash bcrypt; hash tidak pernah dikembalikan.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const parsed = esignPinSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return apiErr(first?.message ?? 'PIN tidak valid.', 422);
    }
    const { pin, currentPin } = parsed.data;

    const profile = await prisma.esignProfile.findUnique({
      where: { userId: ctx.userId },
      select: { id: true, pinHash: true },
    });

    if (profile?.pinHash) {
      // Ubah PIN: PIN lama wajib dan harus benar.
      if (!currentPin) {
        return apiErr('Masukkan PIN saat ini untuk mengubah PIN.', 422);
      }
      const lock = isPinLocked(ctx.userId);
      if (lock.locked) {
        return apiErr(
          `PIN terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil((lock.retryAfterSec ?? 60) / 60)} menit.`,
          429
        );
      }
      const v = await verifyPin(ctx.userId, currentPin);
      if (v.locked) {
        return apiErr(
          `PIN terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil((v.retryAfterSec ?? 60) / 60)} menit.`,
          429
        );
      }
      if (!v.ok) {
        return apiErr('PIN saat ini salah.', 401);
      }
    }

    const pinHash = await hashPin(pin);
    await prisma.esignProfile.upsert({
      where: { userId: ctx.userId },
      update: { pinHash, pinUpdatedAt: new Date() },
      create: { userId: ctx.userId, pinHash, pinUpdatedAt: new Date() },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: profile?.pinHash ? 'UPDATE_ESIGN_PIN' : 'SET_ESIGN_PIN',
      module: 'ESIGN',
      description: `${ctx.name} ${profile?.pinHash ? 'mengubah' : 'mengatur'} PIN tanda tangan E-Sign.`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ pinSet: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan PIN.', 500);
  }
}
