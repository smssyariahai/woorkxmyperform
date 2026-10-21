import { prisma } from './db';

/**
 * Pengaturan global platform (Google OAuth, Cloudflare Turnstile, ...).
 * Hanya Administrator Pusat yang boleh mengubah via /api/admin/system-settings.
 * Nilai di-cache 60 detik di memori; di-invalidate setiap ada perubahan.
 */

export const SETTING_KEYS = [
  'google_client_id',
  'google_client_secret',
  'turnstile_site_key',
  'turnstile_secret_key',
  'ninerouter.enabled',
  'ninerouter.baseUrl',
  'ninerouter.apiKey',
  'ninerouter.model',
  'ninerouter.systemPrompt',
  'ninerouter.maxTokens',
  'ninerouter.timeoutMs',
  'ninerouter.fallbackMessage',
  'ninerouter.pricePerReply',
  'master.minBalance',
  'master.criticalBalance',
  'master.centerOrgId',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

let cache: Record<string, string> | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 60_000;

export async function getSystemSettings(): Promise<Record<string, string>> {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  const rows = await prisma.systemSetting.findMany();
  cache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cacheAt = Date.now();
  return cache;
}

export async function getSystemSetting(key: string): Promise<string> {
  const all = await getSystemSettings();
  return all[key] ?? '';
}

export function invalidateSettingsCache() {
  cache = null;
  cacheAt = 0;
}

export async function setSystemSettings(values: Partial<Record<SettingKey, string>>) {
  for (const key of SETTING_KEYS) {
    if (!(key in values)) continue;
    const value = (values[key] ?? '').trim();
    if (!value) {
      await prisma.systemSetting.deleteMany({ where: { key } });
    } else {
      await prisma.systemSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
  }
  invalidateSettingsCache();
}

/** Google Login aktif bila Client ID + Secret terisi (DB didahulukan, lalu env). */
export async function isGoogleLoginEnabled(): Promise<boolean> {
  const s = await getSystemSettings();
  const id = s.google_client_id || process.env.GOOGLE_CLIENT_ID || '';
  const secret = s.google_client_secret || process.env.GOOGLE_CLIENT_SECRET || '';
  return !!(id && secret);
}

/** Turnstile aktif bila Site Key + Secret Key terisi (DB didahulukan, lalu env). */
export async function getTurnstileKeys(): Promise<{ siteKey: string; secretKey: string }> {
  const s = await getSystemSettings();
  return {
    siteKey: s.turnstile_site_key || process.env.TURNSTILE_SITE_KEY || '',
    secretKey: s.turnstile_secret_key || process.env.TURNSTILE_SECRET_KEY || '',
  };
}

export async function isTurnstileEnabled(): Promise<boolean> {
  const { siteKey, secretKey } = await getTurnstileKeys();
  return !!(siteKey && secretKey);
}

/**
 * Verifikasi token Cloudflare Turnstile ke siteverify API.
 * Mengembalikan true bila valid (atau bila Turnstile tidak dikonfigurasi → nonaktif).
 */
export async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  const { secretKey } = await getTurnstileKeys();
  if (!secretKey) return true; // Turnstile tidak dipakai
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}
