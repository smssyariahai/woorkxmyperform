/**
 * Rate limiter in-memory (per proses) untuk endpoint sensitif E-Sign
 * (tanda tangan + percobaan PIN). Bukan pengganti WAF; cukup untuk
 * deployment satu proses saat ini.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxAttempts - 1, resetAt };
  }
  if (b.count >= maxAttempts) {
    return { allowed: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count += 1;
  return { allowed: true, remaining: maxAttempts - b.count, resetAt: b.resetAt };
}

/** Hapus bucket yang sudah kedaluwarsa (dipanggil berkala / manual). */
export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

/**
 * Cek tanpa menambah hitungan: apakah kunci ini sudah mencapai batas
 * (dipakai untuk lockout setelah N GAGAL berurutan, mis. percobaan PIN).
 */
export function peekRateLimit(
  key: string,
  maxAttempts: number
): { locked: boolean; resetAt?: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) return { locked: false };
  if (b.count >= maxAttempts) return { locked: true, resetAt: b.resetAt };
  return { locked: false, resetAt: b.resetAt };
}

/** Jumlah hitungan saat ini dalam jendela (0 bila tidak ada/kedaluwarsa). */
export function peekCount(key: string): number {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) return 0;
  return b.count;
}

/** Reset bucket (mis. setelah verifikasi berhasil — kegagalan lama dimaafkan). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
