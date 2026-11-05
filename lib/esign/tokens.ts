import { randomUUID } from 'node:crypto';

/** Masa berlaku default tautan tanda tangan: 7 hari. */
export const ESIGN_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Buat token akses penandatangan (acak, tidak mengandung info sensitif). */
export function createAccessToken(ttlMs: number = ESIGN_TOKEN_TTL_MS): {
  token: string;
  expiresAt: Date;
} {
  return { token: randomUUID(), expiresAt: new Date(Date.now() + ttlMs) };
}

/** Apakah token masih berlaku pada waktu tertentu. */
export function isTokenValid(tokenExpiresAt: Date | null | undefined, now = new Date()): boolean {
  if (!tokenExpiresAt) return false;
  return tokenExpiresAt.getTime() > now.getTime();
}

/** Field update Prisma untuk mencabut token akses (mengosongkan token). */
export function revokeTokenData(): { accessToken: null; tokenExpiresAt: null } {
  return { accessToken: null, tokenExpiresAt: null };
}
