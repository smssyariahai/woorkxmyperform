import bcrypt from 'bcryptjs';
// EsignProfile adalah model platform global (sengaja lintas org —
// signature + PIN milik user, bukan milik tenant) dan TIDAK ADA di
// skema tenant: query ke sini harus lewat legacyPrisma.
import { legacyPrisma as prisma } from '@/lib/db';
import { checkRateLimit, peekCount, peekRateLimit, resetRateLimit } from './rate-limit';

/**
 * PIN tanda tangan E-Sign.
 * - Format mengikuti esignPinSchema (lib/validation.ts): 4–12 digit angka.
 * - Disimpan HANYA sebagai hash bcrypt — tidak pernah plaintext.
 * - Setelah 5 kegagalan berurutan, terkunci 15 menit (per user).
 */

export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;

const failKey = (userId: string) => `esign:pin-fail:${userId}`;

/** Hash PIN baru (bcrypt, 12 rounds — sama seperti hashPassword). */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12);
}

/** Apakah PIN user sedang terkunci (tanpa menambah hitungan). */
export function isPinLocked(userId: string): { locked: boolean; retryAfterSec?: number } {
  const p = peekRateLimit(failKey(userId), PIN_MAX_FAILURES);
  if (!p.locked) return { locked: false };
  const retryAfterSec = p.resetAt ? Math.max(1, Math.ceil((p.resetAt - Date.now()) / 1000)) : undefined;
  return { locked: true, retryAfterSec };
}

/** Sisa percobaan PIN sebelum terkunci (tanpa menambah hitungan). */
export function pinAttemptsLeft(userId: string): number {
  return Math.max(0, PIN_MAX_FAILURES - peekCount(failKey(userId)));
}

/**
 * Verifikasi PIN milik user.
 * Dipakai endpoint ubah PIN dan (Fase 4) endpoint sign.
 * Kegagalan dicatat; keberhasilan mereset hitungan kegagalan.
 */
export async function verifyPin(
  userId: string,
  pin: string
): Promise<{ ok: boolean; locked: boolean; retryAfterSec?: number }> {
  const lock = isPinLocked(userId);
  if (lock.locked) return { ok: false, locked: true, retryAfterSec: lock.retryAfterSec };
  const profile = await prisma.esignProfile.findUnique({
    where: { userId },
    select: { pinHash: true },
  });
  if (!profile?.pinHash) return { ok: false, locked: false };
  let ok = false;
  try {
    ok = await bcrypt.compare(pin, profile.pinHash);
  } catch {
    ok = false;
  }
  if (ok) {
    resetRateLimit(failKey(userId));
    return { ok: true, locked: false };
  }
  const r = checkRateLimit(failKey(userId), PIN_MAX_FAILURES, PIN_LOCK_MS);
  if (!r.allowed) {
    return {
      ok: false,
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000)),
    };
  }
  return { ok: false, locked: false };
}
