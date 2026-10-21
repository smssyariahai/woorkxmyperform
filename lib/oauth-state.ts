import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

function secret(): string {
  return process.env.AUTH_SECRET || 'woork-dev-secret-change-me';
}

/** Buat state OAuth bertanda tangan (anti-CSRF). */
export function signState(payload: Record<string, string>): string {
  const data = Buffer.from(JSON.stringify({ ...payload, nonce: randomBytes(8).toString('hex') })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Verifikasi & baca state OAuth. Return null bila tidak valid. */
export function verifyState(state: string): Record<string, string> | null {
  try {
    const [data, sig] = state.split('.');
    if (!data || !sig) return null;
    const expected = createHmac('sha256', secret()).update(data).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(data, 'base64url').toString());
  } catch {
    return null;
  }
}

/** Enkripsi sederhana untuk token di cookie (bukan untuk data super sensitif). */
export function sealToken(value: string): string {
  const iv = randomBytes(12).toString('hex');
  const sig = createHmac('sha256', secret()).update(iv + '.' + value).digest('base64url');
  return `${iv}.${Buffer.from(value).toString('base64url')}.${sig}`;
}

export function unsealToken(sealed: string): string | null {
  try {
    const [iv, data, sig] = sealed.split('.');
    if (!iv || !data || !sig) return null;
    const value = Buffer.from(data, 'base64url').toString();
    const expected = createHmac('sha256', secret()).update(iv + '.' + value).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return value;
  } catch {
    return null;
  }
}
